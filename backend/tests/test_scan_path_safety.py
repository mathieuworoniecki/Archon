"""
Path safety tests for scan API/worker helpers.
"""
from app.config import get_settings
from app.models import DocumentType
from app.utils.paths import normalize_scan_path
from app.workers.tasks import discover_files_streaming


class DummyOCR:
    def detect_type(self, _file_path: str):
        return DocumentType.TEXT


def test_normalize_scan_path_accepts_directory_inside_root(monkeypatch, temp_dir):
    root = temp_dir / "root"
    root.mkdir()
    target = root / "project-a"
    target.mkdir()

    monkeypatch.setenv("DOCUMENTS_PATH", str(root))
    monkeypatch.setenv("SCAN_ROOT_PATH", str(root))
    get_settings.cache_clear()
    try:
        normalized = normalize_scan_path(str(target))
        assert normalized == target.resolve()
    finally:
        get_settings.cache_clear()


def test_normalize_scan_path_rejects_outside_root(monkeypatch, temp_dir):
    root = temp_dir / "root"
    root.mkdir()
    outside = temp_dir / "outside"
    outside.mkdir()

    monkeypatch.setenv("DOCUMENTS_PATH", str(root))
    monkeypatch.setenv("SCAN_ROOT_PATH", str(root))
    get_settings.cache_clear()
    try:
        try:
            normalize_scan_path(str(outside))
            assert False, "Expected PermissionError for path outside scan root"
        except PermissionError:
            pass
    finally:
        get_settings.cache_clear()


def test_discover_files_streaming_rejects_outside_root(monkeypatch, temp_dir):
    root = temp_dir / "root"
    root.mkdir()
    outside = temp_dir / "outside"
    outside.mkdir()
    (outside / "doc.txt").write_text("hello")

    monkeypatch.setenv("DOCUMENTS_PATH", str(root))
    monkeypatch.setenv("SCAN_ROOT_PATH", str(root))
    get_settings.cache_clear()
    try:
        try:
            discover_files_streaming(str(outside), DummyOCR())
            assert False, "Expected PermissionError for outside path"
        except PermissionError:
            pass
    finally:
        get_settings.cache_clear()


def test_discover_files_streaming_accepts_inside_root(monkeypatch, temp_dir):
    root = temp_dir / "root"
    root.mkdir()
    inside = root / "project-a"
    inside.mkdir()
    doc = inside / "doc.txt"
    doc.write_text("hello")

    monkeypatch.setenv("DOCUMENTS_PATH", str(root))
    monkeypatch.setenv("SCAN_ROOT_PATH", str(root))
    get_settings.cache_clear()
    try:
        files = discover_files_streaming(str(inside), DummyOCR())
        assert len(files) == 1
        assert files[0]["path"] == str(doc)
        assert files[0]["type"] == DocumentType.TEXT
    finally:
        get_settings.cache_clear()
