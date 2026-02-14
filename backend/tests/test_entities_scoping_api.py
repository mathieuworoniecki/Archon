"""
Tests for Entities endpoints project scoping and deep-link support.
"""

from app.models import Scan, ScanStatus, Document, DocumentType, Entity


def seed_two_projects(db_session):
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

    db_session.add_all(
        [
            Entity(document_id=doc_a.id, text="Alice", type="PER", count=2),
            Entity(document_id=doc_a.id, text="Acme", type="ORG", count=1),
            Entity(document_id=doc_b.id, text="Bob", type="PER", count=1),
            Entity(document_id=doc_b.id, text="Beta", type="ORG", count=1),
        ]
    )
    db_session.commit()
    return doc_a, doc_b


def test_list_entities_project_path_filter(client, admin_headers, db_session):
    seed_two_projects(db_session)

    resp = client.get("/api/entities/?project_path=/documents/proj-a&limit=50", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()

    texts = {(row["type"], row["text"]) for row in items}
    assert ("PER", "Alice") in texts
    assert ("ORG", "Acme") in texts
    assert ("PER", "Bob") not in texts
    assert ("ORG", "Beta") not in texts


def test_entity_types_project_path_filter(client, admin_headers, db_session):
    seed_two_projects(db_session)

    resp = client.get("/api/entities/types?project_path=/documents/proj-a", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()
    summary = {row["type"]: row for row in items}

    assert summary["PER"]["unique_count"] == 1
    assert summary["ORG"]["unique_count"] == 1
    assert summary["PER"]["count"] == 2
    assert summary["ORG"]["count"] == 1


def test_search_by_entity_project_scoped_exact(client, admin_headers, db_session):
    seed_two_projects(db_session)

    resp = client.get(
        "/api/entities/search?text=Alice&entity_type=PER&project_path=/documents/proj-a&exact=true",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["file_name"] == "doc-a.txt"

    resp_other = client.get(
        "/api/entities/search?text=Alice&entity_type=PER&project_path=/documents/proj-b&exact=true",
        headers=admin_headers,
    )
    assert resp_other.status_code == 200
    assert resp_other.json() == []


def test_lookup_entity_exact_project_scoped(client, admin_headers, db_session):
    seed_two_projects(db_session)

    resp = client.get(
        "/api/entities/lookup?text=Alice&entity_type=PER&project_path=/documents/proj-a",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Alice"
    assert data["type"] == "PER"
    assert data["total_count"] == 2
    assert data["document_count"] == 1


def test_cooccurrences_project_scoped(client, admin_headers, db_session):
    seed_two_projects(db_session)

    resp = client.get(
        "/api/entities/cooccurrences?text=Alice&entity_type=PER&project_path=/documents/proj-a&limit=5",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    assert items[0]["text"] == "Acme"
    assert items[0]["type"] == "ORG"
    assert items[0]["weight"] == 1


def test_merge_entities_scoped_to_project(client, admin_headers, db_session):
    doc_a, doc_b = seed_two_projects(db_session)

    # Same alias exists in both projects.
    db_session.add_all(
        [
            Entity(document_id=doc_a.id, text="Alicia", type="PER", count=1),
            Entity(document_id=doc_b.id, text="Alicia", type="PER", count=1),
        ]
    )
    db_session.commit()

    resp = client.post(
        "/api/entities/merge?project_path=/documents/proj-a",
        json={"entities": ["Alicia", "Alice"], "canonical": "Alice", "entity_type": "PER"},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    # In proj-a, alias should be merged into canonical (either renamed or consolidated).
    proj_a_alias = db_session.query(Entity).filter(Entity.document_id == doc_a.id, Entity.text == "Alicia", Entity.type == "PER").all()
    assert proj_a_alias == []

    # In proj-b, alias should remain untouched.
    proj_b_alias = db_session.query(Entity).filter(Entity.document_id == doc_b.id, Entity.text == "Alicia", Entity.type == "PER").all()
    assert len(proj_b_alias) == 1


def test_graph_focus_forces_inclusion(client, admin_headers, db_session):
    scan = Scan(
        path="/documents",
        status=ScanStatus.COMPLETED,
        total_files=1,
        processed_files=1,
    )
    db_session.add(scan)
    db_session.flush()

    doc = Document(
        scan_id=scan.id,
        file_path="/documents/proj-a/doc.txt",
        file_name="doc.txt",
        file_type=DocumentType.TEXT,
        file_size=10,
        text_content="seed",
    )
    db_session.add(doc)
    db_session.flush()

    # Create 10 high-count entities + 1 low-count focus.
    for i in range(10):
        db_session.add(Entity(document_id=doc.id, text=f"Top{i}", type="PER", count=100))
    db_session.add(Entity(document_id=doc.id, text="FocusGuy", type="PER", count=1))
    db_session.commit()

    resp = client.get(
        "/api/entities/graph?project_path=/documents/proj-a&min_count=1&limit=10&focus=PER:FocusGuy",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    node_ids = {node["id"] for node in resp.json()["nodes"]}
    assert "PER:FocusGuy" in node_ids

