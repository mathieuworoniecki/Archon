from app.api.projects import get_directory_stats
from app.models import Scan, ScanStatus


def _count_visible_files(root):
    return sum(1 for p in root.rglob("*") if p.is_file() and not p.name.startswith("."))


def test_get_directory_stats_exact_for_small_tree(temp_dir):
    project = temp_dir / "project-small"
    project.mkdir()
    (project / "a").mkdir()
    (project / "b").mkdir()
    (project / "c").mkdir()

    for idx in range(12):
        target_dir = project / ("a" if idx < 4 else "b" if idx < 8 else "c")
        (target_dir / f"doc_{idx:02d}.txt").write_text("hello")

    actual_files = _count_visible_files(project)

    file_count, total_size, subdirs, last_modified, sampled = get_directory_stats(
        project,
        max_seconds=5.0,
        max_dirs=10_000,
        use_cache=False,
    )

    assert sampled is False
    assert file_count == actual_files
    assert subdirs == 3
    assert total_size > 0
    assert last_modified is not None


def test_get_directory_stats_estimation_close_on_large_unscanned_tree(temp_dir):
    project = temp_dir / "project-large"
    project.mkdir()

    # Uniform branches make expected count predictable and let us verify
    # that the estimator remains close even when traversal is interrupted.
    branch_count = 24
    files_per_branch = 180
    for branch in range(branch_count):
        branch_dir = project / f"branch_{branch:02d}"
        branch_dir.mkdir()
        for file_idx in range(files_per_branch):
            (branch_dir / f"item_{file_idx:04d}.txt").write_text("x")

    actual_files = _count_visible_files(project)

    estimated_files, _, _, _, sampled = get_directory_stats(
        project,
        max_seconds=10.0,
        max_dirs=5,  # Force interruption to exercise extrapolation path.
        use_cache=False,
    )

    assert sampled is True
    # Must be significantly closer than naive lower-bound estimates.
    assert estimated_files >= int(actual_files * 0.75)
    assert estimated_files <= int(actual_files * 1.8)


def test_projects_endpoint_marks_unscanned_projects_as_estimated(
    client,
    admin_headers,
    db_session,
    temp_dir,
    monkeypatch,
):
    docs_root = temp_dir / "documents"
    docs_root.mkdir()

    scanned_project = docs_root / "scanned-project"
    scanned_project.mkdir()
    (scanned_project / "indexed.txt").write_text("indexed")

    unscanned_project = docs_root / "unscanned-project"
    unscanned_project.mkdir()
    (unscanned_project / "pending.txt").write_text("pending")

    db_session.add(
        Scan(
            path=str(scanned_project),
            status=ScanStatus.COMPLETED,
            total_files=1,
            processed_files=1,
        )
    )
    db_session.commit()

    monkeypatch.setenv("DOCUMENTS_PATH", str(docs_root))
    resp = client.get("/api/projects/", headers=admin_headers)
    assert resp.status_code == 200

    projects = {p["name"]: p for p in resp.json()["projects"]}
    assert projects["scanned-project"]["file_count_estimated"] is False
    assert projects["unscanned-project"]["file_count_estimated"] is True
