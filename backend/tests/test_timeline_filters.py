from datetime import datetime, timezone

from app.models import Document, DocumentType, Scan, ScanStatus


def _seed_timeline_data(db_session):
    scan = Scan(
        path="/tmp/timeline-project",
        status=ScanStatus.COMPLETED,
        total_files=3,
        processed_files=3,
    )
    db_session.add(scan)
    db_session.flush()

    db_session.add_all(
        [
            Document(
                scan_id=scan.id,
                file_path="/tmp/timeline-project/a.pdf",
                file_name="a.pdf",
                file_type=DocumentType.PDF,
                file_size=100,
                text_content="a",
                text_length=1,
                file_modified_at=datetime(2024, 1, 10, 9, 0, tzinfo=timezone.utc),
            ),
            Document(
                scan_id=scan.id,
                file_path="/tmp/timeline-project/b.pdf",
                file_name="b.pdf",
                file_type=DocumentType.PDF,
                file_size=110,
                text_content="b",
                text_length=1,
                file_modified_at=datetime(2024, 1, 28, 12, 30, tzinfo=timezone.utc),
            ),
            Document(
                scan_id=scan.id,
                file_path="/tmp/timeline-project/c.jpg",
                file_name="c.jpg",
                file_type=DocumentType.IMAGE,
                file_size=120,
                text_content="c",
                text_length=1,
                file_modified_at=datetime(2025, 3, 5, 18, 15, tzinfo=timezone.utc),
            ),
        ]
    )
    db_session.commit()


def test_timeline_aggregation_filters_by_file_type(client, admin_headers, db_session):
    _seed_timeline_data(db_session)

    response = client.get(
        "/api/timeline/aggregation?granularity=month&file_types=pdf",
        headers=admin_headers,
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["total_documents"] == 2
    assert payload["data"] == [
        {
            "date": "2024-01",
            "count": 2,
            "by_type": {"pdf": 2},
        }
    ]


def test_timeline_range_filters_by_file_type(client, admin_headers, db_session):
    _seed_timeline_data(db_session)

    response = client.get("/api/timeline/range?file_types=image", headers=admin_headers)
    assert response.status_code == 200

    payload = response.json()
    assert payload["total_documents"] == 1
    assert payload["min_date"].startswith("2025-03-05")
    assert payload["max_date"].startswith("2025-03-05")
