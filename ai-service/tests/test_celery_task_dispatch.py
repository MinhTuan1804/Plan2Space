# ai-service/tests/test_celery_task_dispatch.py
from unittest.mock import patch

from workers.celery_app import celery_app
from workers.tasks import vectorize_job

def test_vectorize_job_is_registered():
    assert "workers.tasks.vectorize_job" in celery_app.tasks

def test_vectorize_job_returns_result_dict_shape():
    # Run eagerly (no broker needed) to check the return contract Task 9 depends on.
    # Task 12 made the task do real I/O (MinIO, Redis, API), so those seams are patched here.
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/simple_walls.dxf"), \
         patch("workers.tasks.report_progress"), patch("workers.tasks.report_error"), \
         patch("workers.tasks.push_geometry_to_api"):
        result = vectorize_job.delay(job_id="00000000-0000-0000-0000-000000000000",
                                      project_id="11111111-1111-1111-1111-111111111111",
                                      file_object_key="fixtures/blank.png").get()
    assert set(result.keys()) >= {"walls", "rooms", "openings"}
