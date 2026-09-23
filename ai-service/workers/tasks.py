import logging
import os

from PIL import Image

from workers.celery_app import celery_app
from pipeline.ocr_dimensions import extract_dimensions   # first: loads zlib users before paddle
from pipeline.dxf_parser import parse_dxf
from pipeline.vectorize import vectorize_raster
from pipeline.gnn_healing import heal_wall_topology
from pipeline.symbol_detect import detect_symbols
from pipeline.serializer import serialize_pipeline_result
from pipeline.scale import estimate_metres_per_pixel, to_project_space
from pipeline.raster_input import load_page_image
from pipeline.api_client import download_from_minio, report_error, report_progress, push_geometry_to_api

logger = logging.getLogger(__name__)

DXF_EXTENSIONS = (".dxf",)
SNAP_TOLERANCE_M = 0.05
# Used when no dimension label can calibrate a raster plan (~1:100 drawing scanned at ~130 dpi).
DEFAULT_METRES_PER_PIXEL = float(os.environ.get("P2S_DEFAULT_METRES_PER_PIXEL", "0.02"))


def _raster_to_project_space(local_path: str) -> tuple[list[dict], list[dict]]:
    image_path = load_page_image(local_path, out_dir=os.path.dirname(local_path) or ".")
    parsed = vectorize_raster(image_path)
    symbols = detect_symbols(image_path)
    metres_per_pixel = estimate_metres_per_pixel(parsed["walls"], extract_dimensions(image_path))
    if metres_per_pixel is None:
        logger.warning("No dimension label calibrated the scale; assuming %s m/px", DEFAULT_METRES_PER_PIXEL)
        metres_per_pixel = DEFAULT_METRES_PER_PIXEL
    with Image.open(image_path) as img:
        height = img.height
    return to_project_space(parsed["walls"], symbols, metres_per_pixel, height)


@celery_app.task(name="workers.tasks.vectorize_job")
def vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict:
    progress = 0
    try:
        progress = 10
        report_progress(job_id, "Running", progress)
        local_path = download_from_minio(file_object_key)

        progress = 30
        report_progress(job_id, "Running", progress)
        if local_path.lower().endswith(DXF_EXTENSIONS):
            walls, symbols = parse_dxf(local_path)["walls"], []
        else:
            walls, symbols = _raster_to_project_space(local_path)

        progress = 60
        report_progress(job_id, "Running", progress)
        healed_walls = heal_wall_topology(walls, snap_tolerance_m=SNAP_TOLERANCE_M)

        progress = 80
        report_progress(job_id, "Running", progress)
        result = serialize_pipeline_result(healed_walls, symbols)

        push_geometry_to_api(project_id, result)
        report_progress(job_id, "Completed", 100)
        return result
    except Exception as exc:
        # Never leave the client waiting on a job that silently died.
        logger.exception("vectorize_job %s failed", job_id)
        report_error(job_id, str(exc))
        report_progress(job_id, "Failed", progress)
        return {"error": str(exc)}
