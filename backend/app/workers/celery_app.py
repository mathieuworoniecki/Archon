"""
Archon Backend - Celery Application Configuration

Priority queues prevent the "noisy neighbor" problem (audit2 §2.1):
 - 'scan' queue: heavy scan operations (long-running, resource-intensive)
 - 'documents' queue: lightweight per-document processing
 - 'celery' default: everything else
"""
from celery import Celery
from kombu import Queue
from ..config import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    "archon",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"]
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour timeout per task
    worker_prefetch_multiplier=1,  # Process one task at a time
    task_acks_late=True,  # Acknowledge after task completes
    result_expires=86400,  # Results expire after 24 hours
)

# Priority queue definitions
celery_app.conf.task_queues = (
    Queue("celery"),           # default queue
    Queue("scan"),             # heavy scan operations
    Queue("documents"),        # per-document processing
)
celery_app.conf.task_default_queue = "celery"

# Route tasks to appropriate queues
celery_app.conf.task_routes = {
    "app.workers.tasks.run_scan": {"queue": "scan"},
    "app.workers.tasks.process_document": {"queue": "documents"},
}
