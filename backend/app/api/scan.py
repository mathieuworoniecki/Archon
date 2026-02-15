"""
Archon Backend - Scan API Routes
"""
from datetime import datetime, timezone
from typing import List, Optional
import hashlib
import threading
from contextlib import contextmanager
from collections import deque
from pathlib import Path
import itertools
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from celery.result import AsyncResult

from ..database import get_db
from ..models import Scan, ScanStatus, User
from ..schemas import ScanCreate, ScanOut, ScanProgress
from ..workers.celery_app import celery_app
from ..workers.tasks import run_scan
from ..utils.auth import get_current_user, require_role
from ..utils.paths import normalize_scan_path
from ..services.ocr import get_ocr_service, OCRService
from ..config import get_settings
from ..telemetry.request_context import get_request_id

router = APIRouter(prefix="/scan", tags=["scan"])
_scan_path_locks: dict[str, threading.Lock] = {}
_scan_path_locks_guard = threading.Lock()


def _raise_path_http_error(exc: Exception) -> None:
    """Map path validation errors to stable API responses."""
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (FileNotFoundError, NotADirectoryError)):
        raise HTTPException(status_code=400, detail=str(exc))
    raise HTTPException(status_code=400, detail=f"Invalid path: {exc}")


def _acquire_scan_path_lock(db: Session, normalized_path: str) -> None:
    """
    Serialize create-scan operations for the same path on PostgreSQL.

    Uses transaction-scoped advisory lock to avoid duplicate RUNNING/PENDING scans
    under concurrent requests.
    """
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return

    lock_key = int.from_bytes(
        hashlib.sha256(normalized_path.encode("utf-8")).digest()[:8],
        byteorder="big",
        signed=False,
    ) & 0x7FFF_FFFF_FFFF_FFFF

    db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})


def _acquire_local_scan_path_lock(normalized_path: str) -> threading.Lock:
    """
    Acquire an in-process lock for scan creation on the same normalized path.

    This protects SQLite/dev setups where advisory DB locks are unavailable.
    """
    with _scan_path_locks_guard:
        lock = _scan_path_locks.get(normalized_path)
        if lock is None:
            lock = threading.Lock()
            _scan_path_locks[normalized_path] = lock
    lock.acquire()
    return lock


@contextmanager
def _scan_creation_lock(db: Session, normalized_path: str):
    """
    Serialize create-scan requests for a given path.

    - Always use a local process lock (covers SQLite and single-process double clicks).
    - Also use PostgreSQL advisory locks when available (covers multi-process workers).
    """
    local_lock = _acquire_local_scan_path_lock(normalized_path)
    try:
        _acquire_scan_path_lock(db, normalized_path)
        yield
    finally:
        local_lock.release()


def estimate_scan_directory(
    root: Path,
    ocr_service: OCRService,
    *,
    max_seconds: float = 5.0,
    max_dirs: int = 10_000,
    max_depth: int = 32,
    max_stat_samples: int = 2_048,
) -> dict:
    """
    Estimate scan-eligible file count + size + type distribution on very large trees.

    Goals:
    - remain responsive (<~5s) even for millions of files
    - avoid severe under-estimation on leaf-heavy directory structures
    - keep the estimate consistent with the scan discovery logic (ocr_service.detect_type)
    """
    import os
    import time

    start = time.monotonic()
    deadline = start + max_seconds
    bfs_deadline = start + (max_seconds * 0.75)

    # Keep in sync with scan discovery filters.
    ignored_dirs = {
        ".git", "node_modules", "__pycache__", ".venv", "venv",
        ".pytest_cache", ".mypy_cache",
    }

    visited_dirs = 0
    deferred_depth_dirs = 0
    deep_dirs_visited = 0
    deep_subdirs = 0

    observed_files = 0
    observed_type_counts = {
        "pdf": 0,
        "image": 0,
        "text": 0,
        "video": 0,
        "email": 0,
    }

    non_empty_dirs = 0
    files_in_non_empty_dirs = 0

    size_sample_sum = 0
    size_sample_count = 0

    sampled = False
    sampled_reason: Optional[str] = None

    queue: deque[tuple[Path, int]] = deque([(root, 0)])

    while queue:
        now = time.monotonic()
        if now > bfs_deadline:
            sampled = True
            sampled_reason = sampled_reason or "max_time_reached"
            break
        if visited_dirs >= max_dirs:
            sampled = True
            sampled_reason = sampled_reason or "max_dirs_reached"
            break

        current_path, depth = queue.popleft()
        visited_dirs += 1

        dir_start_files = observed_files
        local_subdirs = 0

        try:
            with os.scandir(current_path) as entries:
                for entry in entries:
                    name = entry.name
                    if name.startswith("."):
                        continue

                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if name in ignored_dirs:
                                continue
                            local_subdirs += 1
                            if depth < max_depth:
                                queue.append((Path(entry.path), depth + 1))
                            else:
                                deferred_depth_dirs += 1
                                sampled = True
                                sampled_reason = sampled_reason or "max_depth_reached"
                            continue
                        if not entry.is_file(follow_symlinks=False):
                            continue
                    except (OSError, PermissionError):
                        continue

                    doc_type = ocr_service.detect_type(entry.path)
                    if doc_type.value not in observed_type_counts:
                        continue

                    observed_files += 1
                    observed_type_counts[doc_type.value] += 1

                    should_stat = (
                        size_sample_count < max_stat_samples
                        and (observed_files <= 1024 or observed_files % 64 == 0)
                    )
                    if should_stat:
                        try:
                            size_sample_sum += entry.stat(follow_symlinks=False).st_size
                            size_sample_count += 1
                        except (OSError, PermissionError):
                            pass
        except (OSError, PermissionError):
            continue

        if depth >= 1:
            deep_dirs_visited += 1
            deep_subdirs += local_subdirs

        eligible_delta = observed_files - dir_start_files
        if eligible_delta > 0:
            non_empty_dirs += 1
            files_in_non_empty_dirs += eligible_delta

    remaining_dirs = len(queue) + deferred_depth_dirs
    estimated_total_dirs = visited_dirs + remaining_dirs

    probe_dirs = 0
    probe_files = 0
    probe_subdirs = 0
    probe_non_empty_dirs = 0
    probe_files_in_non_empty_dirs = 0
    probe_type_counts = {k: 0 for k in observed_type_counts}

    # Probe a subset of unvisited directories to reduce underestimation on leaf-heavy trees.
    if sampled and queue and time.monotonic() < deadline:
        PROBE_SEEDS = 32
        PROBE_MAX_DIRS = 192
        PROBE_CHILDREN_PER_DIR = 8

        probe_queue: deque[tuple[Path, int]] = deque()
        left_budget = min(PROBE_SEEDS // 2, len(queue))
        right_budget = min(PROBE_SEEDS - left_budget, len(queue) - left_budget)
        for seed in itertools.islice(queue, left_budget):
            probe_queue.append(seed)
        if right_budget > 0:
            for seed in itertools.islice(reversed(queue), right_budget):
                probe_queue.append(seed)

        while probe_queue and probe_dirs < PROBE_MAX_DIRS and time.monotonic() < deadline:
            current_path, depth = probe_queue.popleft()
            probe_dirs += 1

            dir_start_probe_files = probe_files
            local_subdirs = 0
            child_dirs: list[Path] = []

            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        name = entry.name
                        if name.startswith("."):
                            continue

                        try:
                            if entry.is_dir(follow_symlinks=False):
                                if name in ignored_dirs:
                                    continue
                                local_subdirs += 1
                                if depth < max_depth and len(child_dirs) < PROBE_CHILDREN_PER_DIR:
                                    child_dirs.append(Path(entry.path))
                                continue
                            if not entry.is_file(follow_symlinks=False):
                                continue
                        except (OSError, PermissionError):
                            continue

                        doc_type = ocr_service.detect_type(entry.path)
                        if doc_type.value not in probe_type_counts:
                            continue

                        probe_files += 1
                        probe_type_counts[doc_type.value] += 1

                        should_stat = (
                            size_sample_count < max_stat_samples
                            and (probe_files <= 1024 or probe_files % 64 == 0)
                        )
                        if should_stat:
                            try:
                                size_sample_sum += entry.stat(follow_symlinks=False).st_size
                                size_sample_count += 1
                            except (OSError, PermissionError):
                                pass

            except (OSError, PermissionError):
                continue

            probe_subdirs += local_subdirs

            eligible_delta = probe_files - dir_start_probe_files
            if eligible_delta > 0:
                probe_non_empty_dirs += 1
                probe_files_in_non_empty_dirs += eligible_delta
            elif child_dirs and time.monotonic() < deadline:
                # Descend a bit to reach representative leaves.
                for child in child_dirs:
                    if probe_dirs + len(probe_queue) >= PROBE_MAX_DIRS:
                        break
                    probe_queue.append((child, depth + 1))

    # Estimate undiscovered directory count using observed fanout.
    branch_factor_bfs = (deep_subdirs / deep_dirs_visited) if deep_dirs_visited > 0 else 0.0
    branch_factor_probe = (probe_subdirs / probe_dirs) if probe_dirs > 0 else 0.0
    branch_factor = max(branch_factor_bfs, branch_factor_probe)
    if sampled and remaining_dirs > 0 and branch_factor > 0:
        if branch_factor < 1.0:
            extra_dirs = int(remaining_dirs * (branch_factor / max(0.001, 1.0 - branch_factor)))
        else:
            damped = min(8.0, branch_factor + (branch_factor * branch_factor * 0.35))
            extra_dirs = int(remaining_dirs * damped)
        estimated_total_dirs += max(0, extra_dirs)

    avg_files_per_dir = observed_files / max(1, visited_dirs)
    avg_non_empty = (
        files_in_non_empty_dirs / non_empty_dirs
        if non_empty_dirs > 0
        else avg_files_per_dir
    )
    bfs_density = max(
        avg_files_per_dir,
        (avg_files_per_dir * 0.7) + (avg_non_empty * 0.3),
    )

    density = bfs_density
    if probe_dirs > 0:
        probe_avg_files_per_dir = probe_files / max(1, probe_dirs)
        probe_avg_non_empty = (
            probe_files_in_non_empty_dirs / probe_non_empty_dirs
            if probe_non_empty_dirs > 0
            else probe_avg_files_per_dir
        )
        probe_density = max(
            probe_avg_files_per_dir,
            (probe_avg_files_per_dir * 0.7) + (probe_avg_non_empty * 0.3),
        )
        if bfs_density <= 0:
            density = probe_density
        else:
            density = max(density, (bfs_density * 0.6) + (probe_density * 0.4))

    estimated_files = observed_files
    if sampled:
        estimated_total_files = int(density * max(1, estimated_total_dirs))
        lower_bound = observed_files + int(remaining_dirs * max(1.0, density * 0.25))
        estimated_files = max(observed_files, estimated_total_files, lower_bound)

    # Type distribution for extrapolated files uses observed+probe as the sample.
    estimated_type_counts = dict(observed_type_counts)
    extra_files = max(0, estimated_files - observed_files)
    sample_type_counts = {k: observed_type_counts[k] + probe_type_counts.get(k, 0) for k in observed_type_counts}
    sample_total = sum(sample_type_counts.values())
    if extra_files > 0 and sample_total > 0:
        weighted = {k: (sample_type_counts[k] / sample_total) * extra_files for k in sample_type_counts}
        allocated = {k: int(weighted[k]) for k in weighted}
        remainder = extra_files - sum(allocated.values())
        if remainder > 0:
            by_frac = sorted(weighted.items(), key=lambda kv: (kv[1] - int(kv[1])), reverse=True)
            for i in range(remainder):
                allocated[by_frac[i % len(by_frac)][0]] += 1
        for k, v in allocated.items():
            estimated_type_counts[k] += v

    # Size estimate from sampled file stats.
    size_bytes = 0
    if size_sample_count > 0 and estimated_files > 0:
        avg_size = size_sample_sum / size_sample_count
        size_bytes = int(avg_size * estimated_files)

    return {
        "file_count": int(estimated_files),
        "observed_file_count": int(observed_files),
        "size_bytes": int(size_bytes),
        "type_counts": estimated_type_counts,
        "sampled": bool(sampled),
        "incomplete_reason": sampled_reason,
        "dirs_visited": int(visited_dirs),
    }


@router.post("/", response_model=ScanOut)
def create_scan(scan_in: ScanCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Create and launch a new scan.
    
    The scan runs in the background via Celery.
    """
    try:
        normalized_path = normalize_scan_path(scan_in.path)
    except Exception as exc:
        _raise_path_http_error(exc)
        raise  # pragma: no cover

    normalized_path_str = str(normalized_path)

    with _scan_creation_lock(db, normalized_path_str):
        # Reuse active scan instead of creating a concurrent duplicate.
        existing_active = db.query(Scan).filter(
            Scan.path == normalized_path_str,
            Scan.status.in_([ScanStatus.RUNNING, ScanStatus.PENDING]),
        ).order_by(Scan.created_at.desc()).first()
        if existing_active:
            return existing_active

        # Create scan record.
        scan = Scan(
            path=normalized_path_str,
            status=ScanStatus.PENDING,
            enable_embeddings=1 if scan_in.enable_embeddings else 0,
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)

    # Launch Celery task with embeddings option.
    try:
        task = run_scan.delay(
            scan.id,
            enable_embeddings=scan_in.enable_embeddings,
            request_id=get_request_id(),
        )
    except Exception as exc:
        scan.status = ScanStatus.FAILED
        scan.error_message = f"Failed to enqueue scan task: {exc}"
        scan.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=503, detail="Failed to enqueue scan task")

    # Update with task ID.
    scan.celery_task_id = task.id
    db.commit()
    db.refresh(scan)

    return scan


@router.post("/estimate")
def estimate_scan(path: str, current_user: User = Depends(get_current_user)):
    """
    Estimate scan costs and file count before launching.
    
    OPTIMIZED VERSION (Feb 2026):
    - Redis cache (TTL 5 minutes)
    - Single recursive pass (no duplicate traversal)
    - Time + directory safeguards on very large trees
    - Intelligent sampling for type distribution
    
    Target: < 5 seconds for 1.5M documents
    """
    import os
    import json
    import redis
    import time

    try:
        target_path = normalize_scan_path(path)
    except Exception as exc:
        _raise_path_http_error(exc)
        raise  # pragma: no cover

    normalized_path_str = str(target_path)
    try:
        root_stat = target_path.stat()
        root_signature = f"{normalized_path_str}:{root_stat.st_mtime_ns}:{root_stat.st_size}"
    except OSError:
        root_signature = normalized_path_str
    
    # ========================================
    # 1. CHECK REDIS CACHE
    # ========================================
    cache_key = f"scan_estimate:{hashlib.md5(root_signature.encode()).hexdigest()}"
    try:
        settings = get_settings()
        r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        cached = r.get(cache_key)
        if cached:
            result = json.loads(cached)
            result["cached"] = True
            return result
    except Exception:
        r = None  # Redis not available, continue without cache
    
    # ========================================
    # 2. FAST ESTIMATE (bounded) — consistent with scan discovery
    # ========================================
    ocr_service = get_ocr_service()
    stats = estimate_scan_directory(target_path, ocr_service)

    file_count = int(stats["file_count"])
    size_bytes = int(stats["size_bytes"])
    type_counts = stats["type_counts"]
    incomplete = bool(stats["sampled"])
    incomplete_reason = stats.get("incomplete_reason")
    
    # ========================================
    # 4. CALCULATE COSTS
    # ========================================
    estimated_tokens = file_count * 500
    PRICE_PER_MILLION = 0.15  # USD for Gemini embeddings
    estimated_cost_usd = (estimated_tokens / 1_000_000) * PRICE_PER_MILLION
    is_free_tier_ok = file_count < 100_000
    
    result = {
        "file_count": file_count,
        "size_mb": round(size_bytes / (1024 * 1024), 1),
        "type_counts": type_counts,
        "sampled": incomplete,
        "incomplete": incomplete,
        "incomplete_reason": incomplete_reason,
        "observed_file_count": stats.get("observed_file_count"),
        "dirs_visited": stats.get("dirs_visited"),
        "cached": False,
        "embedding_estimate": {
            "estimated_tokens": estimated_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 2),
            "free_tier_available": is_free_tier_ok,
            "free_tier_note": "Gemini offre un tier gratuit avec limites de débit" if is_free_tier_ok else "Volume élevé - tier payant recommandé"
        }
    }
    
    # ========================================
    # 5. CACHE RESULT
    # ========================================
    if r:
        try:
            r.setex(cache_key, 300, json.dumps(result))  # TTL 5 minutes
        except Exception:
            pass
    
    return result


@router.get("/", response_model=List[ScanOut])
def list_scans(
    skip: int = 0,
    limit: int = 20,
    status: Optional[ScanStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all scans with optional status filter."""
    query = db.query(Scan)
    
    if status:
        query = query.filter(Scan.status == status)
    
    scans = query.order_by(Scan.created_at.desc()).offset(skip).limit(limit).all()
    return scans


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get scan details including errors."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/progress", response_model=ScanProgress)
def get_scan_progress(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get real-time scan progress from Celery task."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    progress_data = {
        "scan_id": scan_id,
        "status": scan.status,
        "total_files": scan.total_files,
        "processed_files": scan.processed_files,
        "failed_files": scan.failed_files,
        "current_file": None,
        "progress_percent": 0.0
    }
    
    # Get Celery task state if running
    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
        result = AsyncResult(scan.celery_task_id, app=celery_app)
        if result.state == "PROGRESS" and result.info:
            progress_data["current_file"] = result.info.get("current_file")
            progress_data["progress_percent"] = result.info.get("progress", 0.0)
    
    # Calculate progress percent from DB if not from Celery
    if progress_data["progress_percent"] == 0 and scan.total_files > 0:
        progress_data["progress_percent"] = (scan.processed_files / scan.total_files) * 100
    
    return ScanProgress(**progress_data)


@router.get("/{scan_id}/stream")
async def stream_scan_progress(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Stream real-time scan progress via Server-Sent Events (SSE).
    
    Yields enriched progress updates every 1.5 seconds until scan completes.
    Includes: phase, speed, ETA, file type breakdown, recent activity.
    """
    from fastapi.responses import StreamingResponse
    from ..database import SessionLocal
    import asyncio
    import json
    import time
    
    # Verify scan exists
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    async def event_generator():
        """Generate SSE events for scan progress."""
        stream_start = time.time()
        
        try:
            while True:
                session = SessionLocal()
                try:
                    scan = session.query(Scan).filter(Scan.id == scan_id).first()
                    if not scan:
                        yield f"event: error\ndata: {json.dumps({'error': 'Scan not found'})}\n\n"
                        break
                    
                    # Base progress data
                    now = time.time()
                    elapsed = int(now - stream_start)
                    
                    # Use scan.started_at for total elapsed if available
                    if scan.started_at:
                        started = scan.started_at
                        # Ensure consistent tz: if started_at is naive, treat as UTC
                        if started.tzinfo is None:
                            started = started.replace(tzinfo=timezone.utc)
                        total_elapsed = int((datetime.now(timezone.utc) - started).total_seconds())
                    else:
                        total_elapsed = elapsed
                    
                    progress_data = {
                        "scan_id": scan_id,
                        "status": scan.status.value,
                        "total_files": scan.total_files,
                        "processed_files": scan.processed_files,
                        "failed_files": scan.failed_files,
                        "current_file": None,
                        "progress_percent": 0.0,
                        "phase": "idle",
                        "files_per_second": 0.0,
                        "eta_seconds": None,
                        "elapsed_seconds": total_elapsed,
                        "type_counts": None,
                        "recent_files": [],
                        "current_file_type": None,
                        "skipped_files": 0,
                        "skipped_details": [],
                        "recent_errors": []
                    }
                    
                    # Get Celery task state if running
                    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
                        try:
                            result = AsyncResult(scan.celery_task_id, app=celery_app)
                            if result.state == "PROGRESS" and result.info:
                                info = result.info
                                progress_data["current_file"] = info.get("current_file")
                                progress_data["progress_percent"] = info.get("progress", 0.0)
                                progress_data["phase"] = info.get("phase", "processing")
                                progress_data["current_file_type"] = info.get("current_file_type")
                                progress_data["recent_files"] = info.get("recent_files", [])
                                progress_data["skipped_files"] = info.get("skipped", 0)
                                progress_data["type_counts"] = info.get("type_counts")
                                progress_data["skipped_details"] = info.get("skipped_details", [])
                                progress_data["recent_errors"] = info.get("recent_errors", [])
                        except Exception:
                            pass
                    
                    # Calculate progress percent from DB if not from Celery
                    if progress_data["progress_percent"] == 0 and scan.total_files > 0:
                        progress_data["progress_percent"] = (scan.processed_files / scan.total_files) * 100
                    
                    # Determine phase from status if not set by Celery
                    if progress_data["phase"] == "idle":
                        if scan.status == ScanStatus.RUNNING:
                            if scan.processed_files == 0 and scan.total_files > 0:
                                progress_data["phase"] = "detection"
                            elif scan.processed_files > 0:
                                progress_data["phase"] = "processing"
                        elif scan.status == ScanStatus.COMPLETED:
                            progress_data["phase"] = "complete"
                    
                    # Compute speed — true average from elapsed time
                    current_processed = scan.processed_files
                    
                    # True average speed = total processed / total time
                    avg_speed = 0.0
                    if total_elapsed > 0 and current_processed > 0:
                        avg_speed = current_processed / total_elapsed
                        progress_data["files_per_second"] = round(avg_speed, 1)
                    
                    # ETA from true average speed (consistent with displayed speed)
                    remaining = scan.total_files - current_processed
                    if avg_speed > 0 and remaining > 0:
                        progress_data["eta_seconds"] = int(remaining / avg_speed)
                    
                    # Send SSE event
                    yield f"event: progress\ndata: {json.dumps(progress_data)}\n\n"
                    
                    # Stop streaming if scan is done
                    if scan.status in [ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED]:
                        # Ensure UI stepper reaches a terminal state even on failure/cancel.
                        progress_data["phase"] = "complete"
                        yield f"event: complete\ndata: {json.dumps(progress_data)}\n\n"
                        break
                        
                finally:
                    session.close()
                
                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            pass  # Client disconnected
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.delete("/{scan_id}")
def delete_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin", "analyst"))):
    """Delete a scan and its documents."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Cancel Celery task if running
    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    # Delete from search indices
    from ..services.meilisearch import get_meilisearch_service
    from ..services.qdrant import get_qdrant_service
    
    try:
        meili_service = get_meilisearch_service()
        meili_service.delete_by_scan(scan_id)
    except Exception:
        pass
    
    try:
        qdrant_service = get_qdrant_service()
        qdrant_service.delete_by_scan(scan_id)
    except Exception:
        pass
    
    # Delete from database (cascade deletes documents and errors)
    db.delete(scan)
    db.commit()
    
    return {"status": "deleted", "scan_id": scan_id}


from pydantic import BaseModel as PydanticBaseModel


class ScanRenameRequest(PydanticBaseModel):
    label: str


@router.patch("/{scan_id}/rename")
def rename_scan(scan_id: int, body: ScanRenameRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Rename a scan with a user-friendly label."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan.label = body.label.strip() or None
    db.commit()
    
    return {"status": "renamed", "scan_id": scan_id, "label": scan.label}


@router.post("/{scan_id}/cancel")
def cancel_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Cancel a running scan."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != ScanStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Scan is not running")
    
    # Cancel Celery task
    if scan.celery_task_id:
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    # Update status
    scan.status = ScanStatus.CANCELLED
    db.commit()
    
    return {"status": "cancelled", "scan_id": scan_id}


@router.post("/{scan_id}/resume", response_model=ScanOut)
def resume_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Resume an interrupted or failed scan.
    
    Continues processing from where it left off.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Re-validate persisted path before resuming any background task.
    try:
        scan.path = str(normalize_scan_path(scan.path))
    except Exception as exc:
        _raise_path_http_error(exc)
        raise  # pragma: no cover
    
    # Only allow resume for failed, cancelled, or interrupted scans
    if scan.status not in [ScanStatus.FAILED, ScanStatus.CANCELLED]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot resume scan with status: {scan.status.value}"
        )
    
    # Cancel any other running/pending scans for the same project path
    other_running = db.query(Scan).filter(
        Scan.path == scan.path,
        Scan.id != scan.id,
        Scan.status.in_([ScanStatus.RUNNING, ScanStatus.PENDING])
    ).all()
    for other in other_running:
        other.status = ScanStatus.CANCELLED
        if other.celery_task_id:
            try:
                from app.workers.celery_app import celery_app
                celery_app.control.revoke(other.celery_task_id, terminate=True)
            except Exception:
                pass
    
    # Reset status to pending
    scan.status = ScanStatus.PENDING
    db.commit()
    
    # Launch Celery task with resume flag + embeddings option
    task = run_scan.delay(
        scan.id,
        resume=True,
        enable_embeddings=bool(scan.enable_embeddings),
        request_id=get_request_id(),
    )
    
    # Update with new task ID
    scan.celery_task_id = task.id
    scan.status = ScanStatus.RUNNING
    db.commit()
    db.refresh(scan)
    
    return scan


@router.get("/interrupted", response_model=List[ScanOut])
def list_interrupted_scans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all scans that can be resumed (failed or cancelled)."""
    scans = db.query(Scan).filter(
        Scan.status.in_([ScanStatus.FAILED, ScanStatus.CANCELLED])
    ).order_by(Scan.created_at.desc()).all()
    return scans


@router.post("/factory-reset")
def factory_reset(db: Session = Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """
    Factory reset — delete ALL data.
    Kills running tasks, clears database, MeiliSearch, Qdrant, and Redis.
    """
    from ..models import Document
    from ..services.meilisearch import get_meilisearch_service
    from ..services.qdrant import get_qdrant_service
    import time
    import signal
    
    # ── 1. Kill running Celery tasks (SIGKILL for immediate termination) ──
    running_scans = db.query(Scan).filter(Scan.status == ScanStatus.RUNNING).all()
    task_ids = []
    for scan in running_scans:
        if scan.celery_task_id:
            task_ids.append(scan.celery_task_id)
            try:
                celery_app.control.revoke(
                    scan.celery_task_id, 
                    terminate=True, 
                    signal=signal.SIGKILL
                )
            except Exception:
                pass
    
    # Purge any pending tasks from the queue
    try:
        celery_app.control.purge()
    except Exception:
        pass
    
    # Brief wait for task termination to prevent race conditions
    if task_ids:
        time.sleep(1.5)
    
    # ── 2. Count before deleting ──
    scan_count = db.query(Scan).count()
    doc_count = db.query(Document).count()
    
    # ── 3. Fast cascading delete via raw SQL (100x faster than ORM) ──
    try:
        db.execute(text("DELETE FROM favorite_tags"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM favorites"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM entities"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM scan_errors"))
    except Exception:
        pass
    db.execute(text("DELETE FROM documents"))
    db.execute(text("DELETE FROM scans"))
    db.commit()
    
    # ── 4. Clear MeiliSearch ──
    try:
        meili = get_meilisearch_service()
        meili.client.index("documents").delete_all_documents()
    except Exception:
        pass
    
    # ── 5. Clear Qdrant (delete + recreate collection) ──
    try:
        qdrant = get_qdrant_service()
        qdrant.client.delete_collection("documents")
        # Recreate the collection so future scans don't need to
        from qdrant_client.models import VectorParams, Distance
        qdrant.client.create_collection(
            collection_name="documents",
            vectors_config=VectorParams(size=3072, distance=Distance.COSINE),
        )
    except Exception:
        pass
    
    # ── 6. Clear Redis caches ──
    try:
        import redis
        r = redis.from_url("redis://redis:6379/0")
        for key in r.scan_iter("scan_estimate:*"):
            r.delete(key)
        # Also clear Celery result backend
        for key in r.scan_iter("celery-task-meta-*"):
            r.delete(key)
    except Exception:
        pass
    
    return {
        "status": "reset_complete",
        "deleted_scans": scan_count,
        "deleted_documents": doc_count
    }
