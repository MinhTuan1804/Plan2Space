import pytest

from export_truth import export_truth

GEOMETRY = {
    "walls": [{"points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}], "thicknessMeters": 0.22, "level": 0},
              {"points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}], "thicknessMeters": 0.11, "level": 1}],
    "rooms": [{"points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 3}, {"x": 0, "y": 3}], "label": "STAIRS", "level": 0},
              {"points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 3}, {"x": 0, "y": 3}], "label": "HALL", "level": 1}],
    "openings": [{"type": "Door", "position": {"x": 2, "y": 0}, "widthMeters": 0.9, "level": 0}],
}


def test_one_storey_geometry_maps_to_truth():
    one = {k: [x for x in v if x["level"] == 0] for k, v in GEOMETRY.items()}
    t = export_truth(one)
    assert t["walls"] == [{"points": [[0, 0], [4, 0]], "thickness": 0.22}]
    assert t["rooms"][0]["name"] == "STAIRS" and t["rooms"][0]["points"][0] == t["rooms"][0]["points"][-1]
    assert t["openings"] == [{"type": "Door", "centre": [2, 0], "width": 0.9}]
    assert "levels" not in t


def test_merged_storeys_go_back_to_where_they_were_drawn():
    hint = {"offset": [-20, 0], "heights": [3.6, 3.6], "stairEntry": [1, 0.3], "stairExit": [[4, 0], [5, 0], [5, 1], [4, 1], [4, 0]]}
    t = export_truth(GEOMETRY, hint)
    upper_wall = t["walls"][1]
    assert upper_wall["points"] == [[20, 0], [24, 0]]          # drawn 20 m to the right, before the merge
    lv = t["levels"]
    assert lv["offset"] == [-20, 0]
    assert lv["stairWell"][0] == [0, 0]                         # in merged coordinates
    assert lv["upperFloorArea"] == pytest.approx(0)             # the hall stands wholly over the stair well
    assert lv["blocks"][1]["minX"] == 20
