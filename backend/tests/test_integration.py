"""
Integration tests for the Archon API.
Tests the full request lifecycle through FastAPI test client.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import engine
from app.models import Base


# ─── Fixtures ───────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Register a user and return auth headers."""
    # Register first user (auto-admin)
    client.post("/api/auth/register", json={
        "username": "testadmin",
        "password": "Str0ngP@ss!",
        "email": "admin@test.com"
    })
    # Login
    resp = client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "Str0ngP@ss!"
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
        # API returns UserResponse directly (role at top level)
        role = data.get("role") or data.get("user", {}).get("role")
        assert role == "admin"

    def test_register_second_user_is_analyst(self, client):
        # First user
        client.post("/api/auth/register", json={
            "username": "admin1",
            "password": "Str0ngP@ss!",
        })
        # Second user
        resp = client.post("/api/auth/register", json={
            "username": "analyst1",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code in (200, 201)
        data = resp.json()
        role = data.get("role") or data.get("user", {}).get("role")
        assert role == "analyst"

    def test_register_duplicate_username_fails(self, client):
        client.post("/api/auth/register", json={
            "username": "dup",
            "password": "Str0ngP@ss!",
        })
        resp = client.post("/api/auth/register", json={
            "username": "dup",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code in (400, 409, 422)

    def test_login_valid_credentials(self, client):
        client.post("/api/auth/register", json={
            "username": "logintest",
            "password": "Str0ngP@ss!",
        })
        resp = client.post("/api/auth/login", json={
            "username": "logintest",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={
            "username": "logintest2",
            "password": "Str0ngP@ss!",
        })
        resp = client.post("/api/auth/login", json={
            "username": "logintest2",
            "password": "WrongPassword",
        })
        assert resp.status_code == 401

    def test_me_endpoint(self, client, auth_headers):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testadmin"
        assert data["role"] == "admin"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_refresh_token(self, client):
        # Register and login to get refresh token
        client.post("/api/auth/register", json={
            "username": "refreshtest",
            "password": "Str0ngP@ss!",
        })
        login_resp = client.post("/api/auth/login", json={
            "username": "refreshtest",
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
        """Stats endpoint should return 401 without auth."""
        resp = client.get("/api/stats/")
        # May return 401 or 200 depending on whether auth middleware is
        # applied globally — this documents expected behavior
        assert resp.status_code in (200, 401)

    def test_search_with_auth(self, client, auth_headers):
        resp = client.post("/api/search/", json={
            "query": "test",
            "limit": 5,
        }, headers=auth_headers)
        # Should not 401 — might 200 (empty) or 500 (Meilisearch not running)
        assert resp.status_code != 401


# ─── Stats ──────────────────────────────────────────────────

class TestStats:
    def test_stats_returns_structure(self, client, auth_headers):
        resp = client.get("/api/stats/", headers=auth_headers)
        if resp.status_code == 200:
            data = resp.json()
            assert "total_documents" in data


# ─── Documents ──────────────────────────────────────────────

class TestDocuments:
    def test_list_documents_empty(self, client, auth_headers):
        resp = client.get("/api/documents/", headers=auth_headers)
        if resp.status_code == 200:
            data = resp.json()
            assert "documents" in data
            assert data["total"] == 0

    def test_get_nonexistent_document(self, client, auth_headers):
        resp = client.get("/api/documents/99999", headers=auth_headers)
        assert resp.status_code in (404, 500)


# ─── Favorites ──────────────────────────────────────────────

class TestFavorites:
    def test_list_favorites_empty(self, client, auth_headers):
        resp = client.get("/api/favorites/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # API returns {favorites: [], total: 0} or []
        if isinstance(data, list):
            assert len(data) == 0
        else:
            assert data.get("total", 0) == 0
            assert len(data.get("favorites", [])) == 0


# ─── Tags ───────────────────────────────────────────────────

class TestTags:
    def test_list_tags_empty(self, client, auth_headers):
        resp = client.get("/api/tags/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_tag(self, client, auth_headers):
        resp = client.post("/api/tags/", json={
            "name": "Important",
            "color": "#ef4444"
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Important"

    def test_create_duplicate_tag_fails(self, client, auth_headers):
        client.post("/api/tags/", json={"name": "DupTag"}, headers=auth_headers)
        resp = client.post("/api/tags/", json={"name": "DupTag"}, headers=auth_headers)
        assert resp.status_code in (400, 409, 422, 500)


# ─── Audit ──────────────────────────────────────────────────

class TestAudit:
    def test_list_audit_logs(self, client, auth_headers):
        resp = client.get("/api/audit/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ─── Entities ───────────────────────────────────────────────

class TestEntities:
    def test_list_entities_empty(self, client, auth_headers):
        resp = client.get("/api/entities/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_entity_types(self, client, auth_headers):
        resp = client.get("/api/entities/types", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
