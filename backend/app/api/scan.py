"""
Archon Backend - Scan API Routes
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
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
    from pathlib import Path
    
    # Validate path exists
    path = Path(scan_in.path)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {scan_in.path}")
    
    # Cancel any existing running/pending scans for the same path
    existing_running = db.query(Scan).filter(
        Scan.path == str(path.absolute()),
        Scan.status.in_([ScanStatus.RUNNING, ScanStatus.PENDING])
    ).all()
    for existing in existing_running:
        existing.status = ScanStatus.CANCELLED
        if existing.celery_task_id:
            try:
                from app.workers.celery_app import celery_app
                celery_app.control.revoke(existing.celery_task_id, terminate=True)
            except Exception:
                pass
    if existing_running:
        db.commit()
    
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
    task = run_scan.delay(scan.id, enable_embeddings=scan_in.enable_embeddings)
    
    # Update with task ID
    scan.celery_task_id = task.id
    db.commit()
    db.refresh(scan)
    
    return scan


@router.post("/estimate")
def estimate_scan(path: str):
    """
    Estimate scan costs and file count before launching.
    
    OPTIMIZED VERSION (Feb 2026):
    - Redis cache (TTL 5 minutes)
    - Subprocess find/du for fast counting (native C)
    - Intelligent sampling by subdirectories
    - os.scandir instead of os.walk for samples
    
    Target: < 5 seconds for 1.5M documents
    """
    from pathlib import Path
    import os
    import json
    import hashlib
    import redis
    
    target_path = Path(path)
    if not target_path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    
    # ========================================
    # 1. CHECK REDIS CACHE
    # ========================================
    cache_key = f"scan_estimate:{hashlib.md5(path.encode()).hexdigest()}"
    try:
        r = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
        cached = r.get(cache_key)
        if cached:
            result = json.loads(cached)
            result["cached"] = True
            return result
    except Exception:
        r = None  # Redis not available, continue without cache
    
    # ========================================
    # 2. FAST FILE COUNT (safe, no shell injection)
    # ========================================
    supported_extensions = {
        '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp',
        '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log',
        '.mp4', '.webm', '.mov', '.avi', '.mkv'
    }
    
    file_count = 0
    size_bytes = 0
    
    try:
        # Safe counting via os.walk — no shell injection possible
        for root, dirs, files in os.walk(target_path):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for filename in files:
                if filename.startswith('.'):
                    continue
                ext = os.path.splitext(filename)[1].lower()
                if ext in supported_extensions:
                    file_count += 1
                    try:
                        size_bytes += os.path.getsize(os.path.join(root, filename))
                    except OSError:
                        pass
                # Safety: stop counting after 2M files to avoid long waits
                if file_count >= 2_000_000:
                    break
            if file_count >= 2_000_000:
                break
    except (OSError, PermissionError):
        file_count = 0
    
    # ========================================
    # 3. INTELLIGENT SAMPLING FOR TYPE BREAKDOWN
    # ========================================
    type_counts = {"pdf": 0, "image": 0, "text": 0, "video": 0}
    sample_count = 0
    MAX_SAMPLE = 2000
    
    def categorize_ext(ext):
        ext = ext.lower()
        if ext == '.pdf':
            return 'pdf'
        elif ext in {'.mp4', '.webm', '.mov', '.avi', '.mkv'}:
            return 'video'
        elif ext in {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp'}:
            return 'image'
        elif ext in {'.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log'}:
            return 'text'
        return None
    
    try:
        # Use os.walk for FULL recursive sampling - scandir was only first level!
        for root, dirs, files in os.walk(target_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            
            for filename in files:
                if filename.startswith('.'):
                    continue
                    
                ext = os.path.splitext(filename)[1]
                cat = categorize_ext(ext)
                if cat:
                    type_counts[cat] += 1
                    sample_count += 1
                    
                    # Get size from sample if subprocess failed
                    if size_bytes == 0 and sample_count <= 500:
                        try:
                            size_bytes += os.path.getsize(os.path.join(root, filename))
                        except OSError:
                            pass
                
                # Stop after MAX_SAMPLE files sampled
                if sample_count >= MAX_SAMPLE:
                    break
            
            if sample_count >= MAX_SAMPLE:
                break
                
    except Exception:
        pass
    
    # ========================================
    # 4. EXTRAPOLATE TYPE COUNTS
    # ========================================
    if sample_count > 0 and file_count > sample_count:
        ratio = file_count / sample_count
        for key in type_counts:
            type_counts[key] = int(type_counts[key] * ratio)
        
        # Extrapolate size if we only have sample
        if size_bytes < 1024 * 1024:  # Less than 1MB means we only sampled
            avg_size = size_bytes / sample_count if sample_count > 0 else 50000
            size_bytes = int(avg_size * file_count)
    elif file_count == 0:
        # Subprocess failed, use sample count
        file_count = sample_count
    
    # ========================================
    # 5. CALCULATE COSTS
    # ========================================
    estimated_tokens = file_count * 500
    PRICE_PER_MILLION = 0.15  # USD for Gemini embeddings
    estimated_cost_usd = (estimated_tokens / 1_000_000) * PRICE_PER_MILLION
    is_free_tier_ok = file_count < 100_000
    
    result = {
        "file_count": file_count,
        "size_mb": round(size_bytes / (1024 * 1024), 1),
        "type_counts": type_counts,
        "sampled": sample_count < file_count,
        "cached": False,
        "embedding_estimate": {
            "estimated_tokens": estimated_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 2),
            "free_tier_available": is_free_tier_ok,
            "free_tier_note": "Gemini offre un tier gratuit avec limites de débit" if is_free_tier_ok else "Volume élevé - tier payant recommandé"
        }
    }
    
    # ========================================
    # 6. CACHE RESULT
    # ========================================
    if r:
        try:
            r.setex(cache_key, 300, json.dumps(result))  # TTL 5 minutes
        except Exception:
            pass
    
    return result


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


@router.get("/{scan_id}/stream")
async def stream_scan_progress(scan_id: int, db: Session = Depends(get_db)):
    """
    Stream real-time scan progress via Server-Sent Events (SSE).
    
    Yields enriched progress updates every 1.5 seconds until scan completes.
    Includes: phase, speed, ETA, file type breakdown, recent activity.
    """
    from fastapi.responses import StreamingResponse
    from ..database import SessionLocal
    import asyncio
    import json
    import time
    
    # Verify scan exists
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    async def event_generator():
        """Generate SSE events for scan progress."""
        stream_start = time.time()
        last_processed = 0
        speed_samples = []  # Rolling window for smoother speed calc
        
        try:
            while True:
                session = SessionLocal()
                try:
                    scan = session.query(Scan).filter(Scan.id == scan_id).first()
                    if not scan:
                        yield f"event: error\ndata: {json.dumps({'error': 'Scan not found'})}\n\n"
                        break
                    
                    # Base progress data
                    now = time.time()
                    elapsed = int(now - stream_start)
                    
                    # Use scan.started_at for total elapsed if available
                    if scan.started_at:
                        started = scan.started_at
                        # Ensure consistent tz: if started_at is naive, treat as UTC
                        if started.tzinfo is None:
                            started = started.replace(tzinfo=timezone.utc)
                        total_elapsed = int((datetime.now(timezone.utc) - started).total_seconds())
                    else:
                        total_elapsed = elapsed
                    
                    progress_data = {
                        "scan_id": scan_id,
                        "status": scan.status.value,
                        "total_files": scan.total_files,
                        "processed_files": scan.processed_files,
                        "failed_files": scan.failed_files,
                        "current_file": None,
                        "progress_percent": 0.0,
                        "phase": "idle",
                        "files_per_second": 0.0,
                        "eta_seconds": None,
                        "elapsed_seconds": total_elapsed,
                        "type_counts": None,
                        "recent_files": [],
                        "current_file_type": None,
                        "skipped_files": 0,
                        "skipped_details": [],
                        "recent_errors": []
                    }
                    
                    # Get Celery task state if running
                    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
                        try:
                            result = AsyncResult(scan.celery_task_id, app=celery_app)
                            if result.state == "PROGRESS" and result.info:
                                info = result.info
                                progress_data["current_file"] = info.get("current_file")
                                progress_data["progress_percent"] = info.get("progress", 0.0)
                                progress_data["phase"] = info.get("phase", "processing")
                                progress_data["current_file_type"] = info.get("current_file_type")
                                progress_data["recent_files"] = info.get("recent_files", [])
                                progress_data["skipped_files"] = info.get("skipped", 0)
                                progress_data["type_counts"] = info.get("type_counts")
                                progress_data["skipped_details"] = info.get("skipped_details", [])
                                progress_data["recent_errors"] = info.get("recent_errors", [])
                        except Exception:
                            pass
                    
                    # Calculate progress percent from DB if not from Celery
                    if progress_data["progress_percent"] == 0 and scan.total_files > 0:
                        progress_data["progress_percent"] = (scan.processed_files / scan.total_files) * 100
                    
                    # Determine phase from status if not set by Celery
                    if progress_data["phase"] == "idle":
                        if scan.status == ScanStatus.RUNNING:
                            if scan.processed_files == 0 and scan.total_files > 0:
                                progress_data["phase"] = "detection"
                            elif scan.processed_files > 0:
                                progress_data["phase"] = "processing"
                        elif scan.status == ScanStatus.COMPLETED:
                            progress_data["phase"] = "complete"
                    
                    # Compute speed — true average from elapsed time
                    current_processed = scan.processed_files
                    
                    # Primary metric: true average speed = total processed / total time
                    if total_elapsed > 0 and current_processed > 0:
                        avg_speed = current_processed / total_elapsed
                        progress_data["files_per_second"] = round(avg_speed, 1)
                    
                    # For ETA: use EWMA-smoothed instantaneous speed (more responsive)
                    if current_processed > last_processed and total_elapsed > 0:
                        delta = current_processed - last_processed
                        instant_speed = delta / 1.5  # per polling interval
                        if speed_samples:
                            # Exponential weighted moving average (α=0.3)
                            smoothed = 0.3 * instant_speed + 0.7 * speed_samples[-1]
                        else:
                            smoothed = instant_speed
                        speed_samples.append(smoothed)
                        if len(speed_samples) > 10:
                            speed_samples.pop(0)
                    last_processed = current_processed
                    
                    # ETA from smoothed speed (more responsive to current throughput)
                    remaining = scan.total_files - current_processed
                    if speed_samples and remaining > 0:
                        eta_speed = speed_samples[-1]
                        if eta_speed > 0:
                            progress_data["eta_seconds"] = int(remaining / eta_speed)
                    
                    # Send SSE event
                    yield f"event: progress\ndata: {json.dumps(progress_data)}\n\n"
                    
                    # Stop streaming if scan is done
                    if scan.status in [ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED]:
                        progress_data["phase"] = "complete" if scan.status == ScanStatus.COMPLETED else progress_data["phase"]
                        yield f"event: complete\ndata: {json.dumps(progress_data)}\n\n"
                        break
                        
                finally:
                    session.close()
                
                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            pass  # Client disconnected
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


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


from pydantic import BaseModel as PydanticBaseModel


class ScanRenameRequest(PydanticBaseModel):
    label: str


@router.patch("/{scan_id}/rename")
def rename_scan(scan_id: int, body: ScanRenameRequest, db: Session = Depends(get_db)):
    """Rename a scan with a user-friendly label."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan.label = body.label.strip() or None
    db.commit()
    
    return {"status": "renamed", "scan_id": scan_id, "label": scan.label}


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
    
    # Cancel any other running/pending scans for the same project path
    other_running = db.query(Scan).filter(
        Scan.path == scan.path,
        Scan.id != scan.id,
        Scan.status.in_([ScanStatus.RUNNING, ScanStatus.PENDING])
    ).all()
    for other in other_running:
        other.status = ScanStatus.CANCELLED
        if other.celery_task_id:
            try:
                from app.workers.celery_app import celery_app
                celery_app.control.revoke(other.celery_task_id, terminate=True)
            except Exception:
                pass
    
    # Reset status to pending
    scan.status = ScanStatus.PENDING
    db.commit()
    
    # Launch Celery task with resume flag + embeddings option
    task = run_scan.delay(scan.id, resume=True, enable_embeddings=bool(scan.enable_embeddings))
    
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


@router.post("/factory-reset")
def factory_reset(db: Session = Depends(get_db)):
    """
    Factory reset — delete ALL data.
    Kills running tasks, clears database, MeiliSearch, Qdrant, and Redis.
    """
    from ..models import Document
    from ..services.meilisearch import get_meilisearch_service
    from ..services.qdrant import get_qdrant_service
    import time
    import signal
    
    # ── 1. Kill running Celery tasks (SIGKILL for immediate termination) ──
    running_scans = db.query(Scan).filter(Scan.status == ScanStatus.RUNNING).all()
    task_ids = []
    for scan in running_scans:
        if scan.celery_task_id:
            task_ids.append(scan.celery_task_id)
            try:
                celery_app.control.revoke(
                    scan.celery_task_id, 
                    terminate=True, 
                    signal=signal.SIGKILL
                )
            except Exception:
                pass
    
    # Purge any pending tasks from the queue
    try:
        celery_app.control.purge()
    except Exception:
        pass
    
    # Brief wait for task termination to prevent race conditions
    if task_ids:
        time.sleep(1.5)
    
    # ── 2. Count before deleting ──
    scan_count = db.query(Scan).count()
    doc_count = db.query(Document).count()
    
    # ── 3. Fast cascading delete via raw SQL (100x faster than ORM) ──
    try:
        db.execute(text("DELETE FROM favorite_tags"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM favorites"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM entities"))
    except Exception:
        pass
    try:
        db.execute(text("DELETE FROM scan_errors"))
    except Exception:
        pass
    db.execute(text("DELETE FROM documents"))
    db.execute(text("DELETE FROM scans"))
    db.commit()
    
    # ── 4. Clear MeiliSearch ──
    try:
        meili = get_meilisearch_service()
        meili.client.index("documents").delete_all_documents()
    except Exception:
        pass
    
    # ── 5. Clear Qdrant (delete + recreate collection) ──
    try:
        qdrant = get_qdrant_service()
        qdrant.client.delete_collection("documents")
        # Recreate the collection so future scans don't need to
        from qdrant_client.models import VectorParams, Distance
        qdrant.client.create_collection(
            collection_name="documents",
            vectors_config=VectorParams(size=3072, distance=Distance.COSINE),
        )
    except Exception:
        pass
    
    # ── 6. Clear Redis caches ──
    try:
        import redis
        r = redis.from_url("redis://redis:6379/0")
        for key in r.scan_iter("scan_estimate:*"):
            r.delete(key)
        # Also clear Celery result backend
        for key in r.scan_iter("celery-task-meta-*"):
            r.delete(key)
    except Exception:
        pass
    
    return {
        "status": "reset_complete",
        "deleted_scans": scan_count,
        "deleted_documents": doc_count
    }

