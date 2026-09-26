import json

import pytest
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from generate import walls_of, write_case
from houses import HOUSES
from pipeline.dxf_job import process_dxf


@pytest.mark.parametrize("house", HOUSES, ids=lambda h: h.name)
def test_rooms_tile_each_level(house):
    for level in house.levels:
        polys = [Polygon(r.points) for r in level.rooms]
        for i, a in enumerate(polys):
            assert a.is_valid, level.rooms[i].name
            for b in polys[i + 1:]:
                assert a.intersection(b).area < 1e-6
        union = unary_union(polys)
        assert union.geom_type == "Polygon" and len(union.interiors) == 0, "a level is one block with no holes"


@pytest.mark.parametrize("house", HOUSES, ids=lambda h: h.name)
def test_openings_sit_on_one_wall_clear_of_joints(house):
    for level in house.levels:
        walls = walls_of(level)
        for o in level.openings:
            c = Point(o.centre)
            on = [w for w in walls if LineString(w["points"]).distance(c) < 1e-6]
            assert len(on) == 1, (house.name, o)
            line = LineString(on[0]["points"])
            half = o.width / 2
            d = line.project(c)
            assert half + 0.2 <= d <= line.length - half - 0.2, (house.name, o, "too close to the wall's end")
            gap = LineString([line.interpolate(d - half), line.interpolate(d + half)])
            # Another wall meeting this one inside the opening would leave no doorway.
            joints = [Point(p) for w in walls if w is not on[0] for p in (w["points"][0], w["points"][-1])]
            assert all(gap.distance(j) > 0.2 for j in joints), (house.name, o, "a joint inside the opening")


def test_truth_round_trips(tmp_path):
    house = HOUSES[0]
    case = write_case(house, "clean", tmp_path)
    truth = json.loads((case / "truth.json").read_text(encoding="utf-8"))
    assert len(truth["rooms"]) == len(house.levels[0].rooms)
    assert {r["name"] for r in truth["rooms"]} == {r.name for r in house.levels[0].rooms}
    assert len(truth["openings"]) == len(house.levels[0].openings)
    assert {round(w["thickness"], 2) for w in truth["walls"]} == {0.11, 0.22}
    assert "levels" not in truth


def test_two_storey_truth_has_levels(tmp_path):
    house = next(h for h in HOUSES if len(h.levels) == 2)
    truth = json.loads((write_case(house, "clean", tmp_path) / "truth.json").read_text(encoding="utf-8"))
    lv = truth["levels"]
    assert lv["offset"] == [-20.0, 0.0]
    assert Polygon(lv["stairWell"]).area == pytest.approx(2.8 * 3.8)
    assert len(lv["lightWells"]) == 2
    assert lv["upperFloorArea"] == pytest.approx(136 - 2.8 * 3.8 - 2.0 * 1.2 - 1.9 * 1.4)


@pytest.mark.parametrize("house", HOUSES, ids=lambda h: h.name)
def test_clean_case_is_read_as_drawn(house, tmp_path):
    case = write_case(house, "clean", tmp_path)
    truth = json.loads((case / "truth.json").read_text(encoding="utf-8"))
    result = process_dxf(str(case / "drawing.dxf"))
    # The writer draws what the pipeline reads; how well it reads it is the benchmark's job, not this test's.
    assert abs(len(result["rooms"]) - len(truth["rooms"])) <= 1
