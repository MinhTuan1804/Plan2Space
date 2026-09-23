# ai-service/tests/test_generative_staging.py
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, box

from pipeline.generative_staging import catalog_for, suggest_layout


def _assert_valid_layout(room, items):
    room_poly = Polygon(room)
    boxes = []
    for item in items:
        item_box = box(
            item["position"][0] - item["width_m"] / 2, item["position"][1] - item["depth_m"] / 2,
            item["position"][0] + item["width_m"] / 2, item["position"][1] + item["depth_m"] / 2,
        )
        assert room_poly.contains(item_box), f"{item['item']} exits room bounds"
        for other in boxes:
            assert item_box.intersection(other).area < 1e-6, f"{item['item']} overlaps another item"
        boxes.append(item_box)


def test_suggested_items_fit_inside_room_and_do_not_overlap():
    room = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]  # 4x4m bedroom
    items = suggest_layout(room, "Bedroom")

    _assert_valid_layout(room, items)
    assert len(items) > 0


def test_l_shaped_room_keeps_every_item_inside_the_polygon_not_just_its_bounding_box():
    room = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6], [0, 0]]
    items = suggest_layout(room, "Living Room")
    _assert_valid_layout(room, items)
    assert len(items) > 0


def test_room_too_small_for_any_item_returns_no_items():
    assert suggest_layout([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]], "Bedroom") == []


@pytest.mark.parametrize("label,expected_first", [
    ("Bedroom 2", "bed"), ("master bedroom", "bed"), ("Phòng ngủ", "bed"),
    ("Living room", "sofa"), ("Phòng khách", "sofa"), ("Storage", "sofa"),
])
def test_room_labels_are_matched_by_keyword(label, expected_first):
    assert catalog_for(label)[0]["item"] == expected_first


def test_invalid_polygon_is_rejected():
    with pytest.raises(ValueError):
        suggest_layout([[0, 0], [1, 1]], "Bedroom")


def test_internal_endpoint_requires_the_service_token(monkeypatch):
    from api.main import app
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "svc")
    client = TestClient(app)
    body = {"roomPolygon": [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], "roomLabel": "Bedroom"}

    assert client.post("/staging/suggest", json=body).status_code == 401
    ok = client.post("/staging/suggest", json=body, headers={"X-Internal-Token": "svc"})
    assert ok.status_code == 200 and ok.json()["items"][0]["item"] == "bed"
    bad = client.post("/staging/suggest", json={"roomPolygon": [[0, 0]], "roomLabel": "Bedroom"}, headers={"X-Internal-Token": "svc"})
    assert bad.status_code == 422
