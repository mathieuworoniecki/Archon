"""
Projects API endpoints.
Projects are based on first-level directories in the documents folder.
"""
import os
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel
from datetime import datetime

logger = logging.getLogger(__name__)

from ..config import get_settings

settings = get_settings()

router = APIRouter(prefix="/projects", tags=["projects"])


class Project(BaseModel):
    """A project is a first-level directory in the documents folder."""
    name: str
    path: str
    file_count: int
    total_size_bytes: int
    last_modified: Optional[datetime] = None
    subdirectories: int


class ProjectsResponse(BaseModel):
    projects: List[Project]
    documents_path: str
    total_projects: int


def get_directory_stats(path: Path, max_files: int = 1000, max_seconds: float = 2.0) -> tuple[int, int, int, Optional[datetime]]:
    """
    Get stats for a directory: file_count, total_size, subdir_count, last_modified.
    Uses sampling for large directories to avoid timeouts.
    """
    import time
    
    file_count = 0
    total_size = 0
    subdir_count = 0
    last_modified = None
    start_time = time.time()
    sampled = False
    dirs_seen = 0
    
    try:
        # Count immediate subdirectories first (fast)
        for item in path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                subdir_count += 1
        
        # Walk for file stats with limits
        for root, dirs, files in os.walk(path):
            dirs_seen += 1
            
            # Check timeout
            if time.time() - start_time > max_seconds:
                sampled = True
                break
            
            for name in files:
                file_path = Path(root) / name
                file_count += 1
                
                try:
                    stat = file_path.stat()
                    total_size += stat.st_size
                    mod_time = datetime.fromtimestamp(stat.st_mtime)
                    if last_modified is None or mod_time > last_modified:
                        last_modified = mod_time
                except (OSError, PermissionError):
                    pass
                
                # Check file limit
                if file_count >= max_files:
                    sampled = True
                    break
            
            if sampled:
                break
        
        # Extrapolate if sampled
        if sampled and file_count > 0:
            # Quick directory count estimate
            try:
                total_dirs = sum(1 for _ in os.walk(path))
                if dirs_seen > 0 and total_dirs > dirs_seen:
                    ratio = total_dirs / dirs_seen
                    file_count = int(file_count * ratio)
                    total_size = int(total_size * ratio)
            except (OSError, PermissionError):
                # Fallback: just multiply by 10 if we can't count
                file_count = file_count * 10
                total_size = total_size * 10
                
    except (OSError, PermissionError):
        pass
    
    return file_count, total_size, subdir_count, last_modified


@router.get("/", response_model=ProjectsResponse)
async def list_projects(
    refresh_stats: bool = Query(default=False, description="Force refresh of directory stats")
):
    """
    List all projects (first-level directories in /documents).
    """
    # Documents path from environment or default
    documents_path = os.environ.get("DOCUMENTS_PATH", "/documents")
    docs_dir = Path(documents_path)
    
    if not docs_dir.exists():
        return ProjectsResponse(
            projects=[],
            documents_path=documents_path,
            total_projects=0
        )
    
    projects = []
    
    # List first-level directories only
    try:
        for item in sorted(docs_dir.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                # Get directory stats
                file_count, total_size, subdir_count, last_modified = get_directory_stats(item)
                
                projects.append(Project(
                    name=item.name,
                    path=str(item),
                    file_count=file_count,
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
async def get_project(project_name: str):
    """
    Get details for a specific project.
    """
    documents_path = os.environ.get("DOCUMENTS_PATH", "/documents")
    project_path = Path(documents_path) / project_name
    
    if not project_path.exists() or not project_path.is_dir():
        return {"error": "Project not found"}
    
    file_count, total_size, subdir_count, last_modified = get_directory_stats(project_path)
    
    # List immediate subdirectories
    subdirs = []
    try:
        for item in sorted(project_path.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                sub_files, sub_size, _, sub_mod = get_directory_stats(item)
                subdirs.append({
                    "name": item.name,
                    "file_count": sub_files,
                    "size_bytes": sub_size,
                    "last_modified": sub_mod
                })
    except (OSError, PermissionError):
        pass
    
    return {
        "name": project_name,
        "path": str(project_path),
        "file_count": file_count,
        "total_size_bytes": total_size,
        "last_modified": last_modified,
        "subdirectories": subdirs
    }


@router.get("/{project_name}/files")
async def list_project_files(
    project_name: str,
    limit: int = Query(default=100, le=1000),
    extensions: Optional[str] = Query(default=None, description="Comma-separated extensions filter")
):
    """
    List files in a project with optional extension filter.
    """
    documents_path = os.environ.get("DOCUMENTS_PATH", "/documents")
    project_path = Path(documents_path) / project_name
    
    if not project_path.exists():
        return {"error": "Project not found"}
    
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
async def get_project_stats(project_name: str):
    """
    Get indexing statistics for a specific project.
    Returns document counts, type breakdown, and scan info for this project only.
    """
    from sqlalchemy import func
    from ..database import SessionLocal
    from ..models import Document, Scan, ScanStatus, DocumentType
    
    documents_path = os.environ.get("DOCUMENTS_PATH", "/documents")
    project_path = str(Path(documents_path) / project_name)
    
    db = SessionLocal()
    try:
        # Documents indexed for this project (file_path starts with project path)
        total_docs = db.query(func.count(Document.id)).filter(
            Document.file_path.like(f"{project_path}%")
        ).scalar() or 0
        
        # By type
        type_counts = db.query(
            Document.file_type,
            func.count(Document.id)
        ).filter(
            Document.file_path.like(f"{project_path}%")
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
            Document.file_path.like(f"{project_path}%")
        ).scalar() or 0
        
        # Scans for this project
        scans = db.query(Scan).filter(
            Scan.path.like(f"{project_path}%")
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

