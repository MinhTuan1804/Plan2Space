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


def test_a_wall_end_bounds_one_gap_only_the_narrowest():
    # A short collinear stub beyond the doorway made a second, wider gap from the same wall end:
    # a phantom 1.45 m door overlapping the real 1.2 m one.
    walls = [{"points": [[0, 0], [4.0, 0]]}, {"points": [[5.2, 0], [6.2, 0]]},
             {"points": [[5.445, 0], [5.555, 0]]}]
    gaps = find_wall_gaps(walls)
    assert [round(w, 3) for _, _, w in gaps] == [1.2]
