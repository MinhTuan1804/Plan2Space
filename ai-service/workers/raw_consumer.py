"""Bridges the API's plain-JSON job queue onto the vectorize_job Celery task.

The .NET API (Task 6) publishes {"job_id", "project_id", "file_object_key"} as raw JSON to
"ai.vectorize.jobs". A Celery worker ignores non-Celery-protocol messages, so this consumer
step reads that queue and re-dispatches each job as a real Celery task.
"""
import json
import logging

from celery import bootsteps
from kombu import Consumer, Queue

from workers.celery_app import celery_app
from workers.tasks import vectorize_job

logger = logging.getLogger(__name__)

RAW_JOB_QUEUE = "ai.vectorize.jobs"
TASK_QUEUE = "ai.vectorize.run"
REQUIRED_FIELDS = ("job_id", "project_id", "file_object_key")

# Must match the API's declaration (durable, non-exclusive, non-auto-delete) or RabbitMQ refuses it.
raw_job_queue = Queue(RAW_JOB_QUEUE, durable=True, auto_delete=False)


def dispatch_raw_job(body) -> bool:
    """Dispatch one raw message; returns False (and dispatches nothing) for malformed input."""
    try:
        msg = body if isinstance(body, dict) else json.loads(body)
        kwargs = {field: str(msg[field]) for field in REQUIRED_FIELDS}
    except (ValueError, TypeError, KeyError):
        logger.error("Dropping malformed vectorize job message: %r", body)
        return False
    vectorize_job.apply_async(kwargs=kwargs, queue=TASK_QUEUE)
    return True


class RawJobConsumerStep(bootsteps.ConsumerStep):
    def get_consumers(self, channel):
        return [Consumer(channel, queues=[raw_job_queue], callbacks=[self.on_message], accept=["json"])]

    def on_message(self, body, message):
        try:
            dispatch_raw_job(body)
        except Exception:
            logger.exception("Could not dispatch vectorize job; requeueing")
            message.requeue()
            return
        message.ack()


celery_app.steps["consumer"].add(RawJobConsumerStep)
