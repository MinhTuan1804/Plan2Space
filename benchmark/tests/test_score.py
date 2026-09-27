import copy

import pytest

from generate import truth_of
from houses import HOUSES
from score import score_names, score_openings, score_rooms, score_walls, stray_stubs, stub_score

TRUTH = truth_of(HOUSES[0])       # tube house: 6 rooms, 10 openings


def found_from(truth, dx=0.0, dy=0.0):
    """The pipeline's output shape, built from the answer and moved by (dx, dy)."""
    xy = lambda p: {"x": p[0] + dx, "y": p[1] + dy}
    return {
        "walls": [{"points": [xy(p) for p in w["points"]], "thicknessMeters": w["thickness"]} for w in truth["walls"]],
        "rooms": [{"points": [xy(p) for p in r["points"]], "label": r["name"]} for r in truth["rooms"]],
        "openings": [{"type": o["type"].lower(), "position": xy(o["centre"]), "widthMeters": o["width"]}
                     for o in truth["openings"]],
    }


def test_the_answer_scores_full_marks():
    f = found_from(TRUTH)
    assert score_walls(f, TRUTH) == pytest.approx(100)
    assert stray_stubs(f, TRUTH) == 0
    assert score_rooms(f, TRUTH)["score"] == pytest.approx(100)
    assert score_openings(f, TRUTH) == pytest.approx(100)     # 'door' matches 'Door'
    assert score_names(f, TRUTH) == pytest.approx(100)


def test_walls_within_and_past_tolerance():
    assert score_walls(found_from(TRUTH, dx=0.09), TRUTH) == pytest.approx(100, abs=3)   # ends overrun a little
    assert score_walls(found_from(TRUTH, dx=0.11, dy=0.11), TRUTH) < 60


def test_a_missing_wall_costs_half_its_length_share():
    f = found_from(TRUTH)
    lengths = [abs(w["points"][1][0] - w["points"][0][0]) + abs(w["points"][1][1] - w["points"][0][1]) for w in TRUTH["walls"]]
    i = lengths.index(max(lengths))
    del f["walls"][i]
    assert score_walls(f, TRUTH) == pytest.approx(100 * (1 - lengths[i] / sum(lengths) / 2), abs=0.5)


def test_wrong_thickness_is_not_a_match():
    f = found_from(TRUTH)
    for w in f["walls"]:
        w["thicknessMeters"] += 0.2
    assert score_walls(f, TRUTH) == pytest.approx(0)


def test_a_loose_wall_end_is_a_stub_an_opening_jamb_is_not():
    f = found_from(TRUTH)
    f["walls"].append({"points": [{"x": 2.5, "y": 3.0}, {"x": 2.5, "y": 6.5}], "thicknessMeters": 0.11})  # into the living room
    assert stray_stubs(f, TRUTH) == 1
    assert stub_score(1) == 90 and stub_score(12) == 0


def test_a_room_cut_in_two_is_a_split():
    f = found_from(TRUTH)
    living = f["rooms"][0]                                   # 0..5 x 0..6.5
    f["rooms"][0] = {"label": "A", "points": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 3}, {"x": 0, "y": 3}, {"x": 0, "y": 0}]}
    f["rooms"].append({"label": "B", "points": [{"x": 0, "y": 3}, {"x": 5, "y": 3}, {"x": 5, "y": 6.5}, {"x": 0, "y": 6.5}, {"x": 0, "y": 3}]})
    r = score_rooms(f, TRUTH)
    assert r["splits"] == 1 and r["merges"] == 0
    assert r["score"] == pytest.approx(100 * 5 / 6)
    assert living


def test_two_rooms_as_one_is_a_merge():
    f = found_from(TRUTH)
    wc, stair = f["rooms"][1], f["rooms"][2]                 # 0..2.4 x 6.5..8.5 and 8.5..11.5
    f["rooms"] = [r for r in f["rooms"] if r not in (wc, stair)]
    f["rooms"].append({"label": "WC 1", "points": [{"x": 0, "y": 6.5}, {"x": 2.4, "y": 6.5}, {"x": 2.4, "y": 11.5}, {"x": 0, "y": 11.5}, {"x": 0, "y": 6.5}]})
    assert score_rooms(f, TRUTH)["merges"] == 1


def test_openings_within_and_past_tolerance():
    near = found_from(TRUTH, dx=0.29 / 2 ** 0.5, dy=0.29 / 2 ** 0.5)
    assert score_openings(near, TRUTH) == pytest.approx(100)
    far = found_from(TRUTH, dx=0.31)
    assert score_openings(far, TRUTH) == pytest.approx(0)
    wrong_type = found_from(TRUTH)
    wrong_type["openings"][0]["type"] = "window" if wrong_type["openings"][0]["type"] == "door" else "door"
    assert score_openings(wrong_type, TRUTH) < 100
    wide = found_from(TRUTH)
    wide["openings"][0]["widthMeters"] += 0.16
    assert score_openings(wide, TRUTH) < 100


def test_names_ignore_accents_and_case():
    truth = copy.deepcopy(TRUTH)
    truth["rooms"][0]["name"] = "Phòng Khách"
    f = found_from(TRUTH)
    f["rooms"][0]["label"] = "phong khach"
    assert score_names(f, truth) == pytest.approx(100)
    f["rooms"][1]["label"] = "Room 2"
    assert score_names(f, truth) == pytest.approx(100 * 5 / 6)
