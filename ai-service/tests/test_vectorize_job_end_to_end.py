# ai-service/tests/test_vectorize_job_end_to_end.py
from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image

from workers.celery_app import celery_app
from workers.tasks import vectorize_job

def test_vectorize_job_reports_progress_and_calls_api(tmp_path):
    img_path = tmp_path / "floorplan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value=str(img_path)), \
         patch("workers.tasks.report_progress") as mock_progress, \
         patch("workers.tasks.push_geometry_to_api") as mock_push:
        vectorize_job.delay(job_id="job-1", project_id="proj-1", file_object_key="uploads/floorplan.png").get()

    assert mock_progress.call_args_list[0][0][1:] == ("Running", 10)
    assert mock_progress.call_args_list[-1][0][1:] == ("Completed", 100)
    mock_push.assert_called_once()

def test_dxf_job_pushes_metre_walls_in_api_shape():
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/sample_house_plan.dxf"), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.report_final_state") as mock_final, \
         patch("workers.tasks.push_geometry_to_api") as mock_push:
        vectorize_job.delay(job_id="job-2", project_id="proj-2", file_object_key="projects/p/f.dxf").get()

    mock_final.assert_called_once_with("job-2", "Completed", 100)
    project_id, geometry = mock_push.call_args[0]
    assert project_id == "proj-2"
    assert len(geometry["walls"]) == 6
    assert all(set(p) == {"x", "y"} for w in geometry["walls"] for p in w["points"])

def test_raster_walls_are_scaled_from_pixels_to_metres(tmp_path):
    img = np.full((200, 200), 255, dtype=np.uint8)
    img[40:42, 40:160] = 0
    img[158:160, 40:160] = 0
    img[40:160, 40:42] = 0
    img[40:160, 158:160] = 0
    img_path = tmp_path / "room.png"
    Image.fromarray(img).save(img_path)

    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value=str(img_path)), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.extract_dimensions", return_value=[{"text": "2360", "bbox_center": [100.0, 25.0]}]), \
         patch("workers.tasks.push_geometry_to_api") as mock_push:
        vectorize_job.delay(job_id="job-3", project_id="p", file_object_key="k.png").get()

    walls = mock_push.call_args[0][1]["walls"]
    xs = [p["x"] for w in walls for p in w["points"]]
    assert max(xs) - min(xs) == pytest.approx(2.36, abs=0.1)   # 118px side labelled 2360mm

def test_pipeline_error_marks_job_failed_and_pushes_nothing():
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/no_wall_layers.dxf"), \
         patch("workers.tasks.report_progress") as mock_progress, \
         patch("workers.tasks.report_error") as mock_error, \
         patch("workers.tasks.report_final_state") as mock_final, \
         patch("workers.tasks.push_geometry_to_api") as mock_push:
        result = vectorize_job.delay(job_id="job-4", project_id="p", file_object_key="k.dxf").get()

    assert mock_final.call_args[0][:2] == ("job-4", "Failed") and "SKETCH" in mock_final.call_args[0][3]
    assert mock_progress.call_args_list[-1][0][1] == "Failed"
    assert "SKETCH" in result["error"]
    assert mock_error.call_args[0][0] == "job-4" and "SKETCH" in mock_error.call_args[0][1]
    mock_push.assert_not_called()

def test_dxf_walls_are_healed_within_the_drawing_tolerance():
    # Global constraint: ±5 mm — exact CAD input must not be snapped by centimetres.
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/sample_house_plan.dxf"), \
         patch("workers.tasks.report_progress"), patch("workers.tasks.report_final_state"), \
         patch("workers.tasks.heal_wall_topology", side_effect=lambda walls, snap_tolerance_m: walls) as heal, \
         patch("workers.tasks.push_geometry_to_api"):
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.dxf").get()
    assert heal.call_args.kwargs["snap_tolerance_m"] <= 0.005
