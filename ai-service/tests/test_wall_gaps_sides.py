from pipeline.wall_gaps import one_gap_per_side


def test_two_gaps_leaving_one_end_on_the_same_side_keep_the_narrower():
    # Review I6: directions 2.8° and 2.9° off the line rounded to different keys and both gaps survived.
    u = (0.0, 0.0)
    near = (u, (1.0, 0.0489), 1.0)       # sin ~ 0.049
    far = (u, (2.0, 0.1021), 2.0)        # sin ~ 0.051
    assert one_gap_per_side([far, near]) == [near]


def test_a_pier_bounds_one_gap_on_each_side():
    u = (5.0, 0.0)
    left, right = ((3.8, 0.0), u, 1.2), (u, (6.4, 0.0), 1.4)
    assert one_gap_per_side([left, right]) == [left, right]
