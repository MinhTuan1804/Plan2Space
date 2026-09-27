from run import compare, total


def test_gate_fails_on_a_drop_of_more_than_two():
    assert compare({"a": 90.0}, {"a": 87.9}) == ["a"]


def test_gate_passes_within_two():
    assert compare({"a": 90.0}, {"a": 88.1}) == []


def test_a_new_case_is_not_a_regression():
    assert compare({"a": 90.0}, {"a": 90.0, "b": 10.0}) == []


def test_total_is_the_mean_of_the_groups_that_apply():
    one = {"walls": 100, "stubs": 80, "rooms": 60, "openings": 40, "names": 20}
    assert total(one) == 60
    assert total({**one, "stair": 100, "merge": 100, "floor": 100}) == (300 + 300) / 8
