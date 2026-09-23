import os
from celery import Celery

celery_app = Celery(
    "plan2space_ai",
    broker=os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672//"),
    backend=os.environ.get("REDIS_URL", "redis://redis:6379/0"),
    include=["workers.tasks"],
)
# Celery-protocol messages go to their own queue; "ai.vectorize.jobs" carries the API's plain JSON
# and is bridged onto this task by workers.raw_consumer.
celery_app.conf.task_routes = {"workers.tasks.vectorize_job": {"queue": "ai.vectorize.run"}}
celery_app.conf.task_default_queue = "ai.vectorize.run"

from workers import raw_consumer  # noqa: E402,F401  registers the raw-queue consumer step
