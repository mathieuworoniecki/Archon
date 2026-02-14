from app.services.qdrant import mmr_rerank_candidates


def test_mmr_prefers_diversity_for_second_pick():
    candidates = [
        {"document_id": 1, "score": 0.99, "_vector": [1.0, 0.0]},
        {"document_id": 2, "score": 0.98, "_vector": [0.99, 0.01]},  # near-duplicate of doc 1
        {"document_id": 3, "score": 0.90, "_vector": [0.0, 1.0]},   # different direction
    ]

    ranked = mmr_rerank_candidates(candidates, limit=2, lambda_mult=0.5)
    ranked_ids = [row["document_id"] for row in ranked]

    assert ranked_ids[0] == 1
    assert ranked_ids[1] == 3


def test_mmr_falls_back_to_relevance_when_vectors_missing():
    candidates = [
        {"document_id": 10, "score": 0.7, "_vector": None},
        {"document_id": 11, "score": 0.9, "_vector": None},
        {"document_id": 12, "score": 0.8, "_vector": None},
    ]

    ranked = mmr_rerank_candidates(candidates, limit=3, lambda_mult=0.6)
    ranked_ids = [row["document_id"] for row in ranked]
    assert ranked_ids == [11, 12, 10]


def test_mmr_respects_limit_and_cleans_internal_fields():
    candidates = [
        {"document_id": 21, "score": 0.5, "_vector": [1.0, 0.0]},
        {"document_id": 22, "score": 0.4, "_vector": [0.0, 1.0]},
        {"document_id": 23, "score": 0.3, "_vector": [0.2, 0.8]},
    ]

    ranked = mmr_rerank_candidates(candidates, limit=1, lambda_mult=0.7)
    assert len(ranked) == 1
    assert "_vector" not in ranked[0]
    assert "_relevance" not in ranked[0]
