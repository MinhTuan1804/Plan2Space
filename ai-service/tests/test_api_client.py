# ai-service/tests/test_api_client.py
import json

import httpx
import pytest

from pipeline import api_client

def _client(handler):
    return lambda: httpx.Client(transport=httpx.MockTransport(handler), base_url="http://api")

def test_push_reads_current_version_then_saves_with_service_token(monkeypatch):
    seen = []

    def handler(request: httpx.Request):
        seen.append((request.method, request.url.path, request.headers.get("X-Internal-Token")))
        if request.method == "GET":
            return httpx.Response(200, json={"version": 7})
        assert json.loads(request.read())["baseVersion"] == 7
        return httpx.Response(200, json={"version": 8})

    monkeypatch.setattr(api_client, "_http", _client(handler))
    monkeypatch.setattr(api_client, "INTERNAL_TOKEN", "secret")

    api_client.push_geometry_to_api("p1", {"walls": [], "rooms": [], "openings": []})

    assert seen == [("GET", "/internal/projects/p1/geometry/version", "secret"),
                    ("PUT", "/internal/projects/p1/geometry", "secret")]

def test_push_raises_with_api_message_on_rejection(monkeypatch):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"version": 0})
        return httpx.Response(422, json={"message": "Overlapping rooms detected"})

    monkeypatch.setattr(api_client, "_http", _client(handler))
    with pytest.raises(api_client.GeometryRejectedError, match="Overlapping rooms"):
        api_client.push_geometry_to_api("p1", {"walls": [], "rooms": [], "openings": []})
