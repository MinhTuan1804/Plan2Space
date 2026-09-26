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
from pipeline.rooms import label_rooms, rooms_from_walls
from pipeline.scale import estimate_metres_per_pixel, to_project_space
from pipeline.raster_input import load_page_image
from pipeline.api_client import (download_from_minio, push_geometry_to_api, report_error, report_final_state,
                                 report_progress)
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger(__name__)

DXF_EXTENSIONS = (".dxf",)
# Only a PNG/JPEG upload is itself the image the editor can draw under the plan (a PDF is rendered).
UNDERLAY_EXTENSIONS = (".png", ".jpg", ".jpeg")
SNAP_TOLERANCE_M = 0.05          # raster input: vectorization noise
DXF_SNAP_TOLERANCE_M = 0.005     # CAD input is exact: stay within the ±5 mm spatial tolerance
# Used when no dimension label can calibrate a raster plan (~1:100 drawing scanned at ~130 dpi).
DEFAULT_METRES_PER_PIXEL = float(os.environ.get("P2S_DEFAULT_METRES_PER_PIXEL", "0.02"))
# A job must never run forever (p95 target is 30 s): soft limit -> readable failure, hard limit -> killed.
SOFT_TIME_LIMIT_S = int(os.environ.get("P2S_JOB_SOFT_TIME_LIMIT_S", "180"))
HARD_TIME_LIMIT_S = SOFT_TIME_LIMIT_S + 30


def _raster_to_project_space(local_path: str) -> tuple[list[dict], list[dict], dict | None]:
    image_path = load_page_image(local_path, out_dir=os.path.dirname(local_path) or ".")
    parsed = vectorize_raster(image_path)
    symbols = detect_symbols(image_path)
    metres_per_pixel = estimate_metres_per_pixel(parsed["walls"], extract_dimensions(image_path))
    if metres_per_pixel is None:
        logger.warning("No dimension label calibrated the scale; assuming %s m/px", DEFAULT_METRES_PER_PIXEL)
        metres_per_pixel = DEFAULT_METRES_PER_PIXEL
    with Image.open(image_path) as img:
        width, height = img.width, img.height
    walls, symbols = to_project_space(parsed["walls"], symbols, metres_per_pixel, height)
    underlay = ({"metresPerPixel": metres_per_pixel, "widthPx": width, "heightPx": height}
                if local_path.lower().endswith(UNDERLAY_EXTENSIONS) else None)
    return walls, symbols, underlay


# acks_late + reject_on_worker_lost: a worker killed mid-job (e.g. OOM) puts the job back on the queue.
@celery_app.task(name="workers.tasks.vectorize_job", soft_time_limit=SOFT_TIME_LIMIT_S, time_limit=HARD_TIME_LIMIT_S,
                 acks_late=True, reject_on_worker_lost=True)
def vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict:
    progress = 0
    try:
        progress = 10
        report_progress(job_id, "Running", progress)
        local_path = download_from_minio(file_object_key)

        progress = 30
        report_progress(job_id, "Running", progress)
        is_dxf = local_path.lower().endswith(DXF_EXTENSIONS)
        underlay = None
        if is_dxf:
            parsed = parse_dxf(local_path)
            # A DXF states its openings as gaps in the wall; no symbol detector is involved.
            walls, symbols, room_names = parsed["walls"], parsed["openings"], parsed["room_names"]
        else:
            walls, symbols, underlay = _raster_to_project_space(local_path)
            room_names = []

        progress = 60
        report_progress(job_id, "Running", progress)
        healed_walls = heal_wall_topology(walls, snap_tolerance_m=DXF_SNAP_TOLERANCE_M if is_dxf else SNAP_TOLERANCE_M)

        progress = 80
        report_progress(job_id, "Running", progress)
        result = serialize_pipeline_result(healed_walls, symbols, label_rooms(rooms_from_walls(healed_walls), room_names))

        push_geometry_to_api(project_id, result)
        report_progress(job_id, "Completed", 100)
        if underlay:
            report_final_state(job_id, "Completed", 100, result={"underlay": underlay})
        else:
            report_final_state(job_id, "Completed", 100)
        return result
    except SoftTimeLimitExceeded:
        return _fail(job_id, progress, f"The plan took too long to process (over {SOFT_TIME_LIMIT_S} s). "
                                       "Try a cleaner or smaller image, or upload the DXF.")
    except Exception as exc:
        logger.exception("vectorize_job %s failed", job_id)
        return _fail(job_id, progress, str(exc))


def _fail(job_id: str, progress: int, message: str) -> dict:
    # Never leave the client waiting on a job that silently died.
    report_error(job_id, message)
    report_progress(job_id, "Failed", progress)
    report_final_state(job_id, "Failed", progress, message)
    return {"error": message}
