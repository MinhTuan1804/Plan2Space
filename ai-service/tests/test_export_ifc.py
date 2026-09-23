# ai-service/tests/test_export_ifc.py
import ifcopenshell
import ifcopenshell.geom
import numpy as np
import pytest

from pipeline.export_ifc import export_ifc

GEOMETRY = {
    "walls": [{"id": "w", "points": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 4}], "thicknessMeters": 0.2, "heightMeters": 2.8}],
    "rooms": [],
    "openings": [
        {"wallId": "w", "type": "Door", "position": {"x": 2.5, "y": 0}, "widthMeters": 0.9, "sillHeightMeters": 0},
        {"wallId": "w", "type": "Window", "position": {"x": 5, "y": 2}, "widthMeters": 1.2, "sillHeightMeters": 0.9},
    ],
}


def _model():
    data = export_ifc(GEOMETRY)
    assert data.startswith(b"ISO-10303-21")
    return ifcopenshell.file.from_string(data.decode("utf-8"))


def test_spatial_structure_units_and_one_wall_per_segment():
    model = _model()
    assert len(model.by_type("IfcProject")) == 1
    assert model.by_type("IfcProject")[0].UnitsInContext is not None
    walls = model.by_type("IfcWall")
    assert len(walls) == 2   # L-shaped polyline wall -> two straight IFC walls
    storey = model.by_type("IfcBuildingStorey")[0]
    contained = {e for rel in storey.ContainsElements for e in rel.RelatedElements}
    assert set(walls) <= contained


def _world_vertices(model, products):
    # ifcopenshell.geom.iterator (create_shape returned empty shapes intermittently in 0.8.0 on Windows).
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    iterator = ifcopenshell.geom.iterator(settings, model, include=products)
    shapes = []
    assert iterator.initialize()
    while True:
        shapes.append(np.array(iterator.get().geometry.verts).reshape(-1, 3))
        if not iterator.next():
            return shapes


def test_walls_have_real_geometry_matching_the_plan():
    # Without a representation an IFC viewer shows nothing (the brief's version).
    model = _model()
    shapes = _world_vertices(model, model.by_type("IfcWall"))
    assert all(len(s) > 8 for s in shapes)   # more than a plain box: the openings are cut through
    verts = np.vstack(shapes)
    extents = verts.max(axis=0) - verts.min(axis=0)
    assert extents[0] == pytest.approx(5.1, abs=0.01)
    assert extents[1] == pytest.approx(4.1, abs=0.01)
    assert extents[2] == pytest.approx(2.8, abs=0.01)


def test_doors_and_windows_void_and_fill_their_wall():
    model = _model()
    assert len(model.by_type("IfcDoor")) == 1
    assert len(model.by_type("IfcWindow")) == 1
    assert len(model.by_type("IfcRelVoidsElement")) == 2
    assert len(model.by_type("IfcRelFillsElement")) == 2


def test_empty_plan_is_rejected():
    with pytest.raises(ValueError, match="nothing to export"):
        export_ifc({"walls": [], "rooms": [], "openings": []})
