"""
Prometheus-style metrics for API + worker observability.

This module keeps in-process counters and also mirrors counters into Redis
best-effort so API and Celery processes can expose a shared view.
"""
from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
import json
from threading import Lock
from typing import Dict, Iterable, Tuple

from ..config import get_settings

settings = get_settings()

_LOCK = Lock()

_REQUEST_TOTAL = defaultdict(float)  # key: (method, route, status)
_REQUEST_LATENCY_BUCKET = defaultdict(float)  # key: (method, route, le)
_REQUEST_LATENCY_SUM = defaultdict(float)  # key: (method, route)
_REQUEST_LATENCY_COUNT = defaultdict(float)  # key: (method, route)

_WORKER_TASK_TOTAL = defaultdict(float)  # key: (task, status)
_WORKER_TASK_DURATION_SUM = defaultdict(float)  # key: (task, status)
_WORKER_TASK_DURATION_COUNT = defaultdict(float)  # key: (task, status)
_WORKER_PHASE_TOTAL = defaultdict(float)  # key: (task, phase, status)

_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]


@lru_cache(maxsize=1)
def _get_redis():
    try:
        import redis

        return redis.from_url(settings.redis_url, decode_responses=True)
    except Exception:
        return None


def _redis_hincrbyfloat(metric_key: str, labels: Dict[str, str], increment: float) -> None:
    redis_client = _get_redis()
    if redis_client is None:
        return
    try:
        field = json.dumps(labels, sort_keys=True, separators=(",", ":"))
        redis_client.hincrbyfloat(metric_key, field, increment)
    except Exception:
        # Metrics should never break runtime paths.
        pass


def _redis_hgetall(metric_key: str) -> Dict[str, float]:
    redis_client = _get_redis()
    if redis_client is None:
        return {}
    try:
        raw = redis_client.hgetall(metric_key)
        return {k: float(v) for k, v in raw.items()}
    except Exception:
        return {}


def _labels_from_field(field: str) -> Dict[str, str] | None:
    try:
        data = json.loads(field)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return {str(k): str(v) for k, v in data.items()}


def _append_counter_lines(
    lines: list[str],
    metric: str,
    label_names: Tuple[str, ...],
    local_items: Iterable[Tuple[Tuple[str, ...], float]],
    redis_key: str,
) -> None:
    merged_values: dict[Tuple[str, ...], float] = defaultdict(float)

    for labels_tuple, value in local_items:
        merged_values[labels_tuple] += value

    for field, value in _redis_hgetall(redis_key).items():
        labels = _labels_from_field(field)
        if labels is None:
            continue
        labels_tuple = tuple(labels.get(label_name, "unknown") for label_name in label_names)
        merged_values[labels_tuple] += value

    for labels_tuple, value in sorted(merged_values.items()):
        labels_str = ",".join(
            f'{label_name}="{label_value}"'
            for label_name, label_value in zip(label_names, labels_tuple, strict=True)
        )
        lines.append(f"{metric}{{{labels_str}}} {value}")


def record_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    method = method.upper()
    status = str(status_code)
    route = route or "unknown"
    with _LOCK:
        _REQUEST_TOTAL[(method, route, status)] += 1.0
        _REQUEST_LATENCY_SUM[(method, route)] += duration_seconds
        _REQUEST_LATENCY_COUNT[(method, route)] += 1.0
        for bucket in _BUCKETS:
            if duration_seconds <= bucket:
                _REQUEST_LATENCY_BUCKET[(method, route, str(bucket))] += 1.0
        if duration_seconds > _BUCKETS[-1]:
            _REQUEST_LATENCY_BUCKET[(method, route, "+Inf")] += 1.0

    _redis_hincrbyfloat(
        "archon_metric:http_requests_total",
        {"method": method, "route": route, "status": status},
        1.0,
    )
    _redis_hincrbyfloat(
        "archon_metric:http_request_duration_seconds_sum",
        {"method": method, "route": route},
        duration_seconds,
    )
    _redis_hincrbyfloat(
        "archon_metric:http_request_duration_seconds_count",
        {"method": method, "route": route},
        1.0,
    )
    for bucket in _BUCKETS:
        if duration_seconds <= bucket:
            _redis_hincrbyfloat(
                "archon_metric:http_request_duration_seconds_bucket",
                {"method": method, "route": route, "le": str(bucket)},
                1.0,
            )
    if duration_seconds > _BUCKETS[-1]:
        _redis_hincrbyfloat(
            "archon_metric:http_request_duration_seconds_bucket",
            {"method": method, "route": route, "le": "+Inf"},
            1.0,
        )


def record_worker_task(task_name: str, status: str, duration_seconds: float) -> None:
    task_name = task_name or "unknown"
    status = status or "unknown"
    with _LOCK:
        _WORKER_TASK_TOTAL[(task_name, status)] += 1.0
        _WORKER_TASK_DURATION_SUM[(task_name, status)] += duration_seconds
        _WORKER_TASK_DURATION_COUNT[(task_name, status)] += 1.0

    _redis_hincrbyfloat(
        "archon_metric:worker_tasks_total",
        {"task": task_name, "status": status},
        1.0,
    )
    _redis_hincrbyfloat(
        "archon_metric:worker_task_duration_seconds_sum",
        {"task": task_name, "status": status},
        duration_seconds,
    )
    _redis_hincrbyfloat(
        "archon_metric:worker_task_duration_seconds_count",
        {"task": task_name, "status": status},
        1.0,
    )


def record_worker_phase(task_name: str, phase: str, status: str = "ok") -> None:
    task_name = task_name or "unknown"
    phase = phase or "unknown"
    status = status or "unknown"
    with _LOCK:
        _WORKER_PHASE_TOTAL[(task_name, phase, status)] += 1.0
    _redis_hincrbyfloat(
        "archon_metric:worker_phase_total",
        {"task": task_name, "phase": phase, "status": status},
        1.0,
    )


def render_prometheus() -> str:
    lines = [
        "# HELP archon_http_requests_total Total HTTP requests by method, route and status.",
        "# TYPE archon_http_requests_total counter",
    ]

    with _LOCK:
        _append_counter_lines(
            lines,
            "archon_http_requests_total",
            ("method", "route", "status"),
            _REQUEST_TOTAL.items(),
            "archon_metric:http_requests_total",
        )

        lines.extend(
            [
                "# HELP archon_http_request_duration_seconds HTTP request duration in seconds.",
                "# TYPE archon_http_request_duration_seconds histogram",
            ]
        )
        _append_counter_lines(
            lines,
            "archon_http_request_duration_seconds_sum",
            ("method", "route"),
            _REQUEST_LATENCY_SUM.items(),
            "archon_metric:http_request_duration_seconds_sum",
        )
        _append_counter_lines(
            lines,
            "archon_http_request_duration_seconds_count",
            ("method", "route"),
            _REQUEST_LATENCY_COUNT.items(),
            "archon_metric:http_request_duration_seconds_count",
        )
        _append_counter_lines(
            lines,
            "archon_http_request_duration_seconds_bucket",
            ("method", "route", "le"),
            _REQUEST_LATENCY_BUCKET.items(),
            "archon_metric:http_request_duration_seconds_bucket",
        )

        lines.extend(
            [
                "# HELP archon_worker_tasks_total Total worker task executions by task and status.",
                "# TYPE archon_worker_tasks_total counter",
            ]
        )
        _append_counter_lines(
            lines,
            "archon_worker_tasks_total",
            ("task", "status"),
            _WORKER_TASK_TOTAL.items(),
            "archon_metric:worker_tasks_total",
        )

        lines.extend(
            [
                "# HELP archon_worker_task_duration_seconds Worker task duration in seconds.",
                "# TYPE archon_worker_task_duration_seconds counter",
            ]
        )
        _append_counter_lines(
            lines,
            "archon_worker_task_duration_seconds_sum",
            ("task", "status"),
            _WORKER_TASK_DURATION_SUM.items(),
            "archon_metric:worker_task_duration_seconds_sum",
        )
        _append_counter_lines(
            lines,
            "archon_worker_task_duration_seconds_count",
            ("task", "status"),
            _WORKER_TASK_DURATION_COUNT.items(),
            "archon_metric:worker_task_duration_seconds_count",
        )

        lines.extend(
            [
                "# HELP archon_worker_phase_total Total worker phase transitions by task, phase and status.",
                "# TYPE archon_worker_phase_total counter",
            ]
        )
        _append_counter_lines(
            lines,
            "archon_worker_phase_total",
            ("task", "phase", "status"),
            _WORKER_PHASE_TOTAL.items(),
            "archon_metric:worker_phase_total",
        )

    lines.append("")
    return "\n".join(lines)
