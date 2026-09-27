from run import compare, total


def test_gate_fails_when_any_group_drops_more_than_two():
    base = {"a": {"walls": 100, "rooms": 100}}
    assert compare(base, {"a": {"walls": 100, "rooms": 90}}) == ["a: rooms 100.0 -> 90.0"]   # one room of ten lost


def test_gate_passes_within_two():
    assert compare({"a": {"rooms": 90.0}}, {"a": {"rooms": 88.1}}) == []


def test_a_new_case_or_group_is_not_a_regression():
    assert compare({"a": {"rooms": 90.0}}, {"a": {"rooms": 90.0, "stair": 0}, "b": {"rooms": 10.0}}) == []


def test_total_is_the_mean_of_the_groups_that_apply():
    one = {"walls": 100, "stubs": 80, "rooms": 60, "openings": 40, "names": 20}
    assert total(one) == 60
    assert total({**one, "stair": 100, "merge": 100, "floor": 100}) == (300 + 300) / 8
