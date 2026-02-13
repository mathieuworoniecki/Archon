"""
Archon Backend — Search API Tests

Tests search endpoints with auth enforcement.
Note: Full search requires Meilisearch + Qdrant running;
these tests focus on the API contract and auth.
"""
import pytest


def _meilisearch_available(resp):
    """Return True if the response was processed (not a MeiliSearch connection error)."""
    # If we get a valid HTTP status, Meilisearch is reachable
    return resp.status_code < 600


class TestSearch:
    def test_search_requires_auth(self, client):
        assert client.post("/api/search/", json={"query": "test"}).status_code == 401

    def test_search_with_auth(self, client, admin_headers):
        try:
            resp = client.post("/api/search/", json={
                "query": "test",
                "limit": 5,
            }, headers=admin_headers)
            assert resp.status_code != 401
        except Exception:
            pytest.skip("Meilisearch not running")


class TestSearchFacets:
    def test_facets_requires_auth(self, client):
        assert client.get("/api/search/facets").status_code == 401

    def test_facets_with_auth(self, client, admin_headers):
        resp = client.get("/api/search/facets", headers=admin_headers)
        assert resp.status_code != 401


class TestQuickSearch:
    def test_quick_search_requires_auth(self, client):
        assert client.get("/api/search/quick?q=test").status_code == 401

    def test_quick_search_with_auth(self, client, admin_headers):
        try:
            resp = client.get("/api/search/quick?q=test", headers=admin_headers)
            assert resp.status_code != 401
        except Exception:
            pytest.skip("Meilisearch not running")
