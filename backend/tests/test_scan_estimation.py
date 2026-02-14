from pathlib import Path

from app.api.scan import estimate_scan_directory
from app.services.ocr import OCRService


def _make_leaf_heavy_tree(root: Path, level1: int = 10, level2: int = 10, files_per_leaf: int = 5) -> int:
    root.mkdir(parents=True, exist_ok=True)
    total_files = 0
    for i in range(level1):
        a = root / f"a{i:02d}"
        a.mkdir()
        for j in range(level2):
            b = a / f"b{j:02d}"
            b.mkdir()
            for k in range(files_per_leaf):
                # PDF is always scan-eligible.
                (b / f"f{k:02d}.pdf").write_bytes(b"%PDF-1.4\n%fake\n")
                total_files += 1
    return total_files


def test_estimate_scan_directory_probe_reduces_leaf_underestimate(tmp_path: Path):
    project_root = tmp_path / "proj"
    expected_total = _make_leaf_heavy_tree(project_root, level1=10, level2=10, files_per_leaf=5)
    assert expected_total == 500

    ocr = OCRService()
    stats = estimate_scan_directory(
        project_root,
        ocr,
        max_dirs=2,     # force sampling early
        max_seconds=2.0,
        max_stat_samples=0,  # keep test deterministic
    )

    assert stats["sampled"] is True
    assert stats["file_count"] >= int(expected_total * 0.4)
    assert stats["type_counts"]["pdf"] == stats["file_count"]
    assert sum(stats["type_counts"].values()) == stats["file_count"]

