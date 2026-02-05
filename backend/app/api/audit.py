"""
Audit Log API endpoints for chain of proof.
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
import json

from ..database import get_db
from ..models import AuditLog, AuditAction, Document


router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: int
    action: str
    document_id: Optional[int] = None
    scan_id: Optional[int] = None
    details: Optional[dict] = None
    user_ip: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogCreate(BaseModel):
    action: str
    document_id: Optional[int] = None
    scan_id: Optional[int] = None
    details: Optional[dict] = None


def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def log_audit_action(
    db: Session,
    action: AuditAction,
    document_id: Optional[int] = None,
    scan_id: Optional[int] = None,
    details: Optional[dict] = None,
    user_ip: Optional[str] = None
) -> AuditLog:
    """Create an audit log entry."""
    log = AuditLog(
        action=action,
        document_id=document_id,
        scan_id=scan_id,
        details=json.dumps(details) if details else None,
        user_ip=user_ip
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/", response_model=List[AuditLogResponse])
async def get_audit_logs(
    action: Optional[str] = None,
    document_id: Optional[int] = None,
    scan_id: Optional[int] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get audit logs with optional filtering."""
    query = db.query(AuditLog)
    
    if action:
        query = query.filter(AuditLog.action == action)
    if document_id:
        query = query.filter(AuditLog.document_id == document_id)
    if scan_id:
        query = query.filter(AuditLog.scan_id == scan_id)
    
    logs = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit).all()
    
    # Parse JSON details
    result = []
    for log in logs:
        log_dict = {
            "id": log.id,
            "action": log.action.value if hasattr(log.action, 'value') else log.action,
            "document_id": log.document_id,
            "scan_id": log.scan_id,
            "details": json.loads(log.details) if log.details else None,
            "user_ip": log.user_ip,
            "created_at": log.created_at
        }
        result.append(log_dict)
    
    return result


@router.get("/document/{document_id}")
async def get_document_audit_trail(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get complete audit trail for a specific document."""
    # Get document info
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        return {"error": "Document not found"}
    
    # Get all logs for this document
    logs = db.query(AuditLog).filter(
        AuditLog.document_id == document_id
    ).order_by(AuditLog.created_at).all()
    
    return {
        "document": {
            "id": document.id,
            "file_name": document.file_name,
            "file_path": document.file_path,
            "hash_md5": document.hash_md5,
            "hash_sha256": document.hash_sha256,
            "indexed_at": document.indexed_at
        },
        "audit_trail": [
            {
                "id": log.id,
                "action": log.action.value if hasattr(log.action, 'value') else log.action,
                "details": json.loads(log.details) if log.details else None,
                "user_ip": log.user_ip,
                "created_at": log.created_at
            }
            for log in logs
        ]
    }


@router.post("/log")
async def create_audit_log(
    log_data: AuditLogCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create a manual audit log entry."""
    try:
        action = AuditAction(log_data.action)
    except ValueError:
        return {"error": f"Invalid action: {log_data.action}"}
    
    log = log_audit_action(
        db=db,
        action=action,
        document_id=log_data.document_id,
        scan_id=log_data.scan_id,
        details=log_data.details,
        user_ip=get_client_ip(request)
    )
    
    return {"id": log.id, "created_at": log.created_at}
