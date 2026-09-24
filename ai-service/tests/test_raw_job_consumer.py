# ai-service/tests/test_raw_job_consumer.py
# The .NET API (Task 6) publishes plain JSON, not Celery-protocol messages, to "ai.vectorize.jobs".
# A Celery consumer step bridges that queue onto the vectorize_job task.
import json
from unittest.mock import patch

from workers.celery_app import celery_app
from workers.raw_consumer import RAW_JOB_QUEUE, TASK_QUEUE, RawJobConsumerStep, dispatch_raw_job

MSG = {"job_id": "00000000-0000-0000-0000-000000000000",
       "project_id": "11111111-1111-1111-1111-111111111111",
       "file_object_key": "projects/1111/abc.png"}


def test_step_is_registered_on_the_worker_consumer():
    assert RawJobConsumerStep in celery_app.steps["consumer"]


def test_raw_queue_is_distinct_from_the_celery_task_queue():
    # Celery must never publish its own protocol messages into the raw JSON queue.
    assert RAW_JOB_QUEUE == "ai.vectorize.jobs"
    assert celery_app.conf.task_routes["workers.tasks.vectorize_job"]["queue"] == TASK_QUEUE != RAW_JOB_QUEUE


def test_valid_message_dispatches_vectorize_job_with_its_fields():
    with patch("workers.raw_consumer.vectorize_job.apply_async") as apply_async:
        assert dispatch_raw_job(json.dumps(MSG).encode()) is True
    apply_async.assert_called_once_with(kwargs=MSG, queue=TASK_QUEUE)


def test_already_decoded_dict_body_is_accepted():
    with patch("workers.raw_consumer.vectorize_job.apply_async") as apply_async:
        assert dispatch_raw_job(dict(MSG)) is True
    apply_async.assert_called_once()


def test_malformed_message_is_dropped_without_dispatch():
    with patch("workers.raw_consumer.vectorize_job.apply_async") as apply_async:
        assert dispatch_raw_job(b"not json") is False
        assert dispatch_raw_job(json.dumps({"job_id": "x"}).encode()) is False
    apply_async.assert_not_called()
