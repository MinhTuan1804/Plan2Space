# ai-service/tests/test_serializer.py
import uuid

from pipeline.serializer import serialize_pipeline_result

def test_serialize_maps_symbol_to_nearest_wall():
    walls = [{"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8}]
    symbols = [{"type": "door", "bbox_center": [2.5, 0.05], "angle_deg": 0.0, "confidence": 0.9}]

    result = serialize_pipeline_result(walls, symbols)

    assert len(result["walls"]) == 1
    assert len(result["openings"]) == 1
    assert result["openings"][0]["type"] == "door"
    # The API's OpeningInput references walls by id (Task 5), not by list index.
    assert result["openings"][0]["wallId"] == result["walls"][0]["id"]

def test_output_matches_the_geometry_api_input_shape():
    walls = [{"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8}]
    result = serialize_pipeline_result(walls, [])
    wall = result["walls"][0]
    uuid.UUID(wall["id"])
    assert wall["points"] == [{"x": 0.0, "y": 0.0}, {"x": 5.0, "y": 0.0}]
    assert wall["thicknessMeters"] == 0.2 and wall["heightMeters"] == 2.8
    assert result["rooms"] == [] and result["openings"] == []

def test_opening_position_is_projected_onto_its_wall():
    walls = [{"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8}]
    symbols = [{"type": "window", "bbox_center": [2.5, 0.08], "angle_deg": 0.0, "confidence": 0.9}]
    opening = serialize_pipeline_result(walls, symbols)["openings"][0]
    assert opening["position"] == {"x": 2.5, "y": 0.0}
    assert opening["sillHeightMeters"] == 0.9

def test_symbol_far_from_every_wall_is_dropped():
    walls = [{"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8}]
    symbols = [{"type": "door", "bbox_center": [2.5, 3.0], "angle_deg": 0.0, "confidence": 0.9}]
    assert serialize_pipeline_result(walls, symbols)["openings"] == []
