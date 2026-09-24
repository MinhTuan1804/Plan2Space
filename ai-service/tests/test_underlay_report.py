# ai-service/tests/test_underlay_report.py
# The editor draws the uploaded image under the plan, so it needs the mapping the worker used.
from unittest.mock import patch

import numpy as np
from PIL import Image

from workers.celery_app import celery_app
from workers.tasks import vectorize_job


def test_an_image_job_reports_how_its_pixels_map_to_metres(tmp_path):
    img = np.full((200, 300), 255, dtype=np.uint8)
    img[40:42, 40:260] = 0
    path = tmp_path / "plan.png"
    Image.fromarray(img).save(path)
    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value=str(path)), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.extract_dimensions", return_value=[]), \
         patch("workers.tasks.push_geometry_to_api"), \
         patch("workers.tasks.report_final_state") as final:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.png").get()

    assert final.call_args.kwargs["result"] == {
        "underlay": {"metresPerPixel": 0.02, "widthPx": 300, "heightPx": 200}}


def test_a_dxf_job_reports_no_underlay():
    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/sample_house_plan.dxf"), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.push_geometry_to_api"), \
         patch("workers.tasks.report_final_state") as final:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.dxf").get()

    final.assert_called_once_with("j", "Completed", 100)


def test_the_result_travels_as_a_json_string(monkeypatch):
    from pipeline import api_client
    seen = {}

    class FakeClient:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def put(self, url, headers, json):
            seen["body"] = json
            class R:
                def raise_for_status(self): pass
            return R()

    monkeypatch.setattr(api_client, "_http", lambda: FakeClient())

    api_client.report_final_state("j", "Completed", 100, result={"underlay": {"metresPerPixel": 0.02}})

    assert seen["body"]["result"] == '{"underlay": {"metresPerPixel": 0.02}}'
