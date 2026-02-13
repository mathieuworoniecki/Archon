"""
Archon Backend - FastAPI Main Application
"""
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult

from .config import get_settings
from .database import init_db
from .api.scan import router as scan_router
from .api.search import router as search_router
from .api.documents import router as documents_router
from .api.stats import router as stats_router
from .api.favorites import router as favorites_router
from .api.tags import router as tags_router
from .api.timeline import router as timeline_router
from .api.entities import router as entities_router
from .api.audit import router as audit_router
from .api.chat import router as chat_router
from .api.projects import router as projects_router
from .api.export import router as export_router
from .api.auth import router as auth_router
from .api.admin import router as admin_router
from .api.health import router as health_router
from .api.deep_analysis import router as deep_analysis_router
from .api.watchlist import router as watchlist_router
from .api.investigation_tasks import router as investigation_tasks_router
from .workers.celery_app import celery_app
from .telemetry.metrics import record_request, render_prometheus
from .telemetry.request_context import set_request_id, reset_request_id, get_request_id

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    init_db()
    _recover_orphaned_scans()
    yield
    # Shutdown
    pass


def _recover_orphaned_scans():
    """Mark orphaned RUNNING/PENDING scans as FAILED on startup.
    
    After a container restart, Celery tasks are gone but scan status
    stays RUNNING in the DB. This makes them resumable.
    """
    import logging
    logger = logging.getLogger(__name__)
    from .database import SessionLocal
    from .models import Scan, ScanStatus
    
    db = SessionLocal()
    try:
        orphaned = db.query(Scan).filter(
            Scan.status.in_([ScanStatus.RUNNING, ScanStatus.PENDING])
        ).all()
        
        for scan in orphaned:
            scan.status = ScanStatus.FAILED
            scan.error_message = "Interrompu par redémarrage du serveur"
            logger.warning(f"Recovered orphaned scan {scan.id} (was {scan.status.value})")
        
        if orphaned:
            db.commit()
            logger.info(f"Recovered {len(orphaned)} orphaned scan(s)")
    except Exception as e:
        logger.error(f"Failed to recover orphaned scans: {e}")
        db.rollback()
    finally:
        db.close()



# Create FastAPI app
app = FastAPI(
    title="Archon",
    description="Digital Investigation Platform - Hybrid Search Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS — origins from config, explicit methods/headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Session-Id",
        "X-Request-Id",
        "X-Requested-With",
    ],
)

# Include routers
app.include_router(scan_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(favorites_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(timeline_router, prefix="/api")
app.include_router(entities_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(deep_analysis_router, prefix="/api")
app.include_router(watchlist_router, prefix="/api")
app.include_router(investigation_tasks_router, prefix="/api")


# Metrics middleware
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    token = set_request_id(request_id)
    request.state.request_id = request_id

    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-Id"] = request_id
        return response
    except Exception:
        status_code = 500
        raise
    finally:
        duration = time.perf_counter() - started

        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", None) or request.url.path
        record_request(
            method=request.method,
            route=route_path,
            status_code=status_code,
            duration_seconds=duration,
        )
        reset_request_id(token)


def _error_code_from_status(status_code: int) -> str:
    if status_code == 400:
        return "bad_request"
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 404:
        return "not_found"
    if status_code == 409:
        return "conflict"
    if status_code == 422:
        return "validation_error"
    if status_code == 429:
        return "rate_limited"
    if status_code >= 500:
        return "internal_error"
    return "request_error"


def _error_payload(
    status_code: int,
    message: str,
    details: object | None = None,
) -> dict:
    request_id = get_request_id()
    payload = {
        "code": _error_code_from_status(status_code),
        "message": message,
        "request_id": request_id,
        # Keep backward compatibility for clients reading FastAPI `detail`.
        "detail": message,
    }
    if details is not None:
        payload["details"] = details
    return payload


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    payload = _error_payload(
        status_code=exc.status_code,
        message=str(exc.detail),
        details=exc.detail if isinstance(exc.detail, (dict, list)) else None,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload,
        headers={"X-Request-Id": get_request_id(), **(exc.headers or {})},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    payload = _error_payload(
        status_code=422,
        message="Request validation failed",
        details=exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content=payload,
        headers={"X-Request-Id": get_request_id()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API exception: %s", exc)
    payload = _error_payload(
        status_code=500,
        message="Internal server error",
    )
    return JSONResponse(
        status_code=500,
        content=payload,
        headers={"X-Request-Id": get_request_id()},
    )


@app.get("/metrics")
def metrics():
    """Prometheus-style operational metrics."""
    return PlainTextResponse(render_prometheus(), media_type="text/plain; version=0.0.4")


# WebSocket connection manager
class ConnectionManager:
    """Manage WebSocket connections for real-time updates."""
    
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}  # scan_id -> connections
    
    async def connect(self, websocket: WebSocket, scan_id: int):
        await websocket.accept()
        if scan_id not in self.active_connections:
            self.active_connections[scan_id] = set()
        self.active_connections[scan_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, scan_id: int):
        if scan_id in self.active_connections:
            self.active_connections[scan_id].discard(websocket)
            if not self.active_connections[scan_id]:
                del self.active_connections[scan_id]
    
    async def broadcast(self, scan_id: int, message: dict):
        if scan_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[scan_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            
            for conn in disconnected:
                self.disconnect(conn, scan_id)


manager = ConnectionManager()


@app.websocket("/ws/scan/{scan_id}")
async def websocket_scan_progress(websocket: WebSocket, scan_id: int):
    """
    WebSocket endpoint for real-time scan progress updates.

    Clients must provide a valid JWT token as a query parameter:
    ws://host/ws/scan/1?token=<jwt_token>
    """
    import asyncio
    from .database import SessionLocal
    from .models import Scan, ScanStatus

    # ── WebSocket Authentication ──
    if not settings.disable_auth:
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        try:
            from .utils.auth import decode_token
            payload = decode_token(token)
            if payload.get("type") != "access":
                await websocket.close(code=4001, reason="Invalid token type")
                return
        except Exception:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return

    await manager.connect(websocket, scan_id)
    
    try:
        while True:
            # Poll for updates every 500ms
            await asyncio.sleep(0.5)
            
            # Get current scan status
            db = SessionLocal()
            try:
                scan = db.query(Scan).filter(Scan.id == scan_id).first()
                if not scan:
                    await websocket.send_json({
                        "type": "error",
                        "data": {"message": "Scan not found"}
                    })
                    break
                
                # Build progress message
                progress_data = {
                    "scan_id": scan_id,
                    "status": scan.status.value,
                    "total_files": scan.total_files,
                    "processed_files": scan.processed_files,
                    "failed_files": scan.failed_files,
                    "progress_percent": (scan.processed_files / scan.total_files * 100) if scan.total_files > 0 else 0
                }
                
                # Get Celery task info if running
                if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
                    result = AsyncResult(scan.celery_task_id, app=celery_app)
                    if result.state == "PROGRESS" and result.info:
                        progress_data["current_file"] = result.info.get("current_file")
                        progress_data["phase"] = result.info.get("phase", "processing")
                
                await websocket.send_json({
                    "type": "progress",
                    "data": progress_data
                })
                
                # Check if scan is complete
                if scan.status in [ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED]:
                    # Send final errors
                    errors = [
                        {
                            "file_path": e.file_path,
                            "error_type": e.error_type,
                            "error_message": e.error_message
                        }
                        for e in scan.errors[-10:]  # Last 10 errors
                    ]
                    
                    await websocket.send_json({
                        "type": "complete",
                        "data": {
                            **progress_data,
                            "errors": errors,
                            "error_message": scan.error_message
                        }
                    })
                    break
                    
            finally:
                db.close()
                
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, scan_id)


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "name": "Archon API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    health = {
        "status": "healthy",
        "services": {}
    }
    
    # Check Meilisearch
    try:
        from .services.meilisearch import get_meilisearch_service
        meili = get_meilisearch_service()
        health["services"]["meilisearch"] = meili.health_check()
    except Exception as e:
        health["services"]["meilisearch"] = False
    
    # Check Qdrant
    try:
        from .services.qdrant import get_qdrant_service
        qdrant = get_qdrant_service()
        health["services"]["qdrant"] = qdrant.health_check()
    except Exception as e:
        health["services"]["qdrant"] = False
    
    # Check Redis (via Celery)
    try:
        celery_app.control.ping(timeout=1)
        health["services"]["redis"] = True
    except Exception:
        health["services"]["redis"] = False
    
    # Overall status
    if not all(health["services"].values()):
        health["status"] = "degraded"
    
    return health
