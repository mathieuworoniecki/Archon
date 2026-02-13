"""
Audit Log API endpoints for chain of proof.
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, ConfigDict
import hashlib
import json

from ..database import get_db
from ..models import AuditLog, AuditAction, Document, User
from ..utils.auth import require_role


router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: int
    action: str
    document_id: Optional[int] = None
    scan_id: Optional[int] = None
    details: Optional[dict] = None
    user_ip: Optional[str] = None
    entry_hash: Optional[str] = None
    previous_hash: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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


def _compute_entry_hash(
    action: str,
    created_at: str,
    details: Optional[str],
    previous_hash: Optional[str]
) -> str:
    """Compute SHA256 hash for an audit entry (tamper evidence)."""
    payload = f"{action}|{created_at}|{details or ''}|{previous_hash or 'GENESIS'}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log_audit_action(
    db: Session,
    action: AuditAction,
    document_id: Optional[int] = None,
    scan_id: Optional[int] = None,
    details: Optional[dict] = None,
    user_ip: Optional[str] = None
) -> AuditLog:
    """Create an audit log entry with hash-chain integrity."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    details_json = json.dumps(details) if details else None

    # Get hash of previous entry to form the chain
    prev = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = prev.entry_hash if (prev and prev.entry_hash) else None

    entry_hash = _compute_entry_hash(
        action.value, now.isoformat(), details_json, previous_hash
    )

    log = AuditLog(
        action=action,
        document_id=document_id,
        scan_id=scan_id,
        details=details_json,
        user_ip=user_ip,
        entry_hash=entry_hash,
        previous_hash=previous_hash,
        created_at=now
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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin"))
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
            "entry_hash": log.entry_hash,
            "previous_hash": log.previous_hash,
            "created_at": log.created_at
        }
        result.append(log_dict)
    
    return result


@router.get("/document/{document_id}")
async def get_document_audit_trail(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst"))
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
                "entry_hash": log.entry_hash,
                "previous_hash": log.previous_hash,
                "created_at": log.created_at
            }
            for log in logs
        ]
    }


@router.post("/log")
async def create_audit_log(
    log_data: AuditLogCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin"))
):
    """Create a manual audit log entry."""
    try:
        action = AuditAction(log_data.action)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid action: {log_data.action}")

    details = dict(log_data.details) if log_data.details else {}
    details["created_by"] = current_user.username
    details["created_by_role"] = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    
    log = log_audit_action(
        db=db,
        action=action,
        document_id=log_data.document_id,
        scan_id=log_data.scan_id,
        details=details,
        user_ip=get_client_ip(request)
    )
    
    return {"id": log.id, "created_at": log.created_at}
