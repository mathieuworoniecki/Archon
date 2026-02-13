"""
Investigation tasks API.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import InvestigationTask, User
from ..schemas import (
    InvestigationTaskCreate,
    InvestigationTaskUpdate,
    InvestigationTaskOut,
)
from ..utils.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=List[InvestigationTaskOut])
def list_tasks(
    status: Optional[str] = Query(default=None, pattern="^(todo|in_progress|blocked|done)$"),
    priority: Optional[str] = Query(default=None, pattern="^(low|medium|high|critical)$"),
    project_path: Optional[str] = Query(default=None),
    document_id: Optional[int] = Query(default=None, ge=1),
    assignee_username: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(InvestigationTask)
    if status:
        query = query.filter(InvestigationTask.status == status)
    if priority:
        query = query.filter(InvestigationTask.priority == priority)
    if project_path:
        query = query.filter(InvestigationTask.project_path == project_path)
    if document_id:
        query = query.filter(InvestigationTask.document_id == document_id)
    if assignee_username:
        query = query.filter(InvestigationTask.assignee_username == assignee_username)
    return (
        query.order_by(InvestigationTask.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/", response_model=InvestigationTaskOut)
def create_task(
    payload: InvestigationTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = InvestigationTask(
        title=payload.title.strip(),
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        project_path=payload.project_path,
        document_id=payload.document_id,
        assignee_username=payload.assignee_username,
        created_by_user_id=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=InvestigationTaskOut)
def update_task(
    task_id: int,
    payload: InvestigationTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(InvestigationTask).filter(InvestigationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key == "title" and value is not None:
            value = value.strip()
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(InvestigationTask).filter(InvestigationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"status": "deleted", "task_id": task_id}
