"""
War Room Backend - Celery Application Configuration
"""
from celery import Celery
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

# Configure task routes
celery_app.conf.task_routes = {
    "app.workers.tasks.run_scan": {"queue": "scan"},
    "app.workers.tasks.process_document": {"queue": "documents"},
}
