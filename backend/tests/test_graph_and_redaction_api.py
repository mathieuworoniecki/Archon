"""
Tests for the Entity Graph Co-occurrence API endpoint.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.models import Scan, ScanStatus, Document, DocumentType, Entity


class TestEntityGraphEndpoint:
    """Test GET /api/entities/graph endpoint."""
    
    def test_graph_requires_auth(self, client):
        """Graph endpoint requires authentication."""
        resp = client.get("/api/entities/graph")
        assert resp.status_code == 401
    
    def test_graph_returns_structure(self, client, admin_headers):
        """Graph endpoint returns correct structure with nodes and edges."""
        resp = client.get("/api/entities/graph", headers=admin_headers)
        # May return empty graph if no entities exist, but structure should be valid
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        assert isinstance(data["nodes"], list)
        assert isinstance(data["edges"], list)
    
    def test_graph_entity_type_filter(self, client, admin_headers):
        """Graph endpoint accepts entity_type filter."""
        resp = client.get("/api/entities/graph?entity_type=PER", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # All nodes should be of type PER if filter is applied
        for node in data["nodes"]:
            assert node["type"] == "PER"
    
    def test_graph_invalid_entity_type(self, client, admin_headers):
        """Invalid entity_type should be rejected."""
        resp = client.get("/api/entities/graph?entity_type=INVALID", headers=admin_headers)
        assert resp.status_code == 422  # Validation error
    
    def test_graph_limit_parameter(self, client, admin_headers):
        """Graph respects limit parameter."""
        resp = client.get("/api/entities/graph?limit=10", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["nodes"]) <= 10
    
    def test_graph_min_count_parameter(self, client, admin_headers):
        """Graph respects min_count parameter."""
        resp = client.get("/api/entities/graph?min_count=5", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # All returned nodes should have total_count >= 5
        for node in data["nodes"]:
            assert node["total_count"] >= 5
    
    def test_graph_limit_validation(self, client, admin_headers):
        """Limit below 10 or above 200 should be rejected."""
        resp = client.get("/api/entities/graph?limit=5", headers=admin_headers)
        assert resp.status_code == 422
        
        resp = client.get("/api/entities/graph?limit=300", headers=admin_headers)
        assert resp.status_code == 422
    
    def test_graph_node_structure(self, client, admin_headers):
        """Each node should have id, text, type, total_count, document_count."""
        resp = client.get("/api/entities/graph", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        for node in data["nodes"]:
            assert "id" in node
            assert "text" in node
            assert "type" in node
            assert "total_count" in node
            assert "document_count" in node
    
    def test_graph_edge_structure(self, client, admin_headers):
        """Each edge should have source, target, weight."""
        resp = client.get("/api/entities/graph", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        for edge in data["edges"]:
            assert "source" in edge
            assert "target" in edge
            assert "weight" in edge
            assert edge["weight"] >= 1

    def test_graph_project_path_filter(self, client, admin_headers, db_session):
        """Graph project_path filter scopes nodes/edges to the selected project."""
        scan = Scan(
            path="/documents",
            status=ScanStatus.COMPLETED,
            total_files=2,
            processed_files=2,
        )
        db_session.add(scan)
        db_session.flush()

        doc_a = Document(
            scan_id=scan.id,
            file_path="/documents/proj-a/doc-a.txt",
            file_name="doc-a.txt",
            file_type=DocumentType.TEXT,
            file_size=10,
            text_content="Alice works at Acme",
        )
        doc_b = Document(
            scan_id=scan.id,
            file_path="/documents/proj-b/doc-b.txt",
            file_name="doc-b.txt",
            file_type=DocumentType.TEXT,
            file_size=10,
            text_content="Bob works at Beta",
        )
        db_session.add_all([doc_a, doc_b])
        db_session.flush()

        db_session.add_all([
            Entity(document_id=doc_a.id, text="Alice", type="PER", count=1),
            Entity(document_id=doc_a.id, text="Acme", type="ORG", count=1),
            Entity(document_id=doc_b.id, text="Bob", type="PER", count=1),
            Entity(document_id=doc_b.id, text="Beta", type="ORG", count=1),
        ])
        db_session.commit()

        resp = client.get(
            "/api/entities/graph?project_path=/documents/proj-a&min_count=1&limit=30",
            headers=admin_headers,
        )
        assert resp.status_code == 200

        data = resp.json()
        node_ids = {node["id"] for node in data["nodes"]}
        assert "PER:Alice" in node_ids
        assert "ORG:Acme" in node_ids
        assert "PER:Bob" not in node_ids
        assert "ORG:Beta" not in node_ids


class TestRedactionScanEndpoint:
    """Test POST /api/documents/redaction-scan endpoint."""
    
    def test_redaction_scan_requires_auth(self, client):
        """Redaction scan requires authentication."""
        resp = client.post("/api/documents/redaction-scan", json={"document_ids": [1]})
        assert resp.status_code == 401
    
    def test_redaction_scan_requires_admin_or_analyst(self, client, admin_headers):
        """Redaction scan requires admin or analyst role."""
        resp = client.post(
            "/api/documents/redaction-scan",
            json={"document_ids": [1]},
            headers=admin_headers
        )
        # Should not be 403 for admin
        assert resp.status_code != 403
    
    def test_redaction_scan_returns_summary(self, client, admin_headers):
        """Redaction scan returns result structure."""
        resp = client.post(
            "/api/documents/redaction-scan",
            json={},
            headers=admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_scanned" in data
        assert "redacted_count" in data
        assert "clean_count" in data


class TestDocumentRedactionEndpoint:
    """Test GET /api/documents/{id}/redaction endpoint."""
    
    def test_redaction_requires_auth(self, client):
        """Document redaction endpoint requires authentication."""
        resp = client.get("/api/documents/99999/redaction")
        assert resp.status_code == 401
    
    def test_redaction_not_found(self, client, admin_headers):
        """Non-existent document returns 404."""
        resp = client.get("/api/documents/99999/redaction", headers=admin_headers)
        assert resp.status_code == 404
