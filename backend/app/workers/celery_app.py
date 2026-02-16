"""
Archon Backend - Celery Application Configuration

Priority queues prevent the "noisy neighbor" problem:
 - 'scan' queue: heavy scan operations (long-running, resource-intensive)
 - 'documents' queue: per-document + post-scan batch processing
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
    task_time_limit=86400,      # 24h max (scan on 1.37M files)
    task_soft_time_limit=82800, # 23h soft limit
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    result_expires=86400,
    broker_transport_options={
        # Prevent Redis redelivery of long-running scan tasks.
        # Must be > longest expected scan duration.
        "visibility_timeout": settings.celery_visibility_timeout_seconds,
    },
    result_backend_transport_options={
        "visibility_timeout": settings.celery_visibility_timeout_seconds,
    },
)

# Priority queue definitions
celery_app.conf.task_queues = (
    Queue("celery"),
    Queue("scan"),
    Queue("documents"),
)
celery_app.conf.task_default_queue = "celery"

# Route tasks to appropriate queues
celery_app.conf.task_routes = {
    "app.workers.tasks.run_scan": {"queue": "scan"},
    "app.workers.tasks.process_document": {"queue": "documents"},
    "app.workers.tasks.run_ner_batch": {"queue": "documents"},
    "app.workers.tasks.run_embeddings_batch": {"queue": "documents"},
    "app.workers.tasks.enrich_document_dates": {"queue": "documents"},
}
