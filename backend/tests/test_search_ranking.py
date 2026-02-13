"""
Archon Backend - Hybrid search ranking weight tests.
"""
from app.api.search import reciprocal_rank_fusion


def _sample_meilisearch_results():
    return [
        {
            "id": 1,
            "file_path": "/docs/a.pdf",
            "file_name": "a.pdf",
            "file_type": "pdf",
            "snippet": "alpha",
            "match_positions": {},
        },
        {
            "id": 2,
            "file_path": "/docs/b.pdf",
            "file_name": "b.pdf",
            "file_type": "pdf",
            "snippet": "beta",
            "match_positions": {},
        },
    ]


def _sample_qdrant_results():
    # Inverse ranking vs Meilisearch to verify weight influence.
    return [
        {
            "document_id": 2,
            "file_path": "/docs/b.pdf",
            "file_name": "b.pdf",
            "file_type": "pdf",
            "chunk_text": "beta",
        },
        {
            "document_id": 1,
            "file_path": "/docs/a.pdf",
            "file_name": "a.pdf",
            "file_type": "pdf",
            "chunk_text": "alpha",
        },
    ]


def _score_by_doc(results):
    return {row["document_id"]: row["score"] for row in results}


def test_rrf_prefers_keyword_when_semantic_weight_is_low():
    results = reciprocal_rank_fusion(
        _sample_meilisearch_results(),
        _sample_qdrant_results(),
        meilisearch_weight=0.9,
        qdrant_weight=0.1,
    )
    scores = _score_by_doc(results)
    assert scores[1] > scores[2]


def test_rrf_prefers_semantic_when_semantic_weight_is_high():
    results = reciprocal_rank_fusion(
        _sample_meilisearch_results(),
        _sample_qdrant_results(),
        meilisearch_weight=0.1,
        qdrant_weight=0.9,
    )
    scores = _score_by_doc(results)
    assert scores[2] > scores[1]


def test_rrf_score_delta_changes_monotonically_with_semantic_weight():
    deltas = []
    for semantic_weight in [0.0, 0.25, 0.5, 0.75, 1.0]:
        keyword_weight = 1.0 - semantic_weight
        results = reciprocal_rank_fusion(
            _sample_meilisearch_results(),
            _sample_qdrant_results(),
            meilisearch_weight=keyword_weight,
            qdrant_weight=semantic_weight,
        )
        scores = _score_by_doc(results)
        deltas.append(scores[2] - scores[1])

    assert deltas == sorted(deltas)
    assert deltas[0] < 0 < deltas[-1]
