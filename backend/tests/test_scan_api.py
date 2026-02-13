"""
Archon Backend — Scan API Tests

Tests the scan lifecycle: creation, listing, progress, deletion, and RBAC.
Note: Actual scanning requires Celery + Meilisearch + Qdrant; these tests
focus on the API contract and auth enforcement.
"""
import pytest
from app.models import Scan, ScanStatus


class TestScanList:
    def test_list_scans_empty(self, client, admin_headers):
        resp = client.get("/api/scan/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "scans" in data

    def test_list_scans_requires_auth(self, client):
        assert client.get("/api/scan/").status_code == 401


class TestScanCreate:
    def test_create_scan_requires_auth(self, client):
        assert client.post("/api/scan/", json={"path": "/tmp"}).status_code == 401

    def test_create_scan_rejects_path_outside_root(self, client, admin_headers):
        # Test env sets SCAN_ROOT_PATH=/tmp, so "/" must be rejected.
        resp = client.post("/api/scan/", json={"path": "/"}, headers=admin_headers)
        assert resp.status_code == 403

    def test_create_scan_rejects_missing_path_inside_root(self, client, admin_headers):
        resp = client.post(
            "/api/scan/",
            json={"path": "/tmp/archon_missing_scan_dir"},
            headers=admin_headers,
        )
        assert resp.status_code == 400

    def test_create_scan_reuses_existing_active_scan(self, client, admin_headers, db_session, temp_dir):
        existing = Scan(
            path=str(temp_dir),
            status=ScanStatus.RUNNING,
            total_files=10,
            processed_files=3,
            failed_files=0,
        )
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)

        resp = client.post("/api/scan/", json={"path": str(temp_dir)}, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == existing.id
        assert data["status"] in ("running", "pending")

    def test_create_scan_deduplicates_repeated_requests(self, client, admin_headers, temp_dir, monkeypatch):
        delay_calls = []

        class _FakeTask:
            id = "fake-task-id"

        def _fake_delay(scan_id, **kwargs):
            delay_calls.append((scan_id, kwargs))
            return _FakeTask()

        monkeypatch.setattr("app.api.scan.run_scan.delay", _fake_delay)

        first = client.post("/api/scan/", json={"path": str(temp_dir)}, headers=admin_headers)
        second = client.post("/api/scan/", json={"path": str(temp_dir)}, headers=admin_headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]
        assert len(delay_calls) == 1


class TestScanEstimate:
    def test_estimate_requires_auth(self, client):
        assert client.post("/api/scan/estimate?path=/tmp").status_code == 401

    def test_estimate_with_auth(self, client, admin_headers, temp_dir, sample_text_file):
        """Estimate on a valid directory returns file count."""
        resp = client.post(
            f"/api/scan/estimate?path={str(temp_dir)}",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "file_count" in data
        assert "type_counts" in data
        assert "embedding_estimate" in data

    def test_estimate_rejects_path_outside_root(self, client, admin_headers):
        resp = client.post("/api/scan/estimate?path=/", headers=admin_headers)
        assert resp.status_code == 403


class TestScanProgress:
    def test_progress_requires_auth(self, client):
        assert client.get("/api/scan/1/progress").status_code == 401

    def test_progress_nonexistent_scan(self, client, admin_headers):
        resp = client.get("/api/scan/99999/progress", headers=admin_headers)
        assert resp.status_code in (404, 500)


class TestScanDelete:
    def test_delete_requires_auth(self, client):
        assert client.delete("/api/scan/1").status_code == 401

    def test_delete_nonexistent_scan(self, client, admin_headers):
        resp = client.delete("/api/scan/99999", headers=admin_headers)
        assert resp.status_code in (404, 500)

    def test_delete_requires_admin_or_analyst(self, client, admin_headers):
        """Delete scan should not return 403 for admin."""
        resp = client.delete("/api/scan/99999", headers=admin_headers)
        assert resp.status_code != 403


class TestScanFactoryReset:
    def test_factory_reset_requires_auth(self, client):
        assert client.post("/api/scan/factory-reset").status_code == 401

    def test_factory_reset_requires_admin(self, client, analyst_headers):
        resp = client.post("/api/scan/factory-reset", headers=analyst_headers)
        assert resp.status_code == 403

    def test_factory_reset_admin_allowed(self, client, admin_headers):
        """Admin can trigger factory reset (may fail with 500 if services down, not 403)."""
        resp = client.post("/api/scan/factory-reset", headers=admin_headers)
        assert resp.status_code != 403
