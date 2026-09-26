# ai-service/tests/test_rooms.py
# Final review I5: the pipeline never produced rooms (so the PDF room schedule, staging and room co-pilot
# commands had nothing to work on). Rooms are the closed faces of the healed wall graph.
import uuid

import pytest
from shapely.geometry import Polygon

from pipeline.rooms import rooms_from_walls
from pipeline.serializer import serialize_pipeline_result


def _wall(*points):
    return {"points": [list(p) for p in points], "thickness_m": 0.2, "height_m": 2.8}


def test_rectangle_split_by_a_partition_gives_two_rooms():
    walls = [_wall((0, 0), (6, 0), (6, 4), (0, 4), (0, 0)), _wall((2.5, 0), (2.5, 4))]
    rooms = rooms_from_walls(walls)
    assert sorted(round(Polygon(r["points"]).area, 6) for r in rooms) == [10.0, 14.0]
    assert all(r["points"][0] == r["points"][-1] for r in rooms)            # closed outlines
    assert [r["label"] for r in rooms] == ["Room 1", "Room 2"]


def test_t_junction_walls_that_only_touch_still_enclose_rooms():
    # The partition's ends lie ON the outer walls (not on their vertices): the graph must be noded.
    walls = [_wall((0, 0), (6, 0)), _wall((6, 0), (6, 4)), _wall((6, 4), (0, 4)), _wall((0, 4), (0, 0)),
             _wall((3, 0), (3, 4))]
    assert len(rooms_from_walls(walls)) == 2


def test_slivers_between_parallel_wall_faces_are_not_rooms():
    walls = [_wall((0, 0), (5, 0), (5, 0.2), (0, 0.2), (0, 0))]   # a 0.2 m wide "room" is a wall, not a room
    assert rooms_from_walls(walls) == []


def test_open_walls_enclose_nothing():
    assert rooms_from_walls([_wall((0, 0), (5, 0)), _wall((5, 0), (5, 4))]) == []


def test_serializer_emits_rooms_in_the_api_shape():
    walls = [_wall((0, 0), (4, 0), (4, 4), (0, 4), (0, 0))]
    rooms = rooms_from_walls(walls)
    out = serialize_pipeline_result(walls, [], rooms)
    room = out["rooms"][0]
    uuid.UUID(room["id"])
    assert room["label"] == "Room 1"
    assert room["points"][0] == room["points"][-1]
    assert set(room["points"][0]) == {"x", "y"}
    assert Polygon([(p["x"], p["y"]) for p in room["points"]]).area == pytest.approx(16.0)


def test_a_wall_ending_a_few_centimetres_short_of_another_still_closes_the_room():
    # Walls drawn as outlines meet at their faces, so the centrelines stop short (a garage wall beside a pier).
    walls = [{"points": [[0, 0], [4, 0]]}, {"points": [[4, 0], [4, 4]]},
             {"points": [[4, 4], [0, 4]]}, {"points": [[0.1, 3.9], [0.1, 0.12]]}]
    assert len(rooms_from_walls(walls)) == 1
