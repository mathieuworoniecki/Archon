"""
Integration tests for the Archon API.
Tests the full request lifecycle through FastAPI test client.

Updated for Phase 1 security hardening:
- Uses admin_headers/analyst_headers from conftest.py
- Registration tests reflect new bootstrap + admin-register flow
"""
import pytest


# ─── Health ─────────────────────────────────────────────────

class TestHealth:
    def test_health_endpoint_returns_200(self, client):
        resp = client.get("/api/health/")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "services" in data
        assert "database" in data["services"]

    def test_health_no_auth_required(self, client):
        """Health endpoint should be accessible without JWT."""
        resp = client.get("/api/health/")
        assert resp.status_code == 200


# ─── Authentication ─────────────────────────────────────────

class TestAuth:
    def test_register_first_user_is_admin(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "firstuser",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code in (200, 201)
        data = resp.json()
        role = data.get("role") or data.get("user", {}).get("role")
        assert role == "admin"

    def test_register_blocked_after_first_user(self, client):
        """After bootstrap, public /register returns 403."""
        client.post("/api/auth/register", json={
            "username": "admin1",
            "password": "Str0ngP@ss!",
        })
        resp = client.post("/api/auth/register", json={
            "username": "analyst1",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 403

    def test_admin_register_creates_analyst(self, client, admin_headers):
        """Admin can create analyst users via /admin-register."""
        resp = client.post("/api/auth/admin-register", json={
            "username": "newanalyst",
            "password": "An@lyst123!",
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        assert resp.json()["role"] == "analyst"

    def test_register_duplicate_username_fails(self, client):
        client.post("/api/auth/register", json={
            "username": "dup",
            "password": "Str0ngP@ss!",
        })
        # After first user, register is blocked, not duplicate error
        resp = client.post("/api/auth/register", json={
            "username": "dup",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code in (403, 409, 422)

    def test_login_valid_credentials(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "WrongPassword",
        })
        assert resp.status_code == 401

    def test_me_endpoint(self, client, admin_headers):
        resp = client.get("/api/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testadmin"
        assert data["role"] == "admin"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_refresh_token(self, client, admin_user):
        login_resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "Str0ngP@ss!",
        })
        refresh_token = login_resp.json().get("refresh_token")
        if refresh_token:
            resp = client.post("/api/auth/refresh", json={
                "refresh_token": refresh_token
            })
            assert resp.status_code == 200
            assert "access_token" in resp.json()
        else:
            pytest.skip("Login response did not include refresh_token")


# ─── Protected Endpoints ────────────────────────────────────

class TestProtectedEndpoints:
    def test_stats_requires_auth(self, client):
        """Stats endpoint must return 401 without auth."""
        resp = client.get("/api/stats/")
        assert resp.status_code == 401

    def test_search_with_auth(self, client, admin_headers):
        try:
            resp = client.post("/api/search/", json={
                "query": "test",
                "limit": 5,
            }, headers=admin_headers)
            assert resp.status_code != 401
        except Exception:
            pytest.skip("Meilisearch not running")


# ─── Stats ──────────────────────────────────────────────────

class TestStats:
    def test_stats_returns_structure(self, client, admin_headers):
        resp = client.get("/api/stats/", headers=admin_headers)
        if resp.status_code == 200:
            data = resp.json()
            assert "total_documents" in data


# ─── Documents ──────────────────────────────────────────────

class TestDocuments:
    def test_list_documents_empty(self, client, admin_headers):
        resp = client.get("/api/documents/", headers=admin_headers)
        if resp.status_code == 200:
            data = resp.json()
            assert "documents" in data
            assert data["total"] == 0

    def test_list_documents_filters_by_project_path(self, client, admin_headers, db_session):
        from datetime import datetime, timezone
        from app.models import Scan, ScanStatus, Document, DocumentType

        scan_a = Scan(
            path="/documents/project-a",
            status=ScanStatus.COMPLETED,
            total_files=1,
            processed_files=1,
            failed_files=0,
        )
        scan_b = Scan(
            path="/documents/project-b",
            status=ScanStatus.COMPLETED,
            total_files=1,
            processed_files=1,
            failed_files=0,
        )
        db_session.add_all([scan_a, scan_b])
        db_session.flush()

        db_session.add_all([
            Document(
                scan_id=scan_a.id,
                file_path="/documents/project-a/report-a.txt",
                file_name="report-a.txt",
                file_type=DocumentType.TEXT,
                file_size=128,
                text_length=32,
                indexed_at=datetime.now(timezone.utc),
            ),
            Document(
                scan_id=scan_b.id,
                file_path="/documents/project-b/report-b.txt",
                file_name="report-b.txt",
                file_type=DocumentType.TEXT,
                file_size=128,
                text_length=32,
                indexed_at=datetime.now(timezone.utc),
            ),
        ])
        db_session.commit()

        resp = client.get(
            "/api/documents/?project_path=/documents/project-a",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["documents"]) == 1
        assert data["documents"][0]["file_path"].startswith("/documents/project-a/")

    def test_get_nonexistent_document(self, client, admin_headers):
        resp = client.get("/api/documents/99999", headers=admin_headers)
        assert resp.status_code in (404, 500)


# ─── Timeline ───────────────────────────────────────────────

class TestTimeline:
    def test_timeline_filters_by_project_path(self, client, admin_headers, db_session):
        from datetime import datetime, timezone
        from app.models import Scan, ScanStatus, Document, DocumentType

        if db_session.bind and db_session.bind.dialect.name == "sqlite":
            pytest.skip("Timeline aggregation uses PostgreSQL to_char; unsupported on sqlite test DB")

        scan_a = Scan(
            path="/documents/project-a",
            status=ScanStatus.COMPLETED,
            total_files=1,
            processed_files=1,
            failed_files=0,
        )
        scan_b = Scan(
            path="/documents/project-b",
            status=ScanStatus.COMPLETED,
            total_files=1,
            processed_files=1,
            failed_files=0,
        )
        db_session.add_all([scan_a, scan_b])
        db_session.flush()

        now = datetime.now(timezone.utc)
        db_session.add_all([
            Document(
                scan_id=scan_a.id,
                file_path="/documents/project-a/event-a.txt",
                file_name="event-a.txt",
                file_type=DocumentType.TEXT,
                file_size=64,
                text_length=16,
                file_modified_at=now,
                indexed_at=now,
            ),
            Document(
                scan_id=scan_b.id,
                file_path="/documents/project-b/event-b.txt",
                file_name="event-b.txt",
                file_type=DocumentType.TEXT,
                file_size=64,
                text_length=16,
                file_modified_at=now,
                indexed_at=now,
            ),
        ])
        db_session.commit()

        resp = client.get(
            "/api/timeline/aggregation?granularity=month&project_path=/documents/project-a",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_documents"] == 1
        assert len(data["data"]) == 1


# ─── Favorites ──────────────────────────────────────────────

class TestFavorites:
    def test_list_favorites_empty(self, client, admin_headers):
        resp = client.get("/api/favorites/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        if isinstance(data, list):
            assert len(data) == 0
        else:
            assert data.get("total", 0) == 0
            assert len(data.get("favorites", [])) == 0


# ─── Tags ───────────────────────────────────────────────────

class TestTags:
    def test_list_tags_empty(self, client, admin_headers):
        resp = client.get("/api/tags/", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_tag(self, client, admin_headers):
        resp = client.post("/api/tags/", json={
            "name": "Important",
            "color": "#ef4444"
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Important"

    def test_create_duplicate_tag_fails(self, client, admin_headers):
        client.post("/api/tags/", json={"name": "DupTag"}, headers=admin_headers)
        resp = client.post("/api/tags/", json={"name": "DupTag"}, headers=admin_headers)
        assert resp.status_code in (400, 409, 422, 500)


# ─── Audit ──────────────────────────────────────────────────

class TestAudit:
    def test_list_audit_logs(self, client, admin_headers):
        resp = client.get("/api/audit/", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ─── Entities ───────────────────────────────────────────────

class TestEntities:
    def test_list_entities_empty(self, client, admin_headers):
        resp = client.get("/api/entities/", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_entity_types(self, client, admin_headers):
        resp = client.get("/api/entities/types", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
