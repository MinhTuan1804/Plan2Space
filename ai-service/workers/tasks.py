from workers.celery_app import celery_app

@celery_app.task(name="workers.tasks.vectorize_job")
def vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict:
    # Real pipeline dispatch (raster vs DXF) is added in Tasks 8-12.
    # Stub keeps the contract stable so the queue integration works end-to-end now.
    return {"walls": [], "rooms": [], "openings": []}
