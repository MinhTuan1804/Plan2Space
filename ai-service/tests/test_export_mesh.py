# ai-service/tests/test_export_mesh.py
import io
import json

import pytest
import trimesh
from fastapi.testclient import TestClient

from pipeline.export_mesh import build_mesh_from_geometry, export_mesh

ONE_WALL = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}


def test_build_mesh_from_single_wall():
    mesh = build_mesh_from_geometry(ONE_WALL)
    assert isinstance(mesh, trimesh.Trimesh)
    assert mesh.is_watertight


def test_export_gltf_produces_nonempty_bytes():
    data = export_mesh(build_mesh_from_geometry(ONE_WALL), "gltf")
    assert len(data) > 0


def test_export_obj_produces_nonempty_bytes():
    data = export_mesh(build_mesh_from_geometry(ONE_WALL), "obj")
    assert len(data) > 0


def test_polyline_walls_keep_every_segment_and_accept_api_point_objects():
    # Shape the .NET GeometryDto serializes: points as {"x", "y"} objects; an L-shaped polyline wall.
    geometry = {"walls": [{"id": "w", "points": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 4}],
                           "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    (minx, miny, minz), (maxx, maxy, maxz) = build_mesh_from_geometry(geometry).bounds
    assert maxx - minx == pytest.approx(5.1, abs=1e-6)
    assert maxy - miny == pytest.approx(4.1, abs=1e-6)
    assert maxz - minz == pytest.approx(2.8, abs=1e-6)


def test_doors_are_cut_out_of_their_wall():
    geometry = {
        "walls": [{"id": "w", "points": [{"x": 0, "y": 0}, {"x": 5, "y": 0}], "thicknessMeters": 0.2, "heightMeters": 2.8}],
        "rooms": [],
        "openings": [{"wallId": "w", "type": "Door", "position": {"x": 2.5, "y": 0}, "widthMeters": 0.9, "sillHeightMeters": 0}],
    }
    mesh = build_mesh_from_geometry(geometry)
    assert mesh.is_watertight
    assert mesh.volume == pytest.approx(5 * 0.2 * 2.8 - 0.9 * 0.2 * 2.1, abs=1e-6)


def test_several_openings_on_one_wall_are_all_cut():
    geometry = {
        "walls": [{"id": "w", "points": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 4}], "thicknessMeters": 0.2, "heightMeters": 2.8}],
        "rooms": [],
        "openings": [
            {"wallId": "w", "type": "Door", "position": {"x": 2.5, "y": 0}, "widthMeters": 0.9, "sillHeightMeters": 0},
            {"wallId": "w", "type": "Window", "position": {"x": 5, "y": 2}, "widthMeters": 1.2, "sillHeightMeters": 0.9},
        ],
    }
    mesh = build_mesh_from_geometry(geometry)
    solid = (5 + 4) * 0.2 * 2.8 - 0.1 * 0.1 * 2.8          # two legs minus their overlap at the corner
    assert mesh.volume == pytest.approx(solid - 0.9 * 0.2 * 2.1 - 1.2 * 0.2 * 1.2, abs=1e-4)   # manifold float noise


def test_glb_is_a_single_binary_file_and_y_is_up():
    data = export_mesh(build_mesh_from_geometry(ONE_WALL), "glb")
    assert data[:4] == b"glTF"
    loaded = trimesh.load(io.BytesIO(data), file_type="glb", force="mesh")
    extents = loaded.bounds[1] - loaded.bounds[0]
    assert extents[1] == pytest.approx(2.8, abs=1e-6)   # wall height along glTF's up axis (Y)


def test_gltf_is_self_contained_json_with_embedded_buffers():
    doc = json.loads(export_mesh(build_mesh_from_geometry(ONE_WALL), "gltf"))
    assert all(b["uri"].startswith("data:") for b in doc["buffers"])


def test_empty_plan_and_unknown_format_are_rejected():
    with pytest.raises(ValueError, match="nothing to export"):
        build_mesh_from_geometry({"walls": [], "rooms": [], "openings": []})
    with pytest.raises(ValueError, match="Unsupported"):
        export_mesh(build_mesh_from_geometry(ONE_WALL), "fbx")


def test_internal_export_endpoint(monkeypatch):
    from api.main import app
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "svc")
    client = TestClient(app)
    body = {"geometry": ONE_WALL, "format": "glb"}

    assert client.post("/export", json=body).status_code == 401
    ok = client.post("/export", json=body, headers={"X-Internal-Token": "svc"})
    assert ok.status_code == 200 and ok.headers["content-type"] == "model/gltf-binary" and ok.content[:4] == b"glTF"
    empty = client.post("/export", json={"geometry": {"walls": []}, "format": "glb"}, headers={"X-Internal-Token": "svc"})
    assert empty.status_code == 422


def test_internal_exporter_failures_are_not_reported_as_a_bad_plan(monkeypatch):
    # A library error (e.g. a boolean failure) is our bug -> 500, not a 422 blaming the user's plan.
    from unittest.mock import patch
    from api.main import app
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "svc")
    client = TestClient(app, raise_server_exceptions=False)
    with patch("api.routers.export.build_mesh_from_geometry", side_effect=ValueError("Difference only defined over two meshes.")):
        res = client.post("/export", json={"geometry": ONE_WALL, "format": "glb"}, headers={"X-Internal-Token": "svc"})
    assert res.status_code == 500


@pytest.mark.parametrize("fmt,content_type,magic", [
    ("ifc", "application/x-step", b"ISO-10303-21"),
    ("pdf", "application/pdf", b"%PDF"),
])
def test_internal_export_endpoint_serves_ifc_and_pdf(monkeypatch, fmt, content_type, magic):
    from api.main import app
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "svc")
    res = TestClient(app).post("/export", json={"geometry": ONE_WALL, "format": fmt}, headers={"X-Internal-Token": "svc"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith(content_type)
    assert res.content.startswith(magic)
