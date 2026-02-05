"""
War Room Backend - Scan API Routes
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from celery.result import AsyncResult

from ..database import get_db
from ..models import Scan, ScanStatus
from ..schemas import ScanCreate, ScanOut, ScanProgress
from ..workers.celery_app import celery_app
from ..workers.tasks import run_scan

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("/", response_model=ScanOut)
def create_scan(scan_in: ScanCreate, db: Session = Depends(get_db)):
    """
    Create and launch a new scan.
    
    The scan runs in the background via Celery.
    """
    import os
    from pathlib import Path
    
    # Validate path exists
    path = Path(scan_in.path)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {scan_in.path}")
    
    # Create scan record
    scan = Scan(
        path=str(path.absolute()),
        status=ScanStatus.PENDING,
        enable_embeddings=1 if scan_in.enable_embeddings else 0
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    
    # Launch Celery task with embeddings option
    task = run_scan.delay(scan.id, scan_in.enable_embeddings)
    
    # Update with task ID
    scan.celery_task_id = task.id
    db.commit()
    db.refresh(scan)
    
    return scan


@router.post("/estimate")
def estimate_scan(path: str):
    """
    Estimate scan costs and file count before launching.
    Returns file count and embedding cost estimation.
    """
    from pathlib import Path
    import os
    
    target_path = Path(path)
    if not target_path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    
    # Count files
    supported_extensions = {
        '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp',
        '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log',
        '.mp4', '.webm', '.mov', '.avi', '.mkv'
    }
    
    file_count = 0
    size_bytes = 0
    type_counts = {"pdf": 0, "image": 0, "text": 0, "video": 0}
    
    for root, _, files in os.walk(target_path):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext in supported_extensions:
                file_count += 1
                try:
                    file_path = os.path.join(root, filename)
                    size_bytes += os.path.getsize(file_path)
                except:
                    pass
                
                if ext == '.pdf':
                    type_counts["pdf"] += 1
                elif ext in {'.mp4', '.webm', '.mov', '.avi', '.mkv'}:
                    type_counts["video"] += 1
                elif ext in {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp'}:
                    type_counts["image"] += 1
                else:
                    type_counts["text"] += 1
    
    # Estimate tokens and costs
    # Average ~500 tokens per document for embeddings
    estimated_tokens = file_count * 500
    
    # Gemini embedding pricing
    PRICE_PER_MILLION = 0.15  # USD
    FREE_TIER_LIMIT = 1500  # requests per minute (approximate daily limit ~2M requests)
    
    estimated_cost_usd = (estimated_tokens / 1_000_000) * PRICE_PER_MILLION
    is_free_tier_ok = file_count < 100_000  # Generous estimate for free tier
    
    return {
        "file_count": file_count,
        "size_mb": round(size_bytes / (1024 * 1024), 1),
        "type_counts": type_counts,
        "embedding_estimate": {
            "estimated_tokens": estimated_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 2),
            "free_tier_available": is_free_tier_ok,
            "free_tier_note": "Gemini offre un tier gratuit avec limites de débit" if is_free_tier_ok else "Volume élevé - tier payant recommandé"
        }
    }


@router.get("/", response_model=List[ScanOut])
def list_scans(
    skip: int = 0,
    limit: int = 20,
    status: Optional[ScanStatus] = None,
    db: Session = Depends(get_db)
):
    """List all scans with optional status filter."""
    query = db.query(Scan)
    
    if status:
        query = query.filter(Scan.status == status)
    
    scans = query.order_by(Scan.created_at.desc()).offset(skip).limit(limit).all()
    return scans


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    """Get scan details including errors."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/progress", response_model=ScanProgress)
def get_scan_progress(scan_id: int, db: Session = Depends(get_db)):
    """Get real-time scan progress from Celery task."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    progress_data = {
        "scan_id": scan_id,
        "status": scan.status,
        "total_files": scan.total_files,
        "processed_files": scan.processed_files,
        "failed_files": scan.failed_files,
        "current_file": None,
        "progress_percent": 0.0
    }
    
    # Get Celery task state if running
    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
        result = AsyncResult(scan.celery_task_id, app=celery_app)
        if result.state == "PROGRESS" and result.info:
            progress_data["current_file"] = result.info.get("current_file")
            progress_data["progress_percent"] = result.info.get("progress", 0.0)
    
    # Calculate progress percent from DB if not from Celery
    if progress_data["progress_percent"] == 0 and scan.total_files > 0:
        progress_data["progress_percent"] = (scan.processed_files / scan.total_files) * 100
    
    return ScanProgress(**progress_data)


@router.delete("/{scan_id}")
def delete_scan(scan_id: int, db: Session = Depends(get_db)):
    """Delete a scan and its documents."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Cancel Celery task if running
    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    # Delete from search indices
    from ..services.meilisearch import get_meilisearch_service
    from ..services.qdrant import get_qdrant_service
    
    try:
        meili_service = get_meilisearch_service()
        meili_service.delete_by_scan(scan_id)
    except Exception:
        pass
    
    try:
        qdrant_service = get_qdrant_service()
        qdrant_service.delete_by_scan(scan_id)
    except Exception:
        pass
    
    # Delete from database (cascade deletes documents and errors)
    db.delete(scan)
    db.commit()
    
    return {"status": "deleted", "scan_id": scan_id}


@router.post("/{scan_id}/cancel")
def cancel_scan(scan_id: int, db: Session = Depends(get_db)):
    """Cancel a running scan."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != ScanStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Scan is not running")
    
    # Cancel Celery task
    if scan.celery_task_id:
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    # Update status
    scan.status = ScanStatus.CANCELLED
    db.commit()
    
    return {"status": "cancelled", "scan_id": scan_id}


@router.post("/{scan_id}/resume", response_model=ScanOut)
def resume_scan(scan_id: int, db: Session = Depends(get_db)):
    """
    Resume an interrupted or failed scan.
    
    Continues processing from where it left off.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Only allow resume for failed, cancelled, or interrupted scans
    if scan.status not in [ScanStatus.FAILED, ScanStatus.CANCELLED]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot resume scan with status: {scan.status.value}"
        )
    
    # Reset status to pending
    scan.status = ScanStatus.PENDING
    db.commit()
    
    # Launch Celery task with resume flag
    task = run_scan.delay(scan.id, resume=True)
    
    # Update with new task ID
    scan.celery_task_id = task.id
    scan.status = ScanStatus.RUNNING
    db.commit()
    db.refresh(scan)
    
    return scan


@router.get("/interrupted", response_model=List[ScanOut])
def list_interrupted_scans(db: Session = Depends(get_db)):
    """List all scans that can be resumed (failed or cancelled)."""
    scans = db.query(Scan).filter(
        Scan.status.in_([ScanStatus.FAILED, ScanStatus.CANCELLED])
    ).order_by(Scan.created_at.desc()).all()
    return scans

