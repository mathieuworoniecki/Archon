"""
Archon Backend — Export API Tests

Tests all export endpoints with auth and RBAC enforcement.
"""
import pytest


class TestExportCSV:
    def test_csv_requires_auth(self, client):
        assert client.post("/api/export/csv", json={"document_ids": [1]}).status_code == 401

    def test_csv_with_auth(self, client, admin_headers):
        resp = client.post("/api/export/csv", json={
            "document_ids": [1]
        }, headers=admin_headers)
        # 404 (no docs) is acceptable, not 401/403
        assert resp.status_code != 401


class TestExportPDF:
    def test_pdf_requires_auth(self, client):
        assert client.post("/api/export/pdf", json={"document_ids": [1]}).status_code == 401

    def test_pdf_with_auth(self, client, admin_headers):
        resp = client.post("/api/export/pdf", json={
            "document_ids": [1]
        }, headers=admin_headers)
        assert resp.status_code not in (401, 403)


class TestExportDAT:
    def test_dat_requires_auth(self, client):
        assert client.post("/api/export/dat", json={"document_ids": [1]}).status_code == 401

    def test_dat_with_auth(self, client, admin_headers):
        resp = client.post("/api/export/dat", json={
            "document_ids": [1]
        }, headers=admin_headers)
        assert resp.status_code not in (401, 403)


class TestExportOPT:
    def test_opt_requires_auth(self, client):
        assert client.post("/api/export/opt", json={"document_ids": [1]}).status_code == 401

    def test_opt_with_auth(self, client, admin_headers):
        resp = client.post("/api/export/opt", json={
            "document_ids": [1]
        }, headers=admin_headers)
        assert resp.status_code not in (401, 403)


class TestExportSearchCSV:
    def test_search_csv_requires_auth(self, client):
        assert client.get("/api/export/search-results/csv?query=test").status_code == 401


class TestExportRedactedPDF:
    def test_redacted_pdf_requires_auth(self, client):
        assert client.post("/api/export/redacted-pdf", json={
            "document_ids": [1]
        }).status_code == 401

    def test_redacted_pdf_admin_allowed(self, client, admin_headers):
        """Admin can access redacted PDF (may fail with 404/500, not 403)."""
        resp = client.post("/api/export/redacted-pdf", json={
            "document_ids": [1]
        }, headers=admin_headers)
        assert resp.status_code not in (401, 403)

    def test_redacted_pdf_analyst_allowed(self, client, analyst_headers):
        """Analyst can access redacted PDF (admin or analyst role required)."""
        resp = client.post("/api/export/redacted-pdf", json={
            "document_ids": [1]
        }, headers=analyst_headers)
        assert resp.status_code not in (401, 403)
