# ai-service/tests/test_copilot_intent.py
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pipeline import copilot_intent
from pipeline.copilot_intent import parse_intent


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setenv("COPILOT_API_KEY", "test-key")


@patch("pipeline.copilot_intent._call_llm")
def test_parses_move_wall_intent(mock_llm):
    mock_llm.return_value = '{"action": "move_wall", "params": {"wall_id": "w1", "dx": 0.5, "dy": 0.0}}'

    result = parse_intent("move the wall on the left 50cm to the right", current_geometry={"walls": [{"id": "w1"}]})

    assert result["action"] == "move_wall"
    assert result["params"]["wall_id"] == "w1"


@patch("pipeline.copilot_intent._call_llm")
def test_unparseable_response_falls_back_to_unknown(mock_llm):
    mock_llm.return_value = "not valid json at all"

    result = parse_intent("do something vague", current_geometry={"walls": []})

    assert result["action"] == "unknown"


@patch("pipeline.copilot_intent._call_llm")
def test_markdown_fenced_json_is_accepted(mock_llm):
    mock_llm.return_value = '```json\n{"action": "resize_room", "params": {"room_id": "r1", "scale": 1.2}}\n```'
    assert parse_intent("make the kitchen 20% bigger", {"rooms": [{"id": "r1"}]})["action"] == "resize_room"


@pytest.mark.parametrize("raw", [
    '{"action": "delete_everything", "params": {}}',   # not an allowed action
    '{"action": "move_wall", "params": "w1"}',          # params must be an object
    '["move_wall"]',                                    # not an object at all
])
@patch("pipeline.copilot_intent._call_llm")
def test_off_contract_llm_output_is_unknown(mock_llm, raw):
    mock_llm.return_value = raw
    assert parse_intent("x", {"walls": []}) == {"action": "unknown", "params": {}}


def test_without_an_api_key_the_copilot_reports_it_is_not_configured(monkeypatch):
    monkeypatch.delenv("COPILOT_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with patch("pipeline.copilot_intent._call_llm") as mock_llm:
        result = parse_intent("move a wall", {"walls": []})
    mock_llm.assert_not_called()
    assert result["action"] == "unknown"
    assert "not configured" in result["reason"]


def test_llm_provider_errors_become_a_readable_unknown_reply():
    # e.g. 429 insufficient_quota, bad key, network — the user should see why, not an HTTP 500.
    import httpx
    import openai
    error = openai.RateLimitError("quota", response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body=None)
    with patch("pipeline.copilot_intent._call_llm", side_effect=error):
        result = parse_intent("move a wall", {"walls": []})
    assert result["action"] == "unknown"
    assert "unavailable" in result["reason"]


def test_llm_call_uses_configured_model_and_json_mode(monkeypatch):
    monkeypatch.setenv("COPILOT_MODEL", "gemini-1.5-flash")
    monkeypatch.setenv("COPILOT_BASE_URL", "https://example.invalid/v1")
    created = {}

    class FakeOpenAI:
        def __init__(self, **kwargs):
            created["client"] = kwargs
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

        def _create(self, **kwargs):
            created["request"] = kwargs
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"action":"unknown","params":{}}'))])

    monkeypatch.setattr(copilot_intent, "OpenAI", FakeOpenAI)
    copilot_intent._call_llm("hi", {"walls": []})

    assert created["client"] == {"api_key": "test-key", "base_url": "https://example.invalid/v1"}
    assert created["request"]["model"] == "gemini-1.5-flash"
    assert created["request"]["response_format"] == {"type": "json_object"}


def test_internal_parse_endpoint_requires_the_service_token(monkeypatch):
    from api.main import app
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "svc")
    client = TestClient(app)
    body = {"message": "move wall", "geometry": {"walls": []}}

    assert client.post("/copilot/parse", json=body).status_code == 401
    with patch("api.routers.copilot.parse_intent", return_value={"action": "unknown", "params": {}}):
        ok = client.post("/copilot/parse", json=body, headers={"X-Internal-Token": "svc"})
    assert ok.status_code == 200 and ok.json() == {"action": "unknown", "params": {}}
