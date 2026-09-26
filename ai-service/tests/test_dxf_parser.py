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


def test_the_line_capping_a_wall_end_is_not_a_wall_of_its_own():
    # CAD closes a wall's two face lines with a short line across its thickness at each end (at every
    # door jamb). Taken as a wall, it became a 0.2 m block sticking out into the doorway in 3D.
    from pipeline.dxf_parser import _pair_wall_faces
    faces_and_caps = [{"points": [[0, 0], [4, 0]]}, {"points": [[0, 0.22], [4, 0.22]]},
                      {"points": [[4, 0], [4, 0.22]]}, {"points": [[0, 0.22], [0, 0]]}]
    walls = _pair_wall_faces(faces_and_caps)
    assert len(walls) == 1
    assert walls[0]["thickness_m"] == 0.22

# --- Old-style POLYLINE walls, missing blocks and slightly damaged files (e.g. nha_2tang_pa_a.dxf). ---
def test_old_style_closed_polyline_walls_are_read(tmp_path):
    doc = ezdxf.new("R2000")
    doc.modelspace().add_polyline2d([(0, 0), (5, 0), (5, 4), (0, 4)], close=True, dxfattribs={"layer": "TUONG"})
    path = tmp_path / "polyline.dxf"
    doc.saveas(path)
    result = parse_dxf(str(path))
    assert len(result["walls"]) == 4


def test_insert_of_a_missing_block_is_skipped(tmp_path):
    doc = ezdxf.new()
    doc.blocks.new("GONE")
    doc.modelspace().add_blockref("GONE", (0, 0))
    doc.blocks.delete_block("GONE", safe=False)
    doc.modelspace().add_line((0, 0), (5, 0), dxfattribs={"layer": "WALL"})
    path = tmp_path / "missing_block.dxf"
    doc.saveas(path)
    assert len(parse_dxf(str(path))["walls"]) == 1


def test_a_file_that_is_not_a_dxf_fails_with_a_readable_message(tmp_path):
    path = tmp_path / "broken.dxf"
    path.write_bytes(b"this is not a drawing")
    with pytest.raises(ValueError, match="DXF"):
        parse_dxf(str(path))


def test_walls_drawn_as_closed_rectangles_are_read_whole(tmp_path):
    # Some plans draw each wall as one closed rectangle. Pairing its edges as loose face lines let an edge
    # pair with a neighbouring wall's edge instead, and walls came out partly missing (a two-storey plan).
    import ezdxf
    from shapely.geometry import LineString, box
    from shapely.ops import unary_union
    rects = [(-110, 0, 110, 6600), (3345, 5400, 3455, 5800), (0, 5745, 3450, 5855),
             (4350, 5745, 6800, 5855), (2745, 5800, 2855, 6000), (4345, 5800, 4455, 6100)]
    doc = ezdxf.new(); doc.header["$INSUNITS"] = 4
    for x0, y0, x1, y1 in rects:
        doc.modelspace().add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={"layer": "WALL"})
    path = tmp_path / "rect_walls.dxf"; doc.saveas(path)

    walls = parse_dxf(str(path))["walls"]
    lines = unary_union([LineString(w["points"]) for w in walls])
    for x0, y0, x1, y1 in rects:
        x0, y0, x1, y1 = x0 / 1000, y0 / 1000, x1 / 1000, y1 / 1000
        along = max(x1 - x0, y1 - y0)
        covered = lines.intersection(box(x0, y0, x1, y1).buffer(0.001)).length
        assert covered >= 0.95 * along, (x0, y0, x1, y1, covered)
    thickness = {round(w["thickness_m"], 3) for w in walls}
    assert thickness <= {0.11, 0.22}


def test_a_wall_ending_at_a_small_stub_stays_straight(tmp_path):
    # Joining a wall end onto a 10 x 11 cm stub pulled it sideways (x 30.0 -> 29.95): the wall leaned 3.6
    # degrees, the window gap beside it was no longer collinear, and the room around it never closed.
    import ezdxf
    doc = ezdxf.new(); doc.header["$INSUNITS"] = 4
    for x0, y0, x1, y1 in [(29890, 8800, 30110, 9600), (29900, 9540, 30000, 9650)]:
        doc.modelspace().add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={"layer": "WALL"})
    path = tmp_path / "stub.dxf"; doc.saveas(path)
    long_wall = max(parse_dxf(str(path))["walls"], key=lambda w: abs(w["points"][1][1] - w["points"][0][1]))
    assert [round(p[0], 3) for p in long_wall["points"]] == [30.0, 30.0]


def test_room_names_written_in_the_drawing_label_the_rooms(tmp_path):
    # Plans name their rooms on a room-text layer; "Room N" hid them, and the floor type follows the name.
    from pipeline.rooms import label_rooms
    import ezdxf
    doc = ezdxf.new(); doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    msp.add_text("GARA", dxfattribs={"layer": "TEXT-ROOM", "insert": (2000, 2000)})
    msp.add_text("19.72 m²", dxfattribs={"layer": "TEXT-ROOM", "insert": (2000, 1600)})
    msp.add_text("PHÒNG THỜ", dxfattribs={"layer": "TEXT", "insert": (2000, 2500)})      # not a room-name layer
    msp.add_lwpolyline([(0, 0), (4000, 0), (4000, 110), (0, 110)], close=True, dxfattribs={"layer": "WALL"})
    path = tmp_path / "names.dxf"; doc.saveas(path)
    names = parse_dxf(str(path))["room_names"]
    assert names == [("GARA", 2.0, 2.0)]
    rooms = [{"points": [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], "label": "Room 1"},
             {"points": [[5, 0], [9, 0], [9, 4], [5, 4], [5, 0]], "label": "Room 2"}]
    assert [r["label"] for r in label_rooms(rooms, names)] == ["GARA", "Room 2"]


def test_a_small_square_patch_at_a_wall_junction_is_not_a_wall(tmp_path):
    # Plans close a corner between two wall runs with a little square. As a wall it became a 10 cm block
    # standing in the room. A rectangle is a wall run only if it is clearly longer than it is thick.
    import ezdxf
    doc = ezdxf.new(); doc.header["$INSUNITS"] = 4
    for x0, y0, x1, y1 in [(22745, 5800, 22855, 5900), (22700, 5745, 26400, 5855)]:
        doc.modelspace().add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={"layer": "WALL"})
    path = tmp_path / "patch.dxf"; doc.saveas(path)
    walls = parse_dxf(str(path))["walls"]
    assert len(walls) == 1
    assert round(walls[0]["thickness_m"], 3) == 0.11


def test_a_pier_standing_at_a_doorway_is_kept(tmp_path):
    # The garage pier is as square as a junction patch but stands at the door jamb, not on another wall.
    import ezdxf
    doc = ezdxf.new(); doc.header["$INSUNITS"] = 4
    for x0, y0, x1, y1 in [(0, -110, 200, 110), (-110, 0, 110, 6600), (3200, -110, 4800, 110)]:
        doc.modelspace().add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={"layer": "WALL"})
    path = tmp_path / "pier.dxf"; doc.saveas(path)
    walls = parse_dxf(str(path))["walls"]
    assert any(round(w["thickness_m"], 3) == 0.2 for w in walls), "the pier is gone"   # only it is 0.2 thick
