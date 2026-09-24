# ai-service/tests/test_dxf_parser.py
import pytest

from pipeline.dxf_parser import NoWallsFoundError, parse_dxf

def test_parses_raw_polyline_walls():
    result = parse_dxf("tests/fixtures/simple_walls.dxf")
    assert len(result["walls"]) == 2
    assert result["walls"][0]["points"] == [[0.0, 0.0], [5.0, 0.0]]

def test_parses_walls_from_block_inserts():
    # Review Focus: block-defined walls referenced via INSERT must not be dropped.
    result = parse_dxf("tests/fixtures/walls_with_block_inserts.dxf")
    assert len(result["walls"]) == 2
    # Second insert is offset by (0, 3): its wall should be translated accordingly.
    points = sorted(w["points"][0][1] for w in result["walls"])
    assert points == [0.0, 3.0]

def test_nested_inserts_apply_inner_transform_before_outer():
    result = parse_dxf("tests/fixtures/nested_block_inserts.dxf")
    assert [w["points"] for w in result["walls"]] == [[[10.0, 5.0], [13.0, 5.0]]]

def test_layer0_block_content_inherits_insert_layer_and_lines_count_as_walls():
    result = parse_dxf("tests/fixtures/layer0_and_lines.dxf")
    assert sorted(w["points"][0][1] for w in result["walls"]) == [0.0, 2.0]   # FURNITURE line ignored

def test_project_sample_plan_drawn_with_lines_yields_its_walls():
    result = parse_dxf("tests/fixtures/sample_house_plan.dxf")
    assert len(result["walls"]) == 6
    assert all(w["thickness_m"] > 0 and w["height_m"] > 0 for w in result["walls"])

def test_millimetre_drawing_is_converted_to_metres():
    result = parse_dxf("tests/fixtures/walls_in_millimetres.dxf")
    assert result["walls"][0]["points"] == [[0.0, 0.0], [5.0, 0.0]]

def test_drawing_without_wall_layers_fails_loudly_naming_its_layers():
    with pytest.raises(NoWallsFoundError, match="SKETCH"):
        parse_dxf("tests/fixtures/no_wall_layers.dxf")


# --- Final review I7: real architectural DXFs draw each wall as two parallel face lines. ---
import ezdxf

from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import rooms_from_walls


def _dxf(tmp_path, lines, insunits=None):
    doc = ezdxf.new()
    if insunits is not None:
        doc.header["$INSUNITS"] = insunits
    doc.layers.add(name="WALL")
    for a, b in lines:
        doc.modelspace().add_line(a, b, dxfattribs={"layer": "WALL"})
    path = tmp_path / "plan.dxf"
    doc.saveas(path)
    return str(path)


def test_two_face_lines_become_one_centreline_wall_with_the_gap_as_thickness(tmp_path):
    walls = parse_dxf(_dxf(tmp_path, [((0, 0), (5, 0)), ((0, 0.25), (5, 0.25))], insunits=6))["walls"]
    assert len(walls) == 1
    assert walls[0]["points"] == [[0.0, 0.125], [5.0, 0.125]]
    assert walls[0]["thickness_m"] == pytest.approx(0.25)


def test_project_sample_plan_faces_pair_into_six_walls_that_enclose_three_rooms():
    walls = parse_dxf("tests/fixtures/sample_house_plan.dxf")["walls"]
    assert len(walls) == 6
    assert all(w["thickness_m"] == pytest.approx(0.2) for w in walls)
    rooms = rooms_from_walls(heal_wall_topology(walls, snap_tolerance_m=0.005))
    assert len(rooms) == 3


def test_unitless_drawing_in_millimetres_is_detected(tmp_path):
    walls = parse_dxf(_dxf(tmp_path, [((0, 0), (8000, 0)), ((8000, 0), (8000, 6000))], insunits=0))["walls"]
    xs = [p[0] for w in walls for p in w["points"]]
    assert max(xs) == pytest.approx(8.0)
