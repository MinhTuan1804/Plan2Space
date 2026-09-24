# ai-service/tests/test_geometry_finalizer.py
from pipeline.geometry_finalizer import finalize_wall_geometry
from shapely.geometry import LineString, Polygon

def test_valid_polyline_passes_through_unchanged():
    line = [(0, 0), (5, 0), (5, 4)]
    result = finalize_wall_geometry([line])
    assert result[0] == line

def test_self_intersecting_polyline_is_repaired_to_valid_geometry():
    # A bowtie-shaped polyline is invalid; the finalizer must return something
    # Shapely accepts as a valid LineString/Polygon rather than passing it through.
    bowtie = [(0, 0), (4, 4), (4, 0), (0, 4)]
    result = finalize_wall_geometry([bowtie])
    line = LineString(result[0])
    assert line.is_valid

def test_unclosed_room_outline_gets_closed():
    almost_square = [(0, 0), (4, 0), (4, 4), (0, 4)]  # missing closing point back to (0,0)
    result = finalize_wall_geometry([almost_square], close_loops=True)
    assert result[0][0] == result[0][-1]

def test_self_intersecting_room_outline_is_repaired_to_a_valid_polygon():
    # Review Focus: a bowtie room outline would be rejected by the geometry API / PostGIS.
    bowtie = [(0, 0), (4, 4), (4, 0), (0, 4)]
    result = finalize_wall_geometry([bowtie], close_loops=True)
    polygon = Polygon(result[0])
    assert polygon.is_valid and polygon.area > 0
    assert result[0][0] == result[0][-1]

def test_degenerate_polylines_are_dropped():
    result = finalize_wall_geometry([[(1, 1), (1, 1)], [(0, 0), (2, 0)]])
    assert result == [[(0, 0), (2, 0)]]
