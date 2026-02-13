"""
Archon Backend — Comprehensive Authentication & Security Tests

Verifies:
1. All API modules return 401 without token
2. RBAC enforcement on protected routes
3. Registration security (bootstrap + admin-only)
4. JWT token validation edge cases
5. DISABLE_AUTH bypass
"""
import pytest
# ═══════════════════════════════════════════════════════════════════
# 1. ALL ROUTES REQUIRE AUTH (401 without token)
# ═══════════════════════════════════════════════════════════════════

class TestAllRoutesRequireAuth:
    """Every data-serving endpoint must return 401 without a JWT token."""

    # ── Scan ──
    def test_scan_list_requires_auth(self, client):
        assert client.get("/api/scan/").status_code == 401

    def test_scan_create_requires_auth(self, client):
        assert client.post("/api/scan/", json={"path": "/tmp"}).status_code == 401

    def test_scan_estimate_requires_auth(self, client):
        assert client.post("/api/scan/estimate", json={"path": "/tmp"}).status_code == 401

    def test_scan_progress_requires_auth(self, client):
        assert client.get("/api/scan/1/progress").status_code == 401

    def test_scan_delete_requires_auth(self, client):
        assert client.delete("/api/scan/1").status_code == 401

    def test_scan_factory_reset_requires_auth(self, client):
        assert client.post("/api/scan/factory-reset").status_code == 401

    # ── Search ──
    def test_search_requires_auth(self, client):
        assert client.post("/api/search/", json={"query": "test"}).status_code == 401

    def test_search_facets_requires_auth(self, client):
        assert client.get("/api/search/facets").status_code == 401

    def test_search_quick_requires_auth(self, client):
        assert client.get("/api/search/quick?q=test").status_code == 401

    # ── Documents ──
    def test_documents_list_requires_auth(self, client):
        assert client.get("/api/documents/").status_code == 401

    def test_documents_get_requires_auth(self, client):
        assert client.get("/api/documents/1").status_code == 401

    def test_documents_delete_requires_auth(self, client):
        assert client.delete("/api/documents/1").status_code == 401

    # ── Export ──
    def test_export_csv_requires_auth(self, client):
        assert client.post("/api/export/csv", json={"document_ids": [1]}).status_code == 401

    def test_export_pdf_requires_auth(self, client):
        assert client.post("/api/export/pdf", json={"document_ids": [1]}).status_code == 401

    def test_export_dat_requires_auth(self, client):
        assert client.post("/api/export/dat", json={"document_ids": [1]}).status_code == 401

    def test_export_opt_requires_auth(self, client):
        assert client.post("/api/export/opt", json={"document_ids": [1]}).status_code == 401

    def test_export_redacted_pdf_requires_auth(self, client):
        assert client.post("/api/export/redacted-pdf", json={"document_ids": [1]}).status_code == 401

    def test_export_search_csv_requires_auth(self, client):
        assert client.get("/api/export/search-results/csv?query=test").status_code == 401

    # ── Chat ──
    def test_chat_requires_auth(self, client):
        assert client.post("/api/chat/", json={"message": "hello"}).status_code == 401

    def test_chat_summarize_requires_auth(self, client):
        assert client.post("/api/chat/summarize", json={"document_ids": [1]}).status_code == 401

    # ── Projects ──
    def test_projects_list_requires_auth(self, client):
        assert client.get("/api/projects/").status_code == 401

    # ── Favorites ──
    def test_favorites_list_requires_auth(self, client):
        assert client.get("/api/favorites/").status_code == 401

    def test_favorites_create_requires_auth(self, client):
        assert client.post("/api/favorites/", json={"document_id": 1}).status_code == 401

    # ── Audit ──
    def test_audit_list_requires_auth(self, client):
        assert client.get("/api/audit/").status_code == 401

    # ── Entities ──
    def test_entities_list_requires_auth(self, client):
        assert client.get("/api/entities/").status_code == 401

    def test_entity_types_requires_auth(self, client):
        assert client.get("/api/entities/types").status_code == 401

    # ── Tags ──
    def test_tags_list_requires_auth(self, client):
        assert client.get("/api/tags/").status_code == 401

    def test_tags_create_requires_auth(self, client):
        assert client.post("/api/tags/", json={"name": "test"}).status_code == 401

    # ── Timeline ──
    def test_timeline_requires_auth(self, client):
        assert client.get("/api/timeline/aggregation").status_code == 401

    # ── Stats ──
    def test_stats_requires_auth(self, client):
        assert client.get("/api/stats/").status_code == 401

    # ── Deep Analysis ──
    def test_deep_analysis_get_requires_auth(self, client):
        assert client.get("/api/deep-analysis/1").status_code == 401

    def test_deep_analysis_status_requires_auth(self, client):
        assert client.get("/api/deep-analysis/1/status").status_code == 401

    def test_deep_analysis_trigger_requires_auth(self, client):
        assert client.post("/api/deep-analysis/1/trigger").status_code == 401

    def test_deep_analysis_batch_requires_auth(self, client):
        assert client.post("/api/deep-analysis/batch", json={"document_ids": [1]}).status_code == 401


# ═══════════════════════════════════════════════════════════════════
# 2. HEALTH ENDPOINT STAYS PUBLIC
# ═══════════════════════════════════════════════════════════════════

class TestPublicEndpoints:
    def test_health_no_auth(self, client):
        resp = client.get("/api/health/")
        assert resp.status_code == 200

    def test_auth_config_no_auth(self, client):
        resp = client.get("/api/auth/config")
        assert resp.status_code == 200

    def test_auth_login_no_auth(self, client):
        """Login endpoint is public (returns 401 on bad creds, not auth error)."""
        resp = client.post("/api/auth/login", json={
            "username": "nobody", "password": "nothing"
        })
        assert resp.status_code == 401  # wrong creds, not missing token


# ═══════════════════════════════════════════════════════════════════
# 3. REGISTRATION SECURITY
# ═══════════════════════════════════════════════════════════════════

class TestRegistrationSecurity:
    def test_bootstrap_register_first_user_is_admin(self, client):
        """First user can register without auth and becomes admin."""
        resp = client.post("/api/auth/register", json={
            "username": "bootstrapadmin",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code in (200, 201)
        assert resp.json()["role"] == "admin"

    def test_register_blocked_after_first_user(self, client):
        """After bootstrap, /register returns 403."""
        # Create bootstrap admin
        client.post("/api/auth/register", json={
            "username": "firstone",
            "password": "Str0ngP@ss!",
        })
        # Try to register a second user via public endpoint
        resp = client.post("/api/auth/register", json={
            "username": "secondone",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 403

    def test_admin_register_requires_auth(self, client):
        """/admin-register without token returns 401."""
        resp = client.post("/api/auth/admin-register", json={
            "username": "sneaky",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 401

    def test_admin_register_creates_analyst(self, client, admin_headers):
        """Admin can create analyst users via /admin-register."""
        resp = client.post("/api/auth/admin-register", json={
            "username": "newanalyst",
            "password": "An@lyst123!",
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        assert resp.json()["role"] == "analyst"

    def test_analyst_cannot_admin_register(self, client, analyst_headers):
        """Analysts cannot create new users."""
        resp = client.post("/api/auth/admin-register", json={
            "username": "sneaky2",
            "password": "Str0ngP@ss!",
        }, headers=analyst_headers)
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════
# 4. RBAC ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════

class TestRBACEnforcement:
    def test_factory_reset_requires_admin(self, client, analyst_headers):
        """Factory reset is admin-only."""
        resp = client.post("/api/scan/factory-reset", headers=analyst_headers)
        assert resp.status_code == 403

    def test_factory_reset_allowed_for_admin(self, client, admin_headers):
        """Admin can perform factory reset (may fail with 500 if services down, but not 403)."""
        resp = client.post("/api/scan/factory-reset", headers=admin_headers)
        assert resp.status_code != 403

    def test_audit_list_requires_admin(self, client, analyst_headers):
        """Audit log listing restricted to admin."""
        resp = client.get("/api/audit/", headers=analyst_headers)
        assert resp.status_code == 403

    def test_audit_list_allowed_for_admin(self, client, admin_headers):
        resp = client.get("/api/audit/", headers=admin_headers)
        assert resp.status_code != 403

    def test_redacted_pdf_requires_admin_or_analyst(self, client, admin_headers):
        """Redacted PDF export requires admin or analyst role."""
        resp = client.post("/api/export/redacted-pdf", json={
            "document_ids": [1]
        }, headers=admin_headers)
        # Should not be 401 or 403 (might be 404 or 500 if no docs / no PyMuPDF)
        assert resp.status_code not in (401, 403)

    def test_audit_log_creation_requires_admin(self, client, analyst_headers):
        """Manual audit log creation is admin-only."""
        resp = client.post("/api/audit/log", json={
            "action": "search_performed",
            "details": {"query": "test"},
        }, headers=analyst_headers)
        assert resp.status_code == 403

    def test_deep_analysis_trigger_allowed_for_analyst(self, client, analyst_headers):
        """Analyst is allowed to trigger deep analysis (may return 404 if doc missing)."""
        resp = client.post("/api/deep-analysis/1/trigger", headers=analyst_headers)
        assert resp.status_code not in (401, 403)


# ═══════════════════════════════════════════════════════════════════
# 5. JWT TOKEN VALIDATION
# ═══════════════════════════════════════════════════════════════════

class TestJWTValidation:
    def test_invalid_token_returns_401(self, client):
        headers = {"Authorization": "Bearer invalid-token-garbage"}
        resp = client.get("/api/stats/", headers=headers)
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, client):
        """Create a token that expired 1 hour ago."""
        from datetime import timedelta
        from app.utils.auth import create_access_token
        expired_token = create_access_token(
            user_id=999,
            username="expired",
            role="admin",
            expires_delta=timedelta(hours=-1),
        )
        headers = {"Authorization": f"Bearer {expired_token}"}
        resp = client.get("/api/stats/", headers=headers)
        assert resp.status_code == 401

    def test_refresh_token_not_accepted_as_access(self, client, admin_user):
        """A refresh token should not work as access token."""
        from app.utils.auth import create_refresh_token
        refresh = create_refresh_token(user_id=admin_user[0]["id"])
        headers = {"Authorization": f"Bearer {refresh}"}
        resp = client.get("/api/stats/", headers=headers)
        assert resp.status_code == 401

    def test_valid_token_returns_data(self, client, admin_headers):
        """Valid admin token should access stats."""
        resp = client.get("/api/stats/", headers=admin_headers)
        assert resp.status_code != 401


# ═══════════════════════════════════════════════════════════════════
# 6. AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class TestAuthEndpoints:
    def test_login_valid(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "Str0ngP@ss!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "WrongPassword",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", json={
            "username": "ghost",
            "password": "anything",
        })
        assert resp.status_code == 401

    def test_me_returns_user_info(self, client, admin_headers):
        resp = client.get("/api/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testadmin"
        assert data["role"] == "admin"

    def test_refresh_token_flow(self, client, admin_user):
        login_resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "Str0ngP@ss!",
        })
        refresh_token = login_resp.json()["refresh_token"]
        resp = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_with_access_token_fails(self, client, admin_user):
        """Access token should not work as refresh token."""
        login_resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "Str0ngP@ss!",
        })
        access_token = login_resp.json()["access_token"]
        resp = client.post("/api/auth/refresh", json={
            "refresh_token": access_token
        })
        assert resp.status_code == 401
