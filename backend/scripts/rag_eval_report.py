#!/usr/bin/env python3
"""
CI-safe RAG evaluation report.

This intentionally avoids calling external services (Meilisearch/Qdrant/LLMs).
It replays a small, versioned dataset against Archon's *ranking logic*:
- search: retrieve -> fuse (RRF) -> rerank (stubbed scores) -> paginate
- chat: retrieve (stubbed) -> rerank (stubbed) -> top-k

Future work (RAG-P0-06): plug real retrieval + RAGAS/DeepEval when secrets/services are available.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple
import sys


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "backend" / "tests" / "rag_eval_dataset.json"
REPORT_MD = ROOT / "backend" / "rag_eval_report.md"
REPORT_JSON = ROOT / "backend" / "rag_eval_report.json"

# Make `backend/app` importable as `app.*` when invoked from repo root.
sys.path.insert(0, str(ROOT / "backend"))


def _rank_score(rank: int, k: int = 60) -> float:
    return 1 / (k + rank + 1)


def _env_on():
    # Force-enable reranker in this script (provider is stubbed).
    os.environ["RAG_RERANK_ENABLED"] = "true"
    os.environ.setdefault("RAG_RERANK_TOP_N", "50")
    # Make the backend importable/executable without requiring local secrets.
    os.environ.setdefault("DISABLE_AUTH", "true")
    os.environ.setdefault("GEMINI_API_KEY", "test-key")


@dataclass
class EvalOutcome:
    case_id: str
    expected: List[int]
    got: List[int]
    ok: bool


def _load_dataset() -> Dict[str, Any]:
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    if data.get("version") != 1:
        raise SystemExit(f"Unsupported dataset version: {data.get('version')}")
    return data


def _fuse_rrf(meili_hits: List[Dict[str, Any]], qdrant_hits: List[Dict[str, Any]], semantic_weight: float) -> List[Dict[str, Any]]:
    from app.api.search import reciprocal_rank_fusion

    keyword_weight = max(0.0, min(1.0, 1.0 - float(semantic_weight)))
    semantic_weight = max(0.0, min(1.0, float(semantic_weight)))

    if meili_hits and qdrant_hits:
        return reciprocal_rank_fusion(
            meili_hits,
            qdrant_hits,
            k=60,
            meilisearch_weight=keyword_weight,
            qdrant_weight=semantic_weight,
        )
    if meili_hits:
        return [
            {
                "document_id": r["id"],
                "file_path": r["file_path"],
                "file_name": r["file_name"],
                "file_type": r["file_type"],
                "score": keyword_weight * _rank_score(i),
                "from_meilisearch": True,
                "from_qdrant": False,
                "meilisearch_rank": i + 1,
                "qdrant_rank": None,
                "snippet": r.get("snippet", ""),
                "highlights": [],
            }
            for i, r in enumerate(meili_hits)
        ]
    if qdrant_hits:
        return [
            {
                "document_id": r["document_id"],
                "file_path": r["file_path"],
                "file_name": r["file_name"],
                "file_type": r["file_type"],
                "score": semantic_weight * _rank_score(i),
                "from_meilisearch": False,
                "from_qdrant": True,
                "meilisearch_rank": None,
                "qdrant_rank": i + 1,
                "snippet": r.get("chunk_text", ""),
                "highlights": [],
            }
            for i, r in enumerate(qdrant_hits)
        ]
    return []


def _rerank_with_stub(query: str, items: List[Dict[str, Any]], scores: Dict[int, float]) -> List[Dict[str, Any]]:
    from app.services.reranker import RerankerService

    reranker = RerankerService()

    class FakeProvider:
        def score(self, _query, passages, model_name):
            return {doc_id: float(scores.get(doc_id, 0.0)) for doc_id, _ in passages}

    reranker._gemini = FakeProvider()  # type: ignore[attr-defined]
    reranked, _ = reranker.rerank_items(
        query,
        items,
        get_id=lambda row: int(row.get("document_id", 0) or row.get("doc_id", 0)),
        get_text=lambda row: f'{row.get("file_name", "")}\n{row.get("snippet", row.get("chunk_text", ""))}',
    )
    return reranked


def _eval_search_case(case: Dict[str, Any]) -> EvalOutcome:
    fused = _fuse_rrf(case.get("meili_hits", []), case.get("qdrant_hits", []), case.get("semantic_weight", 0.5))
    scores = {int(k): float(v) for k, v in (case.get("rerank_scores") or {}).items()}
    reranked = _rerank_with_stub(case["query"], fused, scores)
    got = [row["document_id"] for row in reranked[: int(case.get("limit", 10))]]
    expected = [int(x) for x in case.get("expected_top_ids", [])]
    return EvalOutcome(case_id=case["id"], expected=expected, got=got, ok=(got == expected))


def _eval_chat_case(case: Dict[str, Any]) -> EvalOutcome:
    contexts = []
    for hit in case.get("qdrant_hits", []):
        contexts.append(
            {
                "document_id": hit["document_id"],
                "file_name": hit.get("file_name", "unknown"),
                "snippet": hit.get("chunk_text", ""),
            }
        )
    scores = {int(k): float(v) for k, v in (case.get("rerank_scores") or {}).items()}
    reranked = _rerank_with_stub(case["query"], contexts, scores)
    limit = int(case.get("context_limit", 8))
    top_k_out = int(case.get("top_k_out", 10))
    out_k = max(1, min(limit, top_k_out))
    got = [row["document_id"] for row in reranked[:out_k]]
    expected = [int(x) for x in case.get("expected_top_ids", [])]
    return EvalOutcome(case_id=case["id"], expected=expected, got=got, ok=(got == expected))


def main() -> int:
    _env_on()
    data = _load_dataset()

    search_outcomes = [_eval_search_case(c) for c in data.get("search_cases", [])]
    chat_outcomes = [_eval_chat_case(c) for c in data.get("chat_cases", [])]

    def summarize(outcomes: List[EvalOutcome]) -> Tuple[int, int]:
        total = len(outcomes)
        ok = sum(1 for o in outcomes if o.ok)
        return total, ok

    search_total, search_ok = summarize(search_outcomes)
    chat_total, chat_ok = summarize(chat_outcomes)

    report = {
        "dataset_version": data.get("version"),
        "search": {"total": search_total, "ok": search_ok, "pass_rate": (search_ok / search_total) if search_total else 1.0},
        "chat": {"total": chat_total, "ok": chat_ok, "pass_rate": (chat_ok / chat_total) if chat_total else 1.0},
        "cases": {
            "search": [o.__dict__ for o in search_outcomes],
            "chat": [o.__dict__ for o in chat_outcomes],
        },
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [
        "# Archon RAG Eval Report (CI-safe)",
        "",
        f"- Dataset: `backend/tests/rag_eval_dataset.json` (v{report['dataset_version']})",
        f"- Search cases: {search_ok}/{search_total} passed ({report['search']['pass_rate']:.0%})",
        f"- Chat cases: {chat_ok}/{chat_total} passed ({report['chat']['pass_rate']:.0%})",
        "",
        "## Failures",
        "",
    ]

    failures = [o for o in (search_outcomes + chat_outcomes) if not o.ok]
    if not failures:
        lines.append("- None")
    else:
        for o in failures:
            lines.append(f"- `{o.case_id}` expected={o.expected} got={o.got}")

    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Also print JSON for CI logs.
    print(json.dumps(report, indent=2))

    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
