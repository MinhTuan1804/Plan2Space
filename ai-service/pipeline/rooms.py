"""Rooms = the closed faces of the healed wall graph (spec: room polygons from the wall network)."""
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import snap, polygonize, unary_union

from pipeline.geometry_finalizer import finalize_wall_geometry
from pipeline.wall_gaps import find_wall_gaps

JUNCTION_SNAP_M = 0.15   # half the thickest wall plus slack
MIN_ROOM_AREA_M2 = 1.0
MIN_ROOM_WIDTH_M = 0.6    # narrower faces are the gap between a wall's two faces, not a room


def _min_width(polygon: Polygon) -> float:
    box = polygon.minimum_rotated_rectangle.exterior.coords
    return min(LineString([box[i], box[i + 1]]).length for i in range(4))


def label_rooms(rooms: list[dict], names: list[tuple[str, float, float]]) -> list[dict]:
    """Names each room after the drawing's name text(s) inside it; rooms with none keep their label."""
    for room in rooms:
        polygon = Polygon(room["points"])
        inside = [text for text, x, y in names if polygon.contains(Point(x, y))]
        if inside:
            room["label"] = " / ".join(inside)
    return rooms


def rooms_from_walls(walls: list[dict]) -> list[dict]:
    """Polygonizes wall centrelines (noded, so T-junctions split faces) into room outlines.
    Returns [{"points": [[x, y], ...] closed, "label": "Room N"}] in project-space metres."""
    lines = [LineString(w["points"]) for w in walls if len(w["points"]) >= 2]
    if not lines:
        return []
    # A doorway is a gap in the wall, so without bridging it no loop closes and no room is found.
    # The bridges exist only for this polygonization; the saved walls keep their real gaps.
    lines += [LineString([u, v]) for u, v, _ in find_wall_gaps(walls)]
    # Walls drawn as outlines touch at their faces, so their centrelines stop a half-thickness short of
    # each other (a wall end beside a pier): snap each line onto the others so every junction closes.
    network = unary_union(lines)
    lines = [snap(line, network, JUNCTION_SNAP_M) for line in lines]
    faces = [p for p in polygonize(unary_union(lines))
             if p.area >= MIN_ROOM_AREA_M2 and _min_width(p) >= MIN_ROOM_WIDTH_M
             # A face with a hole is the space *around* free-standing rooms. A room outline is one
             # ring, so keeping it would fill the hole, cover those rooms, and the geometry API
             # would reject the entire plan for overlapping rooms.
             and not p.interiors]
    faces.sort(key=lambda p: (round(p.centroid.y, 3), round(p.centroid.x, 3)))   # deterministic numbering
    # Same repair path as any room outline (closed, valid) before it reaches the geometry API.
    outlines = finalize_wall_geometry([list(p.exterior.coords) for p in faces], close_loops=True)
    return [{"points": [[round(x, 6), round(y, 6)] for x, y in outline], "label": f"Room {i + 1}"}
            for i, outline in enumerate(outlines)]
