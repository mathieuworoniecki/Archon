"""
War Room Backend - Celery Tasks
Multi-pass document processing pipeline
"""
import os
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from celery import current_task
from sqlalchemy.orm import Session

from .celery_app import celery_app
from ..database import get_db_context
from ..models import Scan, Document, ScanError, ScanStatus, DocumentType, Entity
from ..services.ocr import get_ocr_service, OCRService
from ..services.meilisearch import get_meilisearch_service
from ..services.qdrant import get_qdrant_service
from ..services.embeddings import get_embeddings_service
from ..services.archive_extractor import get_archive_extractor
from ..services.ner_service import get_ner_service
from ..utils.hashing import compute_file_hashes
from ..config import get_settings

settings = get_settings()


def update_scan_progress(scan_id: int, db: Session, **kwargs):
    """Update scan progress in database."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if scan:
        for key, value in kwargs.items():
            if hasattr(scan, key):
                setattr(scan, key, value)
        db.commit()


def log_scan_error(scan_id: int, db: Session, file_path: str, error_type: str, error_message: str):
    """Log a scan error."""
    error = ScanError(
        scan_id=scan_id,
        file_path=file_path,
        error_type=error_type,
        error_message=str(error_message)[:2000]  # Limit error message length
    )
    db.add(error)
    db.commit()


def discover_files(root_path: str, ocr_service: OCRService) -> List[Dict[str, Any]]:
    """
    Discover all processable files in a directory.
    Extracts archives (ZIP/RAR/7Z/TAR) recursively.
    
    Returns:
        List of dicts with file info including archive_path for extracted files.
    """
    files = []
    root = Path(root_path)
    
    if not root.exists():
        raise FileNotFoundError(f"Path does not exist: {root_path}")
    
    # Use archive extractor to handle archives recursively
    with get_archive_extractor(max_depth=5) as extractor:
        result = extractor.extract_recursive(root_path)
        
        for file_path, archive_path in result.files:
            doc_type = ocr_service.detect_type(str(file_path))
            if doc_type != DocumentType.UNKNOWN:
                files.append({
                    "path": str(file_path),
                    "type": doc_type,
                    "archive_path": archive_path  # e.g., "archive.zip/subdir/"
                })
    
    return files


@celery_app.task(bind=True, name="app.workers.tasks.run_scan")
def run_scan(self, scan_id: int, resume: bool = False):
    """
    Main scan task - orchestrates the multi-pass pipeline.
    
    Pipeline:
    1. Detection: Discover all files
    2. Extraction: Extract text (with OCR if needed)
    3. Indexation Meilisearch: Full-text index
    4. Indexation Qdrant: Semantic embeddings
    5. NER Extraction: Named entities
    
    Args:
        scan_id: ID of the scan to process
        resume: If True, skip already processed documents
    """
    
    with get_db_context() as db:
        # Get scan record
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            return {"error": f"Scan {scan_id} not found"}
        
        # Get already processed files if resuming
        processed_paths = set()
        if resume:
            existing_docs = db.query(Document.file_path).filter(
                Document.scan_id == scan_id
            ).all()
            processed_paths = {doc.file_path for doc in existing_docs}
        
        # Update scan status
        scan.status = ScanStatus.RUNNING
        if not resume:
            scan.started_at = datetime.utcnow()
        scan.celery_task_id = self.request.id
        db.commit()
        
        try:
            # Initialize services
            ocr_service = get_ocr_service()
            meili_service = get_meilisearch_service()
            qdrant_service = get_qdrant_service()
            embeddings_service = get_embeddings_service()
            
            # === PASS 1: DETECTION ===
            self.update_state(state="PROGRESS", meta={"phase": "detection", "progress": 0})
            
            files = discover_files(scan.path, ocr_service)
            
            # Filter out already processed files when resuming
            if resume and processed_paths:
                files = [f for f in files if f["path"] not in processed_paths]
                # Update total to remaining
                scan.total_files = len(files) + len(processed_paths)
            else:
                scan.total_files = len(files)
            db.commit()
            
            if not files:
                scan.status = ScanStatus.COMPLETED
                scan.completed_at = datetime.utcnow()
                db.commit()
                return {"status": "completed", "total_files": 0}
            
            processed = 0
            failed = 0
            
            # Process each file
            for file_info in files:
                file_path = file_info["path"]
                file_type = file_info["type"]
                archive_path = file_info.get("archive_path")  # May be None
                
                try:
                    # Update progress
                    progress = (processed / len(files)) * 100
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "phase": "processing",
                            "progress": progress,
                            "current_file": Path(file_path).name,
                            "processed": processed,
                            "total": len(files)
                        }
                    )
                    
                    # Get file metadata
                    metadata = ocr_service.get_file_metadata(file_path)
                    
                    # === PASS 2: EXTRACTION ===
                    text_content, used_ocr = ocr_service.extract_text(file_path)
                    
                    if not text_content or not text_content.strip():
                        # Log as warning but continue
                        log_scan_error(
                            scan_id, db, file_path,
                            "EmptyContent",
                            "No text content could be extracted"
                        )
                        failed += 1
                        scan.failed_files = failed
                        db.commit()
                        continue
                    
                    # === PASS 2.5: COMPUTE HASHES (Chain of Proof) ===
                    hash_md5, hash_sha256 = compute_file_hashes(file_path)
                    
                    # Create document record
                    document = Document(
                        scan_id=scan_id,
                        file_path=file_path,
                        file_name=metadata["file_name"],
                        file_type=file_type,
                        file_size=metadata["file_size"],
                        text_content=text_content,
                        text_length=len(text_content),
                        has_ocr=1 if used_ocr else 0,
                        file_modified_at=datetime.fromtimestamp(metadata["file_modified_at"]),
                        archive_path=archive_path,  # Track archive origin
                        hash_md5=hash_md5,
                        hash_sha256=hash_sha256
                    )
                    db.add(document)
                    db.flush()  # Get document ID

                    
                    # === PASS 3: MEILISEARCH INDEXATION ===
                    meili_result = meili_service.index_document(
                        doc_id=document.id,
                        file_path=file_path,
                        file_name=metadata["file_name"],
                        file_type=file_type.value,
                        text_content=text_content,
                        scan_id=scan_id,
                        file_modified_at=document.file_modified_at.isoformat() if document.file_modified_at else None,
                        file_size=metadata["file_size"]
                    )
                    document.meilisearch_id = str(document.id)
                    
                    # === PASS 4: QDRANT VECTORIZATION ===
                    if text_content and settings.gemini_api_key:
                        try:
                            # Chunk and embed
                            chunks_with_embeddings = embeddings_service.process_document(text_content)
                            
                            if chunks_with_embeddings:
                                # Index in Qdrant
                                point_ids = qdrant_service.index_chunks(
                                    document_id=document.id,
                                    scan_id=scan_id,
                                    file_path=file_path,
                                    file_name=metadata["file_name"],
                                    file_type=file_type.value,
                                    chunks=chunks_with_embeddings
                                )
                                document.qdrant_ids = json.dumps(point_ids)
                        except Exception as e:
                            # Log embedding error but don't fail the document
                            log_scan_error(
                                scan_id, db, file_path,
                                "EmbeddingError",
                                str(e)
                            )
                    
                    # === PASS 5: NER EXTRACTION ===
                    if text_content:
                        try:
                            ner_service = get_ner_service()
                            extracted_entities = ner_service.extract_entities(
                                text_content,
                                include_types=["PER", "ORG", "LOC", "MISC"]
                            )
                            
                            for ent in extracted_entities:
                                entity = Entity(
                                    document_id=document.id,
                                    text=ent["text"][:255],  # Truncate if needed
                                    type=ent["type"],
                                    count=ent["count"],
                                    start_char=ent.get("start_char")
                                )
                                db.add(entity)
                        except Exception as e:
                            # NER is optional, log but don't fail
                            log_scan_error(
                                scan_id, db, file_path,
                                "NERError",
                                str(e)
                            )
                    
                    db.commit()
                    processed += 1
                    scan.processed_files = processed
                    db.commit()
                    
                except Exception as e:
                    # Log error and continue with next file
                    log_scan_error(
                        scan_id, db, file_path,
                        type(e).__name__,
                        str(e)
                    )
                    failed += 1
                    scan.failed_files = failed
                    db.commit()
            
            # Update final status
            scan.status = ScanStatus.COMPLETED
            scan.completed_at = datetime.utcnow()
            db.commit()
            
            return {
                "status": "completed",
                "total_files": len(files),
                "processed": processed,
                "failed": failed
            }
            
        except Exception as e:
            # Fatal error - mark scan as failed
            scan.status = ScanStatus.FAILED
            scan.error_message = str(e)
            scan.completed_at = datetime.utcnow()
            db.commit()
            
            raise


@celery_app.task(bind=True, name="app.workers.tasks.process_document")
def process_document(self, document_id: int):
    """
    Process a single document (for re-indexing).
    """
    with get_db_context() as db:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return {"error": f"Document {document_id} not found"}
        
        try:
            meili_service = get_meilisearch_service()
            qdrant_service = get_qdrant_service()
            embeddings_service = get_embeddings_service()
            
            # Re-index in Meilisearch
            meili_service.index_document(
                doc_id=document.id,
                file_path=document.file_path,
                file_name=document.file_name,
                file_type=document.file_type.value,
                text_content=document.text_content,
                scan_id=document.scan_id,
                file_modified_at=document.file_modified_at.isoformat() if document.file_modified_at else None,
                file_size=document.file_size
            )
            
            # Re-index in Qdrant
            if document.text_content and settings.gemini_api_key:
                # Delete old vectors
                if document.qdrant_ids:
                    qdrant_service.delete_by_document(document.id)
                
                # Create new embeddings
                chunks_with_embeddings = embeddings_service.process_document(document.text_content)
                if chunks_with_embeddings:
                    point_ids = qdrant_service.index_chunks(
                        document_id=document.id,
                        scan_id=document.scan_id,
                        file_path=document.file_path,
                        file_name=document.file_name,
                        file_type=document.file_type.value,
                        chunks=chunks_with_embeddings
                    )
                    document.qdrant_ids = json.dumps(point_ids)
                    db.commit()
            
            return {"status": "completed", "document_id": document_id}
            
        except Exception as e:
            return {"status": "failed", "error": str(e)}
