from pathlib import Path

from app.api.projects import get_directory_stats


def _make_leaf_heavy_tree(root: Path, level1: int = 10, level2: int = 10, files_per_leaf: int = 5) -> int:
    """
    Build a small synthetic tree where early directories contain *only* subdirectories and
    files exist mostly in deep leaves. This is a common structure for real-world dumps.
    """
    root.mkdir(parents=True, exist_ok=True)

    total_files = 0
    for i in range(level1):
        a = root / f"a{i:02d}"
        a.mkdir()
        for j in range(level2):
            b = a / f"b{j:02d}"
            b.mkdir()
            for k in range(files_per_leaf):
                (b / f"f{k:02d}.txt").write_text("x", encoding="utf-8")
                total_files += 1

    return total_files


def test_get_directory_stats_estimation_probe_reduces_leaf_underestimate(tmp_path: Path):
    project_root = tmp_path / "proj"
    expected_total = _make_leaf_heavy_tree(project_root, level1=10, level2=10, files_per_leaf=5)
    assert expected_total == 500

    # Force sampling by directory cap so we don't traverse the whole tree.
    file_count, total_size, subdir_count, last_modified, sampled = get_directory_stats(
        project_root,
        max_dirs=5,
        max_seconds=2.0,
        use_cache=False,
        max_stat_samples=0,  # Keep the test fast and deterministic.
    )

    assert sampled is True
    assert subdir_count == 10
    assert file_count >= int(expected_total * 0.4)  # should not massively undercount
    assert file_count <= expected_total * 20        # guard against runaway over-estimation
    assert total_size >= 0
    assert last_modified is not None

