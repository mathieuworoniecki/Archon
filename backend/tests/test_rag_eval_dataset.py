import json
from pathlib import Path

from app.services.reranker import RerankerService
from app.services.ai_chat import AIChatService


DATASET_PATH = Path(__file__).with_name("rag_eval_dataset.json")


def _load_dataset():
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    assert data.get("version") == 1
    assert isinstance(data.get("search_cases"), list)
    assert isinstance(data.get("chat_cases"), list)
    return data


def test_rag_eval_dataset_schema():
    data = _load_dataset()
    ids = set()
    for section in ("search_cases", "chat_cases"):
        for case in data[section]:
            assert "id" in case
            assert case["id"] not in ids
            ids.add(case["id"])
            assert "query" in case and isinstance(case["query"], str) and case["query"].strip()


def test_search_cases_reranked(monkeypatch, client, admin_headers):
    data = _load_dataset()
    search_api = __import__("app.api.search", fromlist=["search"])

    for case in data["search_cases"]:
        monkeypatch.setenv("RAG_RERANK_ENABLED", "true")
        monkeypatch.setenv("RAG_RERANK_TOP_N", "50")

        rerank_scores = {int(k): float(v) for k, v in case["rerank_scores"].items()}
        reranker = RerankerService()

        class FakeProvider:
            def score(self, query, passages, model_name):
                return {doc_id: rerank_scores.get(doc_id, 0.0) for doc_id, _ in passages}

        monkeypatch.setattr(reranker, "_get_provider", lambda: FakeProvider())
        monkeypatch.setattr(search_api, "get_reranker_service", lambda: reranker)

        class FakeMeili:
            def search(self, **kwargs):
                return {"hits": case["meili_hits"]}

        class FakeQdrant:
            def search(self, **kwargs):
                return case["qdrant_hits"]

        class FakeEmbeddings:
            def get_query_embedding(self, _):
                return [0.0] * 8

        monkeypatch.setattr(search_api, "get_meilisearch_service", lambda: FakeMeili())
        monkeypatch.setattr(search_api, "get_qdrant_service", lambda: FakeQdrant())
        monkeypatch.setattr(search_api, "get_embeddings_service", lambda: FakeEmbeddings())

        resp = client.post(
            "/api/search/",
            json={
                "query": case["query"],
                "limit": case.get("limit", 10),
                "semantic_weight": case.get("semantic_weight", 0.5),
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        got_ids = [row["document_id"] for row in payload["results"]]
        assert got_ids == case["expected_top_ids"]


def test_chat_cases_reranked(monkeypatch):
    data = _load_dataset()
    ai_chat = __import__("app.services.ai_chat", fromlist=["ai_chat"])

    for case in data["chat_cases"]:
        monkeypatch.setenv("RAG_RERANK_ENABLED", "true")
        monkeypatch.setenv("RAG_RERANK_TOP_N", "50")
        monkeypatch.setenv("RAG_RERANK_TOP_K_OUT", str(case.get("top_k_out", 10)))

        rerank_scores = {int(k): float(v) for k, v in case["rerank_scores"].items()}
        reranker = RerankerService()

        class FakeProvider:
            def score(self, query, passages, model_name):
                return {doc_id: rerank_scores.get(doc_id, 0.0) for doc_id, _ in passages}

        monkeypatch.setattr(reranker, "_get_provider", lambda: FakeProvider())
        monkeypatch.setattr(ai_chat, "get_reranker_service", lambda: reranker)

        class FakeEmbeddings:
            def get_query_embedding(self, _):
                return [0.0] * 8

        class FakeQdrant:
            def search(self, **kwargs):
                return case["qdrant_hits"]

        service = AIChatService.__new__(AIChatService)
        service.qdrant_service = FakeQdrant()
        service.embeddings_service = FakeEmbeddings()

        contexts = service._retrieve_context(case["query"], limit=int(case.get("context_limit", 8)))
        got_ids = [ctx.doc_id for ctx in contexts]
        assert got_ids == case["expected_top_ids"]
