# ai-service/tests/test_copilot_payload.py
# Every chat message used to carry the whole plan: ~4,200 tokens for a 75-wall DXF, ~62,000 for an
# image import. The model only needs ids and centimetre coordinates.
from unittest.mock import patch

from pipeline.copilot_intent import compact_geometry, parse_intent


def _wall(i):
    return {"id": f"w{i}", "points": [{"x": 0.123456, "y": 1.987654}, {"x": 5.0, "y": 1.987654}],
            "thicknessMeters": 0.2, "heightMeters": 2.8, "version": 3}


def test_the_prompt_carries_ids_and_centimetre_points_only():
    geometry = {
        "walls": [_wall(1)],
        "rooms": [{"id": "r1", "label": "Bedroom", "points": [{"x": 0, "y": 0}], "version": 3}],
        "openings": [{"id": "o1", "wallId": "w1", "type": "Door", "position": {"x": 2.004, "y": 1.99},
                      "widthMeters": 0.9, "sillHeightMeters": 0, "version": 3}],
        "version": 3,
    }

    assert compact_geometry(geometry) == {
        "walls": [{"id": "w1", "points": [[0.12, 1.99], [5.0, 1.99]]}],
        "rooms": [{"id": "r1", "label": "Bedroom", "points": [[0.0, 0.0]]}],
        "openings": [{"id": "o1", "wallId": "w1", "type": "Door", "position": [2.0, 1.99]}],
    }


def test_a_wall_without_points_is_kept_by_id():
    assert compact_geometry({"walls": [{"id": "w1"}]}) == {
        "walls": [{"id": "w1", "points": []}], "rooms": [], "openings": []}


@patch("pipeline.copilot_intent._call_llm")
def test_the_model_receives_the_compacted_geometry(mock_llm, monkeypatch):
    monkeypatch.setenv("COPILOT_API_KEY", "test-key")
    mock_llm.return_value = '{"action": "unknown", "params": {}}'

    parse_intent("hi", {"walls": [_wall(1)]})

    assert mock_llm.call_args[0][1] == {
        "walls": [{"id": "w1", "points": [[0.12, 1.99], [5.0, 1.99]]}], "rooms": [], "openings": []}


@patch("pipeline.copilot_intent._call_llm")
def test_a_plan_too_large_for_the_prompt_is_refused_not_truncated(mock_llm, monkeypatch):
    # Truncating would let the model pick the wrong wall while the user sees a confident answer.
    monkeypatch.setenv("COPILOT_API_KEY", "test-key")

    result = parse_intent("move wall w1", {"walls": [_wall(i) for i in range(5000)]})

    mock_llm.assert_not_called()
    assert result["action"] == "unknown"
    assert "too large" in result["reason"]
