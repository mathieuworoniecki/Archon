"""
Archon Backend - Reranker Service

Feature-flagged cross-encoder-style reranking using Gemini.

Goal: improve retrieval precision by re-ordering the top-N candidates based on
query + passage relevance (grounded, forensic-friendly).
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Callable, Dict, Generic, List, Optional, Sequence, Tuple, TypeVar

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

try:
    from google import genai as google_genai
    from google.genai import types as google_genai_types
except Exception:  # pragma: no cover - fallback path for legacy environments
    google_genai = None
    google_genai_types = None

legacy_genai = None

T = TypeVar("T")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except Exception:
        return default


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip() or default


def _extract_json_block(text: str) -> Optional[str]:
    """
    Extract the first plausible JSON object/array from a model response.
    Keeps this lenient to tolerate minor formatting.
    """
    if not text:
        return None
    s = text.strip()
    if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
        return s

    first_obj = s.find("{")
    first_arr = s.find("[")

    # Prefer arrays when the response appears to be a top-level JSON array.
    if first_arr != -1 and (first_obj == -1 or first_arr < first_obj):
        arr_start = first_arr
        arr_end = s.rfind("]")
        if arr_end != -1 and arr_end > arr_start:
            return s[arr_start : arr_end + 1]

    obj_start = s.find("{")
    obj_end = s.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        return s[obj_start : obj_end + 1]

    arr_start = s.find("[")
    arr_end = s.rfind("]")
    if arr_start != -1 and arr_end != -1 and arr_end > arr_start:
        return s[arr_start : arr_end + 1]

    return None


def _clamp_score(value: Any) -> Optional[float]:
    try:
        score = float(value)
    except Exception:
        return None
    if score != score:  # NaN guard
        return None
    if score < 0.0:
        return 0.0
    if score > 1.0:
        return 1.0
    return score


class GeminiReranker:
    def __init__(self):
        global legacy_genai
        self._use_legacy_sdk = False

        if google_genai is not None:
            self.client = google_genai.Client(api_key=settings.gemini_api_key)
        else:
            if legacy_genai is None:
                try:
                    import google.generativeai as legacy_genai_module

                    legacy_genai = legacy_genai_module
                except Exception as exc:
                    raise RuntimeError("No Gemini SDK available. Install google-genai.") from exc
            self._use_legacy_sdk = True
            legacy_genai.configure(api_key=settings.gemini_api_key)
            logger.warning("google-genai unavailable, falling back to deprecated google-generativeai SDK")

    def _generate_json(self, prompt: str, model_name: str) -> str:
        if self._use_legacy_sdk:
            model = legacy_genai.GenerativeModel(model_name)
            resp = model.generate_content(prompt, generation_config={"temperature": 0})
            return getattr(resp, "text", "") or ""

        # Prefer JSON output when supported.
        config = None
        if google_genai_types is not None and hasattr(google_genai_types, "GenerateContentConfig"):
            config = google_genai_types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
            )

        resp = self.client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config,
        )
        return getattr(resp, "text", "") or ""

    def score(self, query: str, passages: Sequence[Tuple[int, str]], model_name: str) -> Dict[int, float]:
        candidate_lines: List[str] = []
        for doc_id, text in passages:
            candidate_lines.append(f'- {{"id": {int(doc_id)}, "text": {json.dumps(text)}}}')

        prompt = (
            "You are a relevance reranker for digital investigation.\n"
            "Task: Given a user query and candidate snippets, assign a relevance score in [0, 1]\n"
            "for each candidate. Higher means more relevant to answering the query.\n"
            "Return ONLY valid JSON in this exact schema:\n"
            '{"results":[{"id":123,"score":0.0}]}\n'
            "- Include every id exactly once.\n"
            "- No extra keys and no commentary.\n\n"
            f"Query:\n{query}\n\n"
            "Candidates (JSONL-like):\n"
            + "\n".join(candidate_lines)
            + "\n"
        )

        raw = self._generate_json(prompt, model_name=model_name)
        json_block = _extract_json_block(raw)
        if not json_block:
            return {}

        try:
            parsed = json.loads(json_block)
        except Exception:
            return {}

        results = parsed.get("results") if isinstance(parsed, dict) else parsed
        if not isinstance(results, list):
            return {}

        scores: Dict[int, float] = {}
        for row in results:
            if not isinstance(row, dict):
                continue
            doc_id = row.get("id")
            if not isinstance(doc_id, int):
                try:
                    doc_id = int(doc_id)
                except Exception:
                    continue
            score = _clamp_score(row.get("score"))
            if score is None:
                continue
            scores[doc_id] = score
        return scores


class RerankerService(Generic[T]):
    """
    High-level service:
    - reads feature flags at runtime (hot-disable),
    - scores top-N candidates,
    - reorders candidates stably.
    """

    _MAX_CHARS_PER_PASSAGE = 900

    def __init__(self):
        self._gemini: Optional[GeminiReranker] = None

    def is_enabled(self) -> bool:
        enabled = _env_bool("RAG_RERANK_ENABLED", settings.rag_rerank_enabled)
        return bool(enabled and settings.gemini_api_key)

    def top_n(self) -> int:
        return max(0, _env_int("RAG_RERANK_TOP_N", settings.rag_rerank_top_n))

    def top_k_out(self) -> int:
        return max(0, _env_int("RAG_RERANK_TOP_K_OUT", settings.rag_rerank_top_k_out))

    def model_name(self) -> str:
        return _env_str("RAG_RERANK_MODEL", settings.rag_rerank_model)

    def _get_provider(self) -> GeminiReranker:
        if self._gemini is None:
            self._gemini = GeminiReranker()
        return self._gemini

    def rerank_items(
        self,
        query: str,
        items: List[T],
        *,
        get_id: Callable[[T], int],
        get_text: Callable[[T], str],
        top_n: Optional[int] = None,
    ) -> Tuple[List[T], Dict[int, float]]:
        """
        Returns (reranked_items, scores_by_id). When reranking is disabled/fails, returns (items, {}).
        """
        if not self.is_enabled() or not query or len(items) < 2:
            return items, {}

        top_n = self.top_n() if top_n is None else max(0, int(top_n))
        if top_n <= 1:
            return items, {}

        subset = items[: min(top_n, len(items))]
        passage_pairs: List[Tuple[int, str]] = []
        for item in subset:
            doc_id = int(get_id(item))
            text = (get_text(item) or "").strip()
            if len(text) > self._MAX_CHARS_PER_PASSAGE:
                text = text[: self._MAX_CHARS_PER_PASSAGE]
            passage_pairs.append((doc_id, text))

        provider = self._get_provider()
        model_name = self.model_name()
        started = time.perf_counter()
        try:
            scores = provider.score(query, passages=passage_pairs, model_name=model_name)
        except Exception as exc:
            logger.error("Rerank failed: %s", exc)
            return items, {}
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "Rerank %s: enabled=%s candidates=%s elapsed_ms=%.1f",
                model_name,
                True,
                len(passage_pairs),
                elapsed_ms,
            )

        if not scores:
            return items, {}

        original_pos = {int(get_id(item)): idx for idx, item in enumerate(subset)}

        def sort_key(item: T):
            doc_id = int(get_id(item))
            score = scores.get(doc_id, -1.0)
            return (score, -original_pos.get(doc_id, 0))

        reranked_subset = sorted(subset, key=sort_key, reverse=True)
        return reranked_subset + items[len(subset) :], scores


_reranker_service: Optional[RerankerService[Any]] = None


def get_reranker_service() -> RerankerService[Any]:
    global _reranker_service
    if _reranker_service is None:
        _reranker_service = RerankerService()
    return _reranker_service
