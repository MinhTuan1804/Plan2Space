import json
import logging
import os
import tempfile

import httpx
import redis

logger = logging.getLogger(__name__)

API_INTERNAL_URL = os.environ.get("API_INTERNAL_URL", "http://api:5000")
# Shared secret for the API's /internal/* endpoints (the worker acts for the project owner, it has no user JWT).
INTERNAL_TOKEN = os.environ.get("P2S_INTERNAL_TOKEN", "")
UPLOADS_BUCKET = "plan2space-uploads"   # must match the API's MinioFileStorage.Bucket

_redis_client = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))


class GeometryRejectedError(RuntimeError):
    """The geometry API refused the pipeline result (validation, overlap, conflict)."""


def report_progress(job_id: str, status: str, percent: int) -> None:
    _redis_client.set(f"job:{job_id}:progress", f"{status}|{percent}")
    _redis_client.publish(f"job:{job_id}:updates", f"{status}|{percent}")


def report_error(job_id: str, message: str) -> None:
    _redis_client.set(f"job:{job_id}:error", message[:1000])


def report_final_state(job_id: str, status: str, percent: int, error: str | None = None,
                       result: dict | None = None) -> None:
    """Persists the job's final state in the API database (AiJobs row), so it survives a Redis restart.
    Best effort: a reporting failure is logged and never fails the job itself."""
    body = {"status": status, "progressPercent": percent, "error": error}
    if result is not None:
        body["result"] = json.dumps(result)
    try:
        with _http() as client:
            client.put(f"/internal/ai/jobs/{job_id}/state", headers={"X-Internal-Token": INTERNAL_TOKEN},
                       json=body).raise_for_status()
    except httpx.HTTPError:
        logger.exception("Could not persist final state of job %s", job_id)


def download_from_minio(file_object_key: str) -> str:
    from minio import Minio
    client = Minio(os.environ.get("MINIO_ENDPOINT", "minio:9000"),
                   access_key=os.environ["MINIO_ROOT_USER"], secret_key=os.environ["MINIO_ROOT_PASSWORD"], secure=False)
    local_path = os.path.join(tempfile.mkdtemp(prefix="p2s-job-"), os.path.basename(file_object_key))
    client.fget_object(UPLOADS_BUCKET, file_object_key, local_path)
    return local_path


def _http() -> httpx.Client:
    return httpx.Client(base_url=API_INTERNAL_URL, timeout=30.0)


def push_geometry_to_api(project_id: str, geometry: dict, conflict_retries: int = 1) -> dict:
    """Saves the result on top of the project's current geometry version (retrying once on a race)."""
    headers = {"X-Internal-Token": INTERNAL_TOKEN}
    with _http() as client:
        for attempt in range(conflict_retries + 1):
            current = client.get(f"/internal/projects/{project_id}/geometry/version", headers=headers)
            current.raise_for_status()
            response = client.put(f"/internal/projects/{project_id}/geometry", headers=headers,
                                  json={"baseVersion": current.json()["version"], **geometry})
            if response.status_code == 409 and attempt < conflict_retries:
                continue
            if response.is_error:
                try:
                    detail = response.json().get("message", response.text)
                except ValueError:
                    detail = response.text
                raise GeometryRejectedError(f"Geometry API rejected the result ({response.status_code}): {detail}")
            return response.json()
    raise GeometryRejectedError("unreachable")
