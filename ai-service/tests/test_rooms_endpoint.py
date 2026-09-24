# ai-service/tests/test_rooms_endpoint.py
# A hand-edited plan needs its rooms re-derived by the same code the import uses.
from fastapi.testclient import TestClient

from api.main import app

SQUARE = [[[0, 0], [4, 0]], [[4, 0], [4, 3]], [[4, 3], [0, 3]], [[0, 3], [0, 0]]]


def test_rooms_are_derived_from_the_posted_walls(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")

    res = TestClient(app).post("/rooms/derive", json={"walls": [{"points": p} for p in SQUARE]},
                               headers={"X-Internal-Token": "t"})

    assert res.status_code == 200
    rooms = res.json()["rooms"]
    assert len(rooms) == 1 and rooms[0]["label"] == "Room 1"


def test_a_doorway_gap_still_closes_the_room(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")
    walls = [[[0, 0], [1.5, 0]], [[2.4, 0], [4, 0]]] + SQUARE[1:]   # 0.9 m doorway in the bottom wall

    res = TestClient(app).post("/rooms/derive", json={"walls": [{"points": p} for p in walls]},
                               headers={"X-Internal-Token": "t"})

    assert len(res.json()["rooms"]) == 1


def test_the_endpoint_requires_the_service_token(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")

    res = TestClient(app).post("/rooms/derive", json={"walls": []})

    assert res.status_code == 401
