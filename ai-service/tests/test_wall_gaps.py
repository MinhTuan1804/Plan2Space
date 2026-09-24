# ai-service/tests/test_wall_gaps.py
from pipeline.wall_gaps import find_wall_gaps


def _wall(a, b):
    return {"points": [list(a), list(b)], "thickness_m": 0.2, "height_m": 2.8}


def test_a_gap_covered_by_another_wall_is_not_an_opening():
    # Real drawings overlap wall segments; the space between two ends is only a doorway if it is empty.
    walls = [_wall((0, 0), (0, 8)), _wall((0, 3), (0, 4))]

    assert find_wall_gaps(walls) == []


def test_a_gap_no_wider_than_a_wall_is_not_an_opening():
    # 11 cm between two collinear ends is the wall's own thickness at a junction, not a door.
    walls = [_wall((0, 0), (3, 0)), _wall((3.11, 0), (6, 0))]

    assert find_wall_gaps(walls) == []
