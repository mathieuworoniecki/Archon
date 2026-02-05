"""
Projects API endpoints.
Projects are based on first-level directories in the documents folder.
"""
import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel
from datetime import datetime

from ..config import get_settings

settings = get_settings()

router = APIRouter(prefix="/api/projects", tags=["projects"])


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


def get_directory_stats(path: Path) -> tuple[int, int, int, Optional[datetime]]:
    """
    Get stats for a directory: file_count, total_size, subdir_count, last_modified.
    """
    file_count = 0
    total_size = 0
    subdir_count = 0
    last_modified = None
    
    try:
        for item in path.rglob("*"):
            if item.is_file():
                file_count += 1
                try:
                    stat = item.stat()
                    total_size += stat.st_size
                    mod_time = datetime.fromtimestamp(stat.st_mtime)
                    if last_modified is None or mod_time > last_modified:
                        last_modified = mod_time
                except (OSError, PermissionError):
                    pass
            elif item.is_dir() and item.parent == path:
                subdir_count += 1
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
        print(f"Error listing projects: {e}")
    
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
