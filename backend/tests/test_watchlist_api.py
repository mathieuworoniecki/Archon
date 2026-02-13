"""
Archon Backend - Watchlist API Tests
"""


def _create_rule(client, headers, **overrides):
    payload = {
        "name": "Rule 1",
        "query": "fraud",
        "project_path": "/tmp/project-a",
        "file_types": ["text"],
        "enabled": True,
        "frequency_minutes": 60,
    }
    payload.update(overrides)
    resp = client.post("/api/watchlist/", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestWatchlistAuth:
    def test_watchlist_list_requires_auth(self, client):
        resp = client.get("/api/watchlist/")
        assert resp.status_code == 401

    def test_watchlist_create_requires_auth(self, client):
        resp = client.post("/api/watchlist/", json={"name": "x", "query": "y"})
        assert resp.status_code == 401


class TestWatchlistCRUD:
    def test_watchlist_crud_minimal(self, client, admin_headers):
        list_resp = client.get("/api/watchlist/", headers=admin_headers)
        assert list_resp.status_code == 200
        assert list_resp.json() == []

        created = _create_rule(client, admin_headers)
        rule_id = created["id"]
        assert created["name"] == "Rule 1"
        assert created["query"] == "fraud"
        assert created["file_types"] == ["text"]
        assert created["enabled"] is True
        assert created["frequency_minutes"] == 60
        assert created["last_match_count"] == 0
        assert created["last_run_status"] is None

        list_after_create = client.get("/api/watchlist/", headers=admin_headers)
        assert list_after_create.status_code == 200
        rules = list_after_create.json()
        assert len(rules) == 1
        assert rules[0]["id"] == rule_id

        update_resp = client.patch(
            f"/api/watchlist/{rule_id}",
            json={
                "name": "  Rule 1 Updated  ",
                "enabled": False,
                "frequency_minutes": 120,
            },
            headers=admin_headers,
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["id"] == rule_id
        assert updated["name"] == "Rule 1 Updated"
        assert updated["enabled"] is False
        assert updated["frequency_minutes"] == 120

        delete_resp = client.delete(f"/api/watchlist/{rule_id}", headers=admin_headers)
        assert delete_resp.status_code == 200
        deleted = delete_resp.json()
        assert deleted["status"] == "deleted"
        assert deleted["rule_id"] == rule_id

        list_after_delete = client.get("/api/watchlist/", headers=admin_headers)
        assert list_after_delete.status_code == 200
        assert list_after_delete.json() == []


class TestWatchlistRunAndResults:
    def test_watchlist_run_requires_auth(self, client, admin_headers):
        created = _create_rule(client, admin_headers)
        rule_id = created["id"]

        resp = client.post(f"/api/watchlist/{rule_id}/run")
        assert resp.status_code == 401

    def test_watchlist_run_and_results_minimal(self, client, admin_headers, monkeypatch):
        created = _create_rule(client, admin_headers, query="urgent")
        rule_id = created["id"]

        class _FakeMeili:
            def search(self, **kwargs):
                assert kwargs["query"] == "urgent"
                assert kwargs["limit"] == 50
                return {
                    "hits": [{"id": "11"}, {"id": "invalid"}, {"id": 13}],
                    "estimatedTotalHits": 7,
                }

        monkeypatch.setattr(
            "app.api.watchlist.get_meilisearch_service",
            lambda: _FakeMeili(),
        )

        run_resp = client.post(f"/api/watchlist/{rule_id}/run", headers=admin_headers)
        assert run_resp.status_code == 200
        run_data = run_resp.json()
        assert run_data["rule_id"] == rule_id
        assert run_data["status"] == "ok"
        assert run_data["match_count"] == 7
        assert run_data["top_document_ids"] == [11, 13]
        assert run_data["error_message"] is None
        assert run_data["checked_at"]

        results_resp = client.get(
            f"/api/watchlist/{rule_id}/results",
            headers=admin_headers,
        )
        assert results_resp.status_code == 200
        results = results_resp.json()
        assert len(results) == 1
        result = results[0]
        assert result["rule_id"] == rule_id
        assert result["status"] == "ok"
        assert result["match_count"] == 7
        assert result["top_document_ids"] == [11, 13]
