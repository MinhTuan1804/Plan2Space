# ai-service/tests/test_rooms_never_overlap.py
# The geometry API rejects the whole result when two rooms overlap, so the walls are lost with them.
from shapely.geometry import Polygon

from pipeline.rooms import rooms_from_walls


def _wall(a, b):
    return {"points": [list(a), list(b)], "thickness_m": 0.2, "height_m": 2.8}


def _polygons(rooms):
    return [Polygon([(p[0], p[1]) for p in r["points"]]) for r in rooms]


def _overlapping_pairs(rooms):
    polygons = _polygons(rooms)
    return [(i, j) for i in range(len(polygons)) for j in range(i + 1, len(polygons))
            if polygons[i].intersection(polygons[j]).area > 1e-6]


def test_a_room_enclosing_another_room_does_not_swallow_it():
    # A free-standing inner room leaves the surrounding face a hole, which a single outline cannot
    # express — filling it would cover the inner room and the API would reject the whole plan.
    walls = [_wall((0, 0), (10, 0)), _wall((10, 0), (10, 10)), _wall((10, 10), (0, 10)), _wall((0, 10), (0, 0)),
             _wall((4, 4), (6, 4)), _wall((6, 4), (6, 6)), _wall((6, 6), (4, 6)), _wall((4, 6), (4, 4))]

    rooms = rooms_from_walls(walls)

    assert _overlapping_pairs(rooms) == []
    assert [round(p.area, 2) for p in _polygons(rooms)] == [4.0]
