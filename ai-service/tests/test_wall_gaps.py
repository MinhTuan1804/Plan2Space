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


def test_a_gap_next_to_a_square_pier_is_found_whatever_way_the_pier_points():
    # A 20 x 22 cm pier beside a 3 m garage door has no real length, so its centreline can come out
    # across the wall; the doorway must still be found or the garage never closes into a room.
    walls = [_wall((0.1, -0.11), (0.1, 0.11)), _wall((3.2, 0), (4.8, 0))]
    widths = [round(w, 1) for _, _, w in find_wall_gaps(walls)]
    assert widths == [3.1]


def test_a_gap_must_run_along_the_wall_not_merely_at_a_small_angle():
    # A 0.3 m stub in the front wall and a wall 4.2 m away are within 3 degrees of each other, so the
    # "gap" between them was bridged diagonally and split a bedroom in two.
    walls = [_wall((27.5, 0), (27.8, 0)), _wall((28.0, 3.6), (28.0, 4.2))]
    assert find_wall_gaps(walls) == []


def test_the_gap_beside_a_pier_runs_along_the_wall_it_interrupts():
    # The garage pier's centreline crosses the wall, so its end sits 11 cm off the wall's line and the
    # doorway came out skewed. The gap must lie on the wall it interrupts.
    walls = [_wall((0.1, -0.11), (0.1, 0.11)), _wall((3.2, 0), (4.8, 0))]
    [(u, v, width)] = find_wall_gaps(walls)
    assert round(u[1], 6) == 0.0 and round(v[1], 6) == 0.0
    assert round(width, 2) == 3.1
