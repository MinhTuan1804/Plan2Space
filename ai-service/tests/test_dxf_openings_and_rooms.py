# ai-service/tests/test_dxf_openings_and_rooms.py
# Real architectural DXFs break the wall where a door or window sits. Those gaps are the openings,
# and until they are bridged no wall loop closes, so no room is ever found.
from unittest.mock import patch

import pytest

from workers.celery_app import celery_app
from workers.tasks import vectorize_job

from pipeline.dxf_parser import parse_dxf
from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import rooms_from_walls
from pipeline.serializer import serialize_pipeline_result

FIXTURE = "tests/fixtures/plan_with_wall_openings.dxf"


def test_wall_gaps_become_door_and_window_openings():
    symbols = parse_dxf(FIXTURE)["openings"]

    assert sorted(s["type"] for s in symbols) == ["door", "door", "window"]
    bottom_door = min((s for s in symbols if s["type"] == "door"), key=lambda s: s["bbox_center"][1])
    assert bottom_door["bbox_center"] == pytest.approx([4.0, 0.0], abs=0.05)
    assert bottom_door["width_m"] == pytest.approx(1.0, abs=0.05)


def _area(points) -> float:
    return abs(sum(points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1]
                   for i in range(len(points) - 1))) / 2


def test_rooms_close_across_the_door_and_window_gaps():
    # Without bridging, every wall loop is broken by a doorway and no room is ever found.
    walls = heal_wall_topology(parse_dxf(FIXTURE)["walls"], snap_tolerance_m=0.005)

    rooms = rooms_from_walls(walls)

    assert len(rooms) == 2
    assert sorted(_area(r["points"]) for r in rooms) == pytest.approx([24.0, 24.0], abs=0.5)


def test_serializer_keeps_the_width_measured_from_the_wall_gap():
    # A DXF gap states the real width; only a detected raster symbol needs the default.
    walls = [{"points": [[0, 0], [5, 0]], "thickness_m": 0.2, "height_m": 2.8}]
    symbols = [{"type": "door", "bbox_center": [2.0, 0.0], "width_m": 1.4},
               {"type": "window", "bbox_center": [4.0, 0.0]}]

    openings = serialize_pipeline_result(walls, symbols)["openings"]

    assert [o["widthMeters"] for o in openings] == [1.4, 0.9]


def test_dxf_job_pushes_the_drawings_openings_and_rooms():
    # The DXF branch used to hand the serializer an empty symbol list, so a plan's doors never arrived.
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value=FIXTURE), \
         patch("workers.tasks.report_progress"), patch("workers.tasks.report_final_state"), \
         patch("workers.tasks.push_geometry_to_api") as push:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.dxf").get()

    geometry = push.call_args[0][1]
    assert len(geometry["rooms"]) == 2
    assert sorted(round(o["widthMeters"], 2) for o in geometry["openings"]) == [0.9, 1.0, 1.2]


def test_each_imported_opening_sits_inside_a_wall_that_spans_it():
    # A gap has no wall, so the opening used to snap to the end of the wall beside it: the 3D window
    # then hung half in that wall and half in empty air, with no wall above or below it.
    import math
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", return_value=FIXTURE), \
         patch("workers.tasks.report_progress"), patch("workers.tasks.report_final_state"), \
         patch("workers.tasks.push_geometry_to_api") as push:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.dxf").get()
    geometry = push.call_args.args[1]
    walls = {w["id"]: w for w in geometry["walls"]}
    assert geometry["openings"]
    for o in geometry["openings"]:
        p = (o["position"]["x"], o["position"]["y"])
        a, b = [(q["x"], q["y"]) for q in walls[o["wallId"]]["points"][:2]]
        half = o["widthMeters"] / 2
        assert math.dist(p, a) >= half - 0.01 and math.dist(p, b) >= half - 0.01
