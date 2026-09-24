# ai-service/tests/test_scale.py
import pytest

from pipeline.scale import estimate_metres_per_pixel, parse_dimension_metres, to_project_space

@pytest.mark.parametrize("text,expected", [
    ("3000", 3.0), ("3,000", 3.0), ("4500mm", 4.5), ("3.6m", 3.6), ("3.6 m", 3.6), ("KITCHEN 2", None), ("12", None),
])
def test_parse_dimension_metres(text, expected):
    assert parse_dimension_metres(text) == expected

def test_scale_is_estimated_from_dimension_label_next_to_a_wall():
    walls_px = [{"points": [[100.0, 50.0], [400.0, 50.0]]}, {"points": [[100.0, 50.0], [100.0, 250.0]]}]
    dims = [{"text": "3000", "bbox_center": [250.0, 30.0]},   # labels the 300px wall -> 0.01 m/px
            {"text": "2000", "bbox_center": [80.0, 150.0]}]   # labels the 200px wall -> 0.01 m/px
    assert estimate_metres_per_pixel(walls_px, dims) == pytest.approx(0.01)

def test_no_usable_dimension_gives_no_estimate():
    walls_px = [{"points": [[0.0, 0.0], [300.0, 0.0]]}]
    assert estimate_metres_per_pixel(walls_px, [{"text": "BEDROOM", "bbox_center": [150.0, 10.0]}]) is None
    assert estimate_metres_per_pixel(walls_px, []) is None

def test_to_project_space_scales_and_flips_y():
    walls, symbols = to_project_space(
        [{"points": [[0.0, 100.0], [300.0, 100.0]], "thickness_m": 0.2, "height_m": 2.8}],
        [{"type": "door", "bbox_center": [150.0, 100.0], "angle_deg": 0.0, "confidence": 0.9}],
        metres_per_pixel=0.01, image_height_px=200)
    assert walls[0]["points"] == [[0.0, 1.0], [3.0, 1.0]]
    assert symbols[0]["bbox_center"] == [1.5, 1.0]
