# ai-service/tests/test_boq_calculator.py
import pytest

from pipeline.boq_calculator import calculate_boq

PRICES = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}


def _wall(points, thickness=0.2, height=2.8, wall_id="w"):
    return {"id": wall_id, "points": points, "thicknessMeters": thickness, "heightMeters": height}


def test_calculates_brick_and_paint_quantities_for_single_wall():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    unit_prices = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}

    boq = calculate_boq(geometry, unit_prices)

    wall_area_m2 = 5 * 2.8  # length x height, one face
    assert boq["paint_area_m2"] == wall_area_m2 * 2  # both faces
    assert boq["brick_count"] > 0
    assert boq["total_cost_vnd"] > 0


def test_polyline_walls_count_their_full_length_and_accept_api_points():
    l_wall = _wall([{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 4}])
    boq = calculate_boq({"walls": [l_wall], "rooms": [], "openings": []}, PRICES)
    assert boq["paint_area_m2"] == pytest.approx(9 * 2.8 * 2)


def test_openings_are_deducted_from_wall_area():
    geometry = {
        "walls": [_wall([[0, 0], [5, 0]])],
        "rooms": [],
        "openings": [{"wallId": "w", "type": "Door", "position": {"x": 2.5, "y": 0}, "widthMeters": 0.9, "sillHeightMeters": 0}],
    }
    boq = calculate_boq(geometry, PRICES)
    assert boq["paint_area_m2"] == pytest.approx((5 * 2.8 - 0.9 * 2.1) * 2)


def test_thicker_walls_need_proportionally_more_bricks_and_mortar():
    thin = calculate_boq({"walls": [_wall([[0, 0], [5, 0]], thickness=0.1)], "rooms": [], "openings": []}, PRICES)
    thick = calculate_boq({"walls": [_wall([[0, 0], [5, 0]], thickness=0.2)], "rooms": [], "openings": []}, PRICES)
    assert thick["brick_count"] == 2 * thin["brick_count"]
    assert thick["mortar_volume_m3"] == pytest.approx(2 * thin["mortar_volume_m3"])
    assert thick["paint_area_m2"] == thin["paint_area_m2"]


def test_total_cost_is_the_sum_of_priced_quantities():
    boq = calculate_boq({"walls": [_wall([[0, 0], [5, 0]])], "rooms": [], "openings": []}, PRICES)
    expected = (boq["brick_count"] * 1200 + boq["paint_area_m2"] * 45000 + boq["mortar_volume_m3"] * 1500000)
    assert boq["total_cost_vnd"] == pytest.approx(expected, abs=1)
