"""
Projects API endpoints.
Projects are based on first-level directories in the documents folder.
"""
import os
import logging
import itertools
import time
import threading
from collections import deque
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from datetime import datetime

logger = logging.getLogger(__name__)

from ..config import get_settings
from ..utils.auth import get_current_user
from ..models import User

settings = get_settings()

router = APIRouter(prefix="/projects", tags=["projects"])

_DIRECTORY_STATS_CACHE_TTL_SECONDS = 180.0
_directory_stats_cache: dict[str, tuple[float, str, tuple[int, int, int, Optional[datetime], bool]]] = {}
_directory_stats_cache_lock = threading.Lock()


class Project(BaseModel):
    """A project is a first-level directory in the documents folder."""
    name: str
    path: str
    file_count: int
    file_count_estimated: bool = False
    total_size_bytes: int
    last_modified: Optional[datetime] = None
    subdirectories: int


class ProjectsResponse(BaseModel):
    projects: List[Project]
    documents_path: str
    total_projects: int


def _directory_signature(path: Path) -> Optional[str]:
    """Build a lightweight cache signature for a directory root."""
    try:
        st = path.stat()
        return f"{st.st_mtime_ns}:{st.st_ctime_ns}:{st.st_size}"
    except OSError:
        return None


def _get_cached_directory_stats(path: Path, signature: Optional[str]) -> Optional[tuple[int, int, int, Optional[datetime], bool]]:
    """Return cached stats when signature is still valid and TTL not expired."""
    if signature is None:
        return None

    key = str(path)
    now = time.monotonic()
    with _directory_stats_cache_lock:
        cached = _directory_stats_cache.get(key)
        if not cached:
            return None

        cached_at, cached_signature, payload = cached
        if cached_signature != signature or now - cached_at > _DIRECTORY_STATS_CACHE_TTL_SECONDS:
            _directory_stats_cache.pop(key, None)
            return None

        return payload


def _set_cached_directory_stats(path: Path, signature: Optional[str], payload: tuple[int, int, int, Optional[datetime], bool]) -> None:
    """Persist computed stats in in-process cache."""
    if signature is None:
        return
    with _directory_stats_cache_lock:
        _directory_stats_cache[str(path)] = (time.monotonic(), signature, payload)


def get_directory_stats(
    path: Path,
    max_files: int = 0,
    max_seconds: float = 6.0,
    max_dirs: int = 25_000,
    max_depth: int = 64,
    max_stat_samples: int = 2_048,
    use_cache: bool = True,
) -> tuple[int, int, int, Optional[datetime], bool]:
    """
    Estimate directory stats for UI cards:
    file_count, total_size, subdir_count, last_modified, file_count_estimated.

    Strategy:
    - Breadth-first traversal to avoid strong branch bias.
    - Count files without per-file stat for speed.
    - Sample file stat metadata for size/mtime approximation.
    - Extrapolate when traversal is interrupted (time, depth, or dir caps).
    - Cache short-lived results to keep project list responsive.
    """
    resolved_path = path.resolve()
    signature = _directory_signature(resolved_path)
    if use_cache:
        cached = _get_cached_directory_stats(resolved_path, signature)
        if cached is not None:
            return cached

    file_count = 0
    total_size = 0
    subdir_count = 0
    last_modified: Optional[datetime] = None
    size_sample_sum = 0
    size_sample_count = 0

    start_time = time.monotonic()
    sampled = False
    visited_dirs = 0
    discovered_subdirs = 0
    deferred_depth_dirs = 0
    deep_dirs_visited = 0
    deep_subdirs = 0
    non_empty_dirs = 0
    files_in_non_empty_dirs = 0

    queue: deque[tuple[Path, int]] = deque([(resolved_path, 0)])

    # Reserve a slice of the time budget to probe a few unvisited directories.
    # This helps avoid severe underestimation on trees where files mostly live in deep leaf dirs.
    max_seconds = max(0.05, float(max_seconds))
    start_deadline = start_time + max_seconds
    bfs_deadline = start_time + (max_seconds * 0.75)

    try:
        while queue:
            if time.monotonic() > bfs_deadline:
                sampled = True
                break
            if visited_dirs >= max_dirs:
                sampled = True
                break

            current_path, depth = queue.popleft()
            visited_dirs += 1

            # Directory timestamp as fallback when file stat sampling misses a branch.
            try:
                dstat = current_path.stat()
                dmod = datetime.fromtimestamp(dstat.st_mtime)
                if last_modified is None or dmod > last_modified:
                    last_modified = dmod
            except (OSError, OverflowError, ValueError):
                pass

            local_subdirs = 0
            local_files = 0
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        name = entry.name
                        if name.startswith('.'):
                            continue

                        try:
                            if entry.is_dir(follow_symlinks=False):
                                local_subdirs += 1
                                if depth < max_depth:
                                    queue.append((Path(entry.path), depth + 1))
                                else:
                                    deferred_depth_dirs += 1
                                    sampled = True
                                continue
                            if not entry.is_file(follow_symlinks=False):
                                continue
                        except (OSError, PermissionError):
                            continue

                        local_files += 1
                        file_count += 1

                        if max_files > 0 and file_count >= max_files:
                            sampled = True
                            break

                        # Dense start sampling then periodic sampling for large trees.
                        if size_sample_count < max_stat_samples:
                            should_sample = (
                                file_count <= 1024
                                or file_count % 64 == 0
                            )
                            if should_sample:
                                try:
                                    fstat = entry.stat(follow_symlinks=False)
                                    size_sample_sum += fstat.st_size
                                    size_sample_count += 1
                                    fmod = datetime.fromtimestamp(fstat.st_mtime)
                                    if last_modified is None or fmod > last_modified:
                                        last_modified = fmod
                                except (OSError, OverflowError, ValueError):
                                    pass
            except (OSError, PermissionError):
                continue

            discovered_subdirs += local_subdirs
            if depth == 0:
                subdir_count = local_subdirs
            elif depth >= 1:
                deep_dirs_visited += 1
                deep_subdirs += local_subdirs

            if local_files > 0:
                non_empty_dirs += 1
                files_in_non_empty_dirs += local_files

            if max_files > 0 and file_count >= max_files:
                sampled = True
                break

        if sampled:
            remaining_dirs = len(queue) + deferred_depth_dirs
            estimated_total_dirs = visited_dirs + remaining_dirs

            # Probe a subset of unvisited directories (and optionally descend a few levels) to
            # estimate file density in leaf-heavy trees where early BFS often sees "mostly dirs".
            probe_dirs = 0
            probe_files = 0
            probe_subdirs = 0
            probe_non_empty_dirs = 0
            probe_files_in_non_empty_dirs = 0

            PROBE_SEEDS = 32
            PROBE_MAX_DIRS = 192
            PROBE_CHILDREN_PER_DIR = 8

            probe_queue: deque[tuple[Path, int]] = deque()
            if queue:
                # Take seeds from both ends of the queue to reduce branch bias without materializing the full deque.
                left_budget = min(PROBE_SEEDS // 2, len(queue))
                right_budget = min(PROBE_SEEDS - left_budget, len(queue) - left_budget)
                for seed in itertools.islice(queue, left_budget):
                    probe_queue.append(seed)
                if right_budget > 0:
                    for seed in itertools.islice(reversed(queue), right_budget):
                        probe_queue.append(seed)

            while probe_queue and probe_dirs < PROBE_MAX_DIRS and time.monotonic() < start_deadline:
                current_path, depth = probe_queue.popleft()
                probe_dirs += 1

                local_subdirs = 0
                local_files = 0
                child_dirs: list[Path] = []
                try:
                    with os.scandir(current_path) as entries:
                        for entry in entries:
                            name = entry.name
                            if name.startswith('.'):
                                continue
                            try:
                                if entry.is_dir(follow_symlinks=False):
                                    local_subdirs += 1
                                    if depth < max_depth and len(child_dirs) < PROBE_CHILDREN_PER_DIR:
                                        child_dirs.append(Path(entry.path))
                                    continue
                                if entry.is_file(follow_symlinks=False):
                                    local_files += 1
                            except (OSError, PermissionError):
                                continue
                except (OSError, PermissionError):
                    continue

                probe_files += local_files
                probe_subdirs += local_subdirs
                if local_files > 0:
                    probe_non_empty_dirs += 1
                    probe_files_in_non_empty_dirs += local_files

                # If this directory contains no files, descend a bit to find representative leaf density.
                if local_files == 0 and child_dirs and time.monotonic() < start_deadline:
                    for child in child_dirs:
                        if probe_dirs + len(probe_queue) >= PROBE_MAX_DIRS:
                            break
                        probe_queue.append((child, depth + 1))

            # Estimate deeper undiscovered branches from observed depth>=1 fanout.
            branch_factor_bfs = (deep_subdirs / deep_dirs_visited) if deep_dirs_visited > 0 else 0.0
            branch_factor_probe = (probe_subdirs / probe_dirs) if probe_dirs > 0 else 0.0
            branch_factor = max(branch_factor_bfs, branch_factor_probe)
            if remaining_dirs > 0 and branch_factor > 0:
                if branch_factor < 1.0:
                    extra_dirs = int(remaining_dirs * (branch_factor / max(0.001, 1.0 - branch_factor)))
                else:
                    damped = min(8.0, branch_factor + (branch_factor * branch_factor * 0.35))
                    extra_dirs = int(remaining_dirs * damped)
                estimated_total_dirs += max(0, extra_dirs)

            avg_files_per_dir = file_count / max(1, visited_dirs)
            avg_non_empty = (
                files_in_non_empty_dirs / non_empty_dirs
                if non_empty_dirs > 0
                else avg_files_per_dir
            )
            bfs_density = max(
                avg_files_per_dir,
                (avg_files_per_dir * 0.7) + (avg_non_empty * 0.3),
            )

            density = bfs_density
            if probe_dirs > 0:
                probe_avg_files_per_dir = probe_files / max(1, probe_dirs)
                probe_avg_non_empty = (
                    probe_files_in_non_empty_dirs / probe_non_empty_dirs
                    if probe_non_empty_dirs > 0
                    else probe_avg_files_per_dir
                )
                probe_density = max(
                    probe_avg_files_per_dir,
                    (probe_avg_files_per_dir * 0.7) + (probe_avg_non_empty * 0.3),
                )
                # Blend conservatively to reduce under-estimation without wildly overshooting.
                density = max(density, (bfs_density * 0.6) + (probe_density * 0.4))

            estimated_files = int(density * max(1, estimated_total_dirs))
            lower_bound = file_count + int(remaining_dirs * max(1.0, density * 0.25))
            file_count = max(file_count, estimated_files, lower_bound)

        # Size is always estimated from sampled files for bounded latency.
        if size_sample_count > 0 and file_count > 0:
            avg_size = size_sample_sum / size_sample_count
            total_size = int(avg_size * file_count)
        else:
            total_size = 0
    except Exception as exc:
        logger.debug("Directory stats sampling failed for %s: %s", resolved_path, exc)

    payload = (file_count, total_size, subdir_count, last_modified, sampled)
    if use_cache:
        _set_cached_directory_stats(resolved_path, signature, payload)
    return payload


def _get_documents_dir() -> Path:
    """Return resolved documents root directory."""
    return Path(os.environ.get("DOCUMENTS_PATH", "/documents")).resolve()


def _resolve_project_path(project_name: str) -> Path:
    """
    Resolve a project path safely under the documents root.

    Prevents path traversal via project names like '..' or encoded separators.
    """
    if not project_name or project_name.strip() != project_name:
        raise HTTPException(status_code=400, detail="Invalid project name")

    # Project names are first-level folder names, never paths.
    if any(sep in project_name for sep in ("/", "\\")) or project_name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid project name")

    docs_dir = _get_documents_dir()
    candidate = (docs_dir / project_name).resolve()

    try:
        candidate.relative_to(docs_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project name")

    if not candidate.exists() or not candidate.is_dir():
        raise HTTPException(status_code=404, detail="Project not found")

    return candidate


def _get_scanned_project_names(docs_dir: Path) -> set[str]:
    """
    Return project names that already have at least one completed scan.

    This lets the UI distinguish between exact indexed counts (scanned projects)
    and filesystem-only estimates (non-scanned projects).
    """
    from ..database import SessionLocal
    from ..models import Scan, ScanStatus

    scanned_projects: set[str] = set()
    db = SessionLocal()
    try:
        rows = db.query(Scan.path).filter(Scan.status == ScanStatus.COMPLETED).all()
    except Exception as exc:
        logger.debug("Unable to load completed scans for project estimation: %s", exc)
        return scanned_projects
    finally:
        db.close()

    docs_root = docs_dir.resolve()
    for (scan_path,) in rows:
        if not scan_path:
            continue
        try:
            resolved_scan_path = Path(scan_path).resolve()
            relative = resolved_scan_path.relative_to(docs_root)
        except (OSError, ValueError, RuntimeError):
            continue

        if relative.parts:
            scanned_projects.add(relative.parts[0])

    return scanned_projects


@router.get("/", response_model=ProjectsResponse)
async def list_projects(
    refresh_stats: bool = Query(default=False, description="Force refresh of directory stats"),
    current_user: User = Depends(get_current_user)
):
    """
    List all projects (first-level directories in /documents).
    """
    # Documents path from environment or default
    docs_dir = _get_documents_dir()
    documents_path = str(docs_dir)
    
    if not docs_dir.exists():
        return ProjectsResponse(
            projects=[],
            documents_path=documents_path,
            total_projects=0
        )

    scanned_project_names = _get_scanned_project_names(docs_dir)
    projects = []

    # List first-level directories only
    try:
        for item in sorted(docs_dir.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                # Get directory stats
                file_count, total_size, subdir_count, last_modified, sampled = get_directory_stats(
                    item,
                    use_cache=not refresh_stats,
                )
                has_completed_scan = item.name in scanned_project_names
                
                projects.append(Project(
                    name=item.name,
                    path=str(item),
                    file_count=file_count,
                    file_count_estimated=(sampled or not has_completed_scan),
                    total_size_bytes=total_size,
                    last_modified=last_modified,
                    subdirectories=subdir_count
                ))
    except (OSError, PermissionError) as e:
        logger.error("Error listing projects: %s", e)
    
    return ProjectsResponse(
        projects=projects,
        documents_path=documents_path,
        total_projects=len(projects)
    )


@router.get("/{project_name}")
async def get_project(project_name: str, current_user: User = Depends(get_current_user)):
    """
    Get details for a specific project.
    """
    project_path = _resolve_project_path(project_name)

    file_count, total_size, subdir_count, last_modified, sampled = get_directory_stats(project_path)
    scanned_project_names = _get_scanned_project_names(_get_documents_dir())
    has_completed_scan = project_name in scanned_project_names
    
    # List immediate subdirectories
    subdirs = []
    try:
        for item in sorted(project_path.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                sub_files, sub_size, _, sub_mod, sub_sampled = get_directory_stats(item)
                subdirs.append({
                    "name": item.name,
                    "file_count": sub_files,
                    "file_count_estimated": sub_sampled,
                    "size_bytes": sub_size,
                    "last_modified": sub_mod
                })
    except (OSError, PermissionError):
        pass
    
    return {
        "name": project_name,
        "path": str(project_path),
        "file_count": file_count,
        "file_count_estimated": sampled or not has_completed_scan,
        "total_size_bytes": total_size,
        "last_modified": last_modified,
        "subdirectories": subdirs
    }


@router.get("/{project_name}/files")
async def list_project_files(
    project_name: str,
    limit: int = Query(default=100, le=1000),
    extensions: Optional[str] = Query(default=None, description="Comma-separated extensions filter"),
    current_user: User = Depends(get_current_user)
):
    """
    List files in a project with optional extension filter.
    """
    project_path = _resolve_project_path(project_name)
    
    # Parse extensions filter
    ext_filter = None
    if extensions:
        ext_filter = [f".{e.strip().lower()}" for e in extensions.split(",")]
    
    files = []
    try:
        for item in project_path.rglob("*"):
            if item.is_file():
                if ext_filter and item.suffix.lower() not in ext_filter:
                    continue
                
                try:
                    stat = item.stat()
                    files.append({
                        "name": item.name,
                        "relative_path": str(item.relative_to(project_path)),
                        "size_bytes": stat.st_size,
                        "extension": item.suffix.lower(),
                        "modified_at": datetime.fromtimestamp(stat.st_mtime)
                    })
                except (OSError, PermissionError):
                    pass
                
                if len(files) >= limit:
                    break
    except (OSError, PermissionError):
        pass
    
    return {
        "project": project_name,
        "files": files,
        "count": len(files),
        "truncated": len(files) >= limit
    }


@router.get("/{project_name}/stats")
async def get_project_stats(project_name: str, current_user: User = Depends(get_current_user)):
    """
    Get indexing statistics for a specific project.
    Returns document counts, type breakdown, and scan info for this project only.
    """
    from sqlalchemy import func, or_
    from ..database import SessionLocal
    from ..models import Document, Scan, DocumentType

    project_path = _resolve_project_path(project_name)
    project_path_str = str(project_path)
    project_prefix = f"{project_path_str}{os.sep}"
    
    db = SessionLocal()
    try:
        # Documents indexed for this project (file_path starts with project path)
        total_docs = db.query(func.count(Document.id)).filter(
            or_(
                Document.file_path == project_path_str,
                Document.file_path.like(f"{project_prefix}%"),
            )
        ).scalar() or 0
        
        # By type
        type_counts = db.query(
            Document.file_type,
            func.count(Document.id)
        ).filter(
            or_(
                Document.file_path == project_path_str,
                Document.file_path.like(f"{project_prefix}%"),
            )
        ).group_by(Document.file_type).all()
        
        by_type = {"pdf": 0, "image": 0, "text": 0, "video": 0, "unknown": 0}
        for file_type, count in type_counts:
            if file_type == DocumentType.PDF:
                by_type["pdf"] = count
            elif file_type == DocumentType.IMAGE:
                by_type["image"] = count
            elif file_type == DocumentType.TEXT:
                by_type["text"] = count
            elif file_type == DocumentType.VIDEO:
                by_type["video"] = count
            else:
                by_type["unknown"] = count
        
        # Total size indexed
        total_size = db.query(func.sum(Document.file_size)).filter(
            or_(
                Document.file_path == project_path_str,
                Document.file_path.like(f"{project_prefix}%"),
            )
        ).scalar() or 0
        
        # Scans for this project
        scans = db.query(Scan).filter(
            or_(
                Scan.path == project_path_str,
                Scan.path.like(f"{project_prefix}%"),
            )
        ).order_by(Scan.created_at.desc()).limit(5).all()
        
        scan_info = [{
            "id": s.id,
            "status": s.status.value,
            "total_files": s.total_files,
            "processed_files": s.processed_files,
            "failed_files": s.failed_files,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None
        } for s in scans]
        
        return {
            "project": project_name,
            "total_documents": total_docs,
            "documents_by_type": by_type,
            "total_size_bytes": total_size,
            "recent_scans": scan_info
        }
    finally:
        db.close()
