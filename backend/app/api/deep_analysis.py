"""
Archon Backend - Deep Analysis API Routes
LangExtract LLM-based structured extraction endpoints.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DeepAnalysis, DeepAnalysisStatus, Document, User
from ..schemas import DeepAnalysisOut, DeepAnalysisBatchRequest
from ..utils.auth import get_current_user, require_role
from ..telemetry.request_context import get_request_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deep-analysis", tags=["deep-analysis"])


@router.get("/{document_id}", response_model=Optional[DeepAnalysisOut])
def get_deep_analysis(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get deep analysis results for a document."""
    analysis = db.query(DeepAnalysis).filter(
        DeepAnalysis.document_id == document_id
    ).first()

    if not analysis:
        return None

    return analysis


@router.get("/{document_id}/status")
def get_deep_analysis_status(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the status of a deep analysis (for polling)."""
    analysis = db.query(DeepAnalysis).filter(
        DeepAnalysis.document_id == document_id
    ).first()

    if not analysis:
        return {"status": "none", "document_id": document_id}

    return {
        "status": analysis.status.value if hasattr(analysis.status, "value") else analysis.status,
        "document_id": document_id,
        "processing_time_ms": analysis.processing_time_ms,
        "error_message": analysis.error_message,
    }


@router.post("/{document_id}/trigger")
def trigger_deep_analysis(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst")),
):
    """Trigger deep analysis for a single document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check if already completed
    existing = db.query(DeepAnalysis).filter(
        DeepAnalysis.document_id == document_id,
        DeepAnalysis.status == DeepAnalysisStatus.COMPLETED,
    ).first()
    if existing:
        return {"status": "already_completed", "document_id": document_id}

    # Check if already running
    running = db.query(DeepAnalysis).filter(
        DeepAnalysis.document_id == document_id,
        DeepAnalysis.status.in_([DeepAnalysisStatus.PENDING, DeepAnalysisStatus.RUNNING]),
    ).first()
    if running:
        return {"status": "already_running", "document_id": document_id}

    # Launch Celery task
    from ..workers.tasks import run_deep_analysis
    task = run_deep_analysis.delay([document_id], request_id=get_request_id())

    return {
        "status": "triggered",
        "document_id": document_id,
        "task_id": task.id,
    }


@router.post("/batch")
def trigger_batch_deep_analysis(
    request: DeepAnalysisBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst")),
):
    """Trigger deep analysis for multiple documents (max 50)."""
    # Verify all documents exist
    existing_docs = db.query(Document.id).filter(
        Document.id.in_(request.document_ids)
    ).all()
    existing_ids = {doc.id for doc in existing_docs}
    missing_ids = [d for d in request.document_ids if d not in existing_ids]

    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Documents not found: {missing_ids}"
        )

    # Filter out already completed
    completed = db.query(DeepAnalysis.document_id).filter(
        DeepAnalysis.document_id.in_(request.document_ids),
        DeepAnalysis.status == DeepAnalysisStatus.COMPLETED,
    ).all()
    completed_ids = {da.document_id for da in completed}
    to_analyze = [d for d in request.document_ids if d not in completed_ids]

    if not to_analyze:
        return {
            "status": "all_completed",
            "total": len(request.document_ids),
            "already_completed": len(completed_ids),
        }

    # Launch Celery task
    from ..workers.tasks import run_deep_analysis
    task = run_deep_analysis.delay(to_analyze, request_id=get_request_id())

    return {
        "status": "triggered",
        "task_id": task.id,
        "total": len(to_analyze),
        "already_completed": len(completed_ids),
        "skipped": len(completed_ids),
    }
