import pytest

from app.services.reranker import RerankerService, _extract_json_block, _clamp_score


def test_extract_json_block_prefers_object():
    text = "some header\n{\"results\": [{\"id\": 1, \"score\": 0.5}]}\ntrailer"
    assert _extract_json_block(text) == "{\"results\": [{\"id\": 1, \"score\": 0.5}]}"


def test_extract_json_block_prefers_array():
    text = "prefix\n[{\"id\": 1, \"score\": 0.5}]\nsuffix"
    assert _extract_json_block(text) == "[{\"id\": 1, \"score\": 0.5}]"


@pytest.mark.parametrize(
    "value, expected",
    [
        (0, 0.0),
        (1, 1.0),
        (-1, 0.0),
        (2, 1.0),
        ("0.25", 0.25),
        ("bad", None),
    ],
)
def test_clamp_score(value, expected):
    assert _clamp_score(value) == expected


def test_rerank_items_uses_provider_scores(monkeypatch):
    monkeypatch.setenv("RAG_RERANK_ENABLED", "true")
    monkeypatch.setenv("RAG_RERANK_TOP_N", "3")

    svc = RerankerService()

    class FakeProvider:
        def score(self, query, passages, model_name):
            # Score by id in reverse order for the first 3 candidates.
            return {passages[0][0]: 0.1, passages[1][0]: 0.9, passages[2][0]: 0.5}

    monkeypatch.setattr(svc, "_get_provider", lambda: FakeProvider())

    items = [
        {"id": 1, "text": "alpha"},
        {"id": 2, "text": "beta"},
        {"id": 3, "text": "gamma"},
        {"id": 4, "text": "delta"},
    ]

    reranked, scores = svc.rerank_items(
        "test query",
        items,
        get_id=lambda x: x["id"],
        get_text=lambda x: x["text"],
    )

    assert scores[2] == 0.9
    assert [row["id"] for row in reranked] == [2, 3, 1, 4]


def test_rerank_items_falls_back_when_disabled(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_ENABLED", raising=False)

    svc = RerankerService()
    items = [{"id": 1, "text": "a"}, {"id": 2, "text": "b"}]
    reranked, scores = svc.rerank_items("q", items, get_id=lambda x: x["id"], get_text=lambda x: x["text"])
    assert reranked == items
    assert scores == {}

