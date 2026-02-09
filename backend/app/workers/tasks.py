"""
Archon Backend - Celery Tasks
High-performance batched document processing pipeline

Architecture:
  1. Discovery — os.walk to enumerate all files
  2. Batch Processing — groups of BATCH_SIZE files go through:
     a. Parallel hash computation (ThreadPool)
     b. Batch dedup (single SQL query per batch)
     c. Parallel text extraction (ThreadPool)
     d. Bulk DB insert (single transaction)
     e. Batch MeiliSearch index (single API call)
  3. Post-scan — NER + Embeddings run as separate Celery tasks
"""
import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session

from .celery_app import celery_app
from ..database import get_db_context
from ..models import Scan, Document, ScanError, ScanStatus, DocumentType, Entity
from ..services.ocr import get_ocr_service, OCRService
from ..services.meilisearch import get_meilisearch_service
from ..services.qdrant import get_qdrant_service
from ..services.embeddings import get_embeddings_service
from ..services.ner_service import get_ner_service
from ..utils.hashing import compute_fast_hash, compute_file_hashes
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ═══════════════════════════════════════════════════════════════
# TUNING CONSTANTS
# ═══════════════════════════════════════════════════════════════
BATCH_SIZE = 200          # Files per batch (DB commit + MeiliSearch call)
EXTRACT_WORKERS = 8       # Parallel threads for hash/extraction
PROGRESS_INTERVAL = 200   # Update progress every N files
NER_BATCH_SIZE = 100      # Documents per NER batch
EMBED_BATCH_SIZE = 50     # Documents per embedding batch


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

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
        error_message=str(error_message)[:2000]
    )
    db.add(error)
    db.commit()


def compute_fast_hash_safe(file_path: str) -> Optional[str]:
    """Compute fast hash for dedup, returning None on error."""
    try:
        h = compute_fast_hash(file_path)
        return h if h else None
    except Exception:
        return None


def compute_proof_hashes_safe(file_path: str) -> Optional[Tuple[str, str]]:
    """Compute SHA256+MD5 for chain of proof, only on NEW files."""
    try:
        return compute_file_hashes(file_path)
    except Exception:
        return None


def extract_file_safe(file_info: Dict, ocr_service: OCRService) -> Optional[Dict]:
    """
    Extract text + metadata from a single file. Thread-safe.
    Returns enriched dict or None on failure.
    """
    file_path = file_info["path"]
    file_type = file_info["type"]
    try:
        metadata = ocr_service.get_file_metadata(file_path)

        # Defer OCR for video and image — extract on access, not bulk scan
        if file_type == DocumentType.VIDEO:
            text_content = "[VIDEO] OCR déféré — sera extrait à l'accès"
            used_ocr = False
        elif file_type == DocumentType.IMAGE:
            text_content = "[IMAGE] OCR déféré — sera extrait à l'accès"
            used_ocr = False
        else:
            text_content, used_ocr = ocr_service.extract_text(file_path)

        if not text_content or not text_content.strip():
            return None  # Will be counted as failed

        return {
            **file_info,
            "metadata": metadata,
            "text_content": text_content,
            "used_ocr": used_ocr,
        }
    except Exception as e:
        return {"error": str(e), **file_info}


def discover_files_streaming(root_path: str, ocr_service: OCRService, progress_callback=None) -> List[Dict[str, Any]]:
    """
    Discover all processable files using os.scandir (2-3x faster than os.walk).
    Reports progress during enumeration for real-time UI feedback.
    """
    files = []
    discovered_count = 0

    if not os.path.exists(root_path):
        raise FileNotFoundError(f"Path does not exist: {root_path}")

    def _scan_dir(dirpath: str):
        nonlocal discovered_count
        try:
            with os.scandir(dirpath) as it:
                for entry in it:
                    if entry.name.startswith('.'):
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        _scan_dir(entry.path)
                    elif entry.is_file(follow_symlinks=False):
                        doc_type = ocr_service.detect_type(entry.path)
                        if doc_type != DocumentType.UNKNOWN:
                            files.append({
                                "path": entry.path,
                                "type": doc_type,
                                "archive_path": None
                            })
                            discovered_count += 1
                            if progress_callback and discovered_count % 1000 == 0:
                                progress_callback(discovered_count)
        except PermissionError:
            pass  # Skip inaccessible directories

    _scan_dir(root_path)

    if progress_callback:
        progress_callback(discovered_count)

    return files


# ═══════════════════════════════════════════════════════════════
# MAIN SCAN TASK — Batched Pipeline
# ═══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="app.workers.tasks.run_scan")
def run_scan(self, scan_id: int, resume: bool = False, enable_embeddings: bool = False):
    """
    Main scan task — high-performance batched pipeline.

    Pipeline:
    1. Discovery: Enumerate all files (streaming progress)
    2. Batch Processing (BATCH_SIZE=200 files per cycle):
       a. Parallel hash computation → ThreadPool(8)
       b. Batch dedup → single SQL WHERE IN query
       c. Parallel text extraction → ThreadPool(8)
       d. Bulk DB insert → single transaction
       e. Batch MeiliSearch index → single API call
    3. Post-scan: Auto-launch NER + Embeddings tasks

    Args:
        scan_id: ID of the scan to process
        resume: If True, skip already processed documents
        enable_embeddings: If True, launch embedding task post-scan
    """

    with get_db_context() as db:
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
            scan.started_at = datetime.now(timezone.utc)
        scan.celery_task_id = self.request.id
        db.commit()

        try:
            # Initialize services
            ocr_service = get_ocr_service()
            meili_service = get_meilisearch_service()

            # Redis for real-time progress publishing
            import redis
            redis_client = redis.Redis.from_url(settings.redis_url)

            # ═══ PASS 1: DISCOVERY ═══
            self.update_state(state="PROGRESS", meta={"phase": "detection", "progress": 0})

            def on_discovery_progress(discovered_count: int):
                scan.total_files = discovered_count
                db.commit()
                redis_client.publish(f"scan:{scan_id}:progress", json.dumps({
                    "phase": "detection",
                    "discovered": discovered_count,
                    "progress": 0,
                    "status": "discovering"
                }))

            files = discover_files_streaming(scan.path, ocr_service, on_discovery_progress)

            # Filter already processed on resume
            if resume and processed_paths:
                files = [f for f in files if f["path"] not in processed_paths]
                scan.total_files = len(files) + len(processed_paths)
            else:
                scan.total_files = len(files)
            db.commit()

            if not files:
                scan.status = ScanStatus.COMPLETED
                scan.completed_at = datetime.now(timezone.utc)
                db.commit()
                return {"status": "completed", "total_files": 0}

            # ═══ PASS 2: BATCHED PROCESSING ═══
            processed = len(processed_paths) if resume else 0
            failed = 0
            skipped = 0
            recent_files = []
            type_counts = {}
            skipped_details = []
            recent_errors = []

            total_files = len(files)
            total_batches = (total_files + BATCH_SIZE - 1) // BATCH_SIZE

            for batch_idx in range(total_batches):
                batch_start = batch_idx * BATCH_SIZE
                batch_end = min(batch_start + BATCH_SIZE, total_files)
                batch = files[batch_start:batch_end]

                # --- (a) FAST parallel hash (xxhash for dedup) ---
                with ThreadPoolExecutor(max_workers=EXTRACT_WORKERS) as pool:
                    hash_futures = {pool.submit(compute_fast_hash_safe, f["path"]): f for f in batch}
                    fast_hashes = {}
                    for future in as_completed(hash_futures):
                        f = hash_futures[future]
                        fast_hashes[f["path"]] = future.result()

                # --- (b) Batch dedup via fast hash ---
                valid_hashes = {
                    path: h for path, h in fast_hashes.items() if h is not None
                }
                existing_hashes = set()
                if valid_hashes:
                    hash_list = list(valid_hashes.values())
                    for i in range(0, len(hash_list), 500):
                        chunk = hash_list[i:i + 500]
                        existing_docs = db.query(Document.hash_sha256).filter(
                            Document.hash_sha256.in_(chunk)
                        ).all()
                        existing_hashes.update(r[0] for r in existing_docs)

                # Separate new vs skipped
                new_files = []
                for f in batch:
                    h = fast_hashes.get(f["path"])
                    file_type_str = f["type"].value if hasattr(f["type"], 'value') else str(f["type"])

                    if h is None:
                        skipped += 1
                        processed += 1
                        type_counts[file_type_str] = type_counts.get(file_type_str, 0) + 1
                        continue

                    if h in existing_hashes:
                        skipped += 1
                        processed += 1
                        type_counts[file_type_str] = type_counts.get(file_type_str, 0) + 1
                        skipped_details.append({
                            "file": Path(f["path"]).name,
                            "reason": "Fichier inchangé (hash identique)"
                        })
                        if len(skipped_details) > 10:
                            skipped_details.pop(0)
                        continue

                    f["fast_hash"] = h
                    new_files.append(f)

                if not new_files:
                    # Entire batch was skipped — update progress and continue
                    scan.processed_files = processed
                    db.commit()
                    self.update_state(state="PROGRESS", meta={
                        "phase": "processing",
                        "progress": (processed / scan.total_files) * 100 if scan.total_files > 0 else 0,
                        "processed": processed,
                        "total": scan.total_files,
                        "skipped": skipped,
                        "type_counts": dict(type_counts),
                        "skipped_details": list(skipped_details),
                        "recent_errors": list(recent_errors),
                        "recent_files": list(recent_files),
                    })
                    continue

                # --- (c) Parallel text extraction ---
                extracted_results = []
                with ThreadPoolExecutor(max_workers=EXTRACT_WORKERS) as pool:
                    futures = {pool.submit(extract_file_safe, f, ocr_service): f for f in new_files}
                    for future in as_completed(futures):
                        f = futures[future]
                        result = future.result()
                        extracted_results.append((f, result))

                # --- (d) Compute proof hashes for successfully extracted files ---
                # (only for NEW files that passed extraction — not duplicates)
                proof_hashes = {}
                successfully_extracted = [
                    (fi, er) for fi, er in extracted_results
                    if er is not None and "text_content" in er
                ]
                if successfully_extracted:
                    with ThreadPoolExecutor(max_workers=EXTRACT_WORKERS) as pool:
                        proof_futures = {
                            pool.submit(compute_proof_hashes_safe, fi["path"]): fi
                            for fi, _ in successfully_extracted
                        }
                        for future in as_completed(proof_futures):
                            fi = proof_futures[future]
                            proof_hashes[fi["path"]] = future.result()

                # --- (e) Bulk DB insert ---
                documents_to_add = []
                meili_docs = []
                batch_failed = 0

                for file_info, extract_result in extracted_results:
                    file_type_str = file_info["type"].value if hasattr(file_info["type"], 'value') else str(file_info["type"])
                    type_counts[file_type_str] = type_counts.get(file_type_str, 0) + 1

                    if extract_result is None:
                        failed += 1
                        batch_failed += 1
                        recent_errors.append({
                            "file": Path(file_info["path"]).name,
                            "type": "EmptyContent",
                            "message": "Aucun contenu texte extrait"
                        })
                        if len(recent_errors) > 10:
                            recent_errors.pop(0)
                        processed += 1
                        continue

                    if "error" in extract_result and "text_content" not in extract_result:
                        failed += 1
                        batch_failed += 1
                        recent_errors.append({
                            "file": Path(file_info["path"]).name,
                            "type": "ExtractionError",
                            "message": str(extract_result["error"])[:200]
                        })
                        if len(recent_errors) > 10:
                            recent_errors.pop(0)
                        processed += 1
                        continue

                    # Build Document model
                    metadata = extract_result["metadata"]
                    text_content = extract_result["text_content"]
                    used_ocr = extract_result["used_ocr"]

                    # Use proof hashes if available, else fast_hash as fallback
                    ph = proof_hashes.get(file_info["path"])
                    if ph:
                        md5, sha256 = ph
                    else:
                        md5 = ""
                        sha256 = file_info.get("fast_hash", "")

                    document = Document(
                        scan_id=scan_id,
                        file_path=file_info["path"],
                        file_name=metadata["file_name"],
                        file_type=file_info["type"],
                        file_size=metadata["file_size"],
                        text_content=text_content,
                        text_length=len(text_content),
                        has_ocr=1 if used_ocr else 0,
                        file_modified_at=datetime.fromtimestamp(metadata["file_modified_at"]),
                        archive_path=file_info.get("archive_path"),
                        hash_md5=md5,
                        hash_sha256=sha256,
                    )
                    documents_to_add.append(document)
                    recent_files.append(Path(file_info["path"]).name)
                    if len(recent_files) > 5:
                        recent_files.pop(0)
                    processed += 1

                # Bulk insert all documents
                if documents_to_add:
                    db.add_all(documents_to_add)
                    db.flush()  # Get IDs assigned

                    # Set meilisearch_id and build MeiliSearch batch
                    for doc in documents_to_add:
                        doc.meilisearch_id = str(doc.id)
                        meili_docs.append({
                            "id": str(doc.id),
                            "file_path": doc.file_path,
                            "file_name": doc.file_name,
                            "file_type": doc.file_type.value,
                            "text_content": doc.text_content,
                            "scan_id": scan_id,
                            "file_modified_at": doc.file_modified_at.isoformat() if doc.file_modified_at else None,
                            "file_size": doc.file_size,
                        })

                # --- (e) Batch MeiliSearch index ---
                if meili_docs:
                    try:
                        meili_service.index_documents_batch(meili_docs)
                    except Exception as e:
                        logger.error(f"MeiliSearch batch error: {e}")

                # --- (f) Single commit for entire batch ---
                scan.processed_files = processed
                scan.failed_files = failed
                db.commit()

                # Update Celery state for SSE
                effective_progress = (processed / scan.total_files) * 100 if scan.total_files > 0 else 0
                self.update_state(state="PROGRESS", meta={
                    "phase": "processing",
                    "progress": effective_progress,
                    "current_file": recent_files[-1] if recent_files else None,
                    "processed": processed,
                    "total": scan.total_files,
                    "recent_files": list(recent_files),
                    "skipped": skipped,
                    "type_counts": dict(type_counts),
                    "skipped_details": list(skipped_details),
                    "recent_errors": list(recent_errors),
                })

            # ═══ COMPLETE ═══
            scan.status = ScanStatus.COMPLETED
            scan.completed_at = datetime.now(timezone.utc)
            db.commit()

            # ═══ POST-SCAN: Launch NER + Embeddings tasks ═══
            try:
                run_ner_batch.delay(scan_id)
                logger.info(f"Post-scan NER task launched for scan {scan_id}")
            except Exception as e:
                logger.error(f"Failed to launch NER task: {e}")

            if enable_embeddings:
                try:
                    run_embeddings_batch.delay(scan_id)
                    logger.info(f"Post-scan embeddings task launched for scan {scan_id}")
                except Exception as e:
                    logger.error(f"Failed to launch embeddings task: {e}")

            return {
                "status": "completed",
                "total_files": total_files,
                "processed": processed,
                "failed": failed,
                "skipped": skipped,
            }

        except Exception as e:
            scan.status = ScanStatus.FAILED
            scan.error_message = str(e)
            scan.completed_at = datetime.now(timezone.utc)
            db.commit()
            raise


# ═══════════════════════════════════════════════════════════════
# POST-SCAN: NER Batch Task
# ═══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="app.workers.tasks.run_ner_batch")
def run_ner_batch(self, scan_id: int):
    """
    Post-scan NER extraction — runs after main scan completes.
    Processes all documents from a scan through SpaCy in batches.
    """
    with get_db_context() as db:
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            return {"error": f"Scan {scan_id} not found"}

        # Get all documents without entities
        documents = db.query(Document).filter(
            Document.scan_id == scan_id,
            Document.text_content.isnot(None),
            Document.text_content != "",
        ).all()

        if not documents:
            return {"status": "completed", "processed": 0}

        ner_service = get_ner_service()
        processed = 0
        errors = 0

        for i in range(0, len(documents), NER_BATCH_SIZE):
            batch = documents[i:i + NER_BATCH_SIZE]

            for doc in batch:
                try:
                    # Skip videos (deferred OCR)
                    if doc.text_content.startswith("[VIDEO]"):
                        continue

                    extracted_entities = ner_service.extract_entities(
                        doc.text_content,
                        include_types=["PER", "ORG", "LOC", "MISC"]
                    )

                    for ent in extracted_entities:
                        entity = Entity(
                            document_id=doc.id,
                            text=ent["text"][:255],
                            type=ent["type"],
                            count=ent["count"],
                            start_char=ent.get("start_char")
                        )
                        db.add(entity)

                    processed += 1
                except Exception as e:
                    errors += 1
                    logger.error(f"NER error on doc {doc.id}: {e}")

            # Commit per batch
            db.commit()

            self.update_state(state="PROGRESS", meta={
                "phase": "ner",
                "processed": processed,
                "total": len(documents),
                "errors": errors,
            })

        return {
            "status": "completed",
            "processed": processed,
            "errors": errors,
        }


# ═══════════════════════════════════════════════════════════════
# POST-SCAN: Embeddings Batch Task
# ═══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="app.workers.tasks.run_embeddings_batch")
def run_embeddings_batch(self, scan_id: int):
    """
    Post-scan embeddings — runs after main scan completes.
    Processes all documents through Gemini embeddings in batches.
    """
    if not settings.gemini_api_key:
        return {"status": "skipped", "reason": "No Gemini API key"}

    with get_db_context() as db:
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            return {"error": f"Scan {scan_id} not found"}

        # Get documents without embeddings
        documents = db.query(Document).filter(
            Document.scan_id == scan_id,
            Document.text_content.isnot(None),
            Document.text_content != "",
            (Document.qdrant_ids.is_(None)) | (Document.qdrant_ids == ""),
        ).all()

        if not documents:
            return {"status": "completed", "processed": 0}

        embeddings_service = get_embeddings_service()
        qdrant_service = get_qdrant_service()
        processed = 0
        errors = 0

        for i in range(0, len(documents), EMBED_BATCH_SIZE):
            batch = documents[i:i + EMBED_BATCH_SIZE]

            for doc in batch:
                try:
                    if doc.text_content.startswith("[VIDEO]"):
                        continue

                    chunks_with_embeddings = embeddings_service.process_document(doc.text_content)

                    if chunks_with_embeddings:
                        point_ids = qdrant_service.index_chunks(
                            document_id=doc.id,
                            scan_id=scan_id,
                            file_path=doc.file_path,
                            file_name=doc.file_name,
                            file_type=doc.file_type.value,
                            chunks=chunks_with_embeddings
                        )
                        doc.qdrant_ids = json.dumps(point_ids)

                    processed += 1
                except Exception as e:
                    errors += 1
                    logger.error(f"Embedding error on doc {doc.id}: {e}")

            db.commit()

            self.update_state(state="PROGRESS", meta={
                "phase": "embeddings",
                "processed": processed,
                "total": len(documents),
                "errors": errors,
            })

        return {
            "status": "completed",
            "processed": processed,
            "errors": errors,
        }


# ═══════════════════════════════════════════════════════════════
# SINGLE DOCUMENT RE-PROCESSING
# ═══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="app.workers.tasks.process_document")
def process_document(self, document_id: int):
    """Process a single document (for re-indexing)."""
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
                if document.qdrant_ids:
                    qdrant_service.delete_by_document(document.id)

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
