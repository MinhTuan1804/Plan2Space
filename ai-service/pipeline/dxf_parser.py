import math

import ezdxf
from ezdxf import recover
from ezdxf.math import Matrix44

from pipeline.wall_gaps import find_wall_gaps

DEFAULT_WALL_THICKNESS_M = 0.2
DEFAULT_WALL_HEIGHT_M = 2.8
# Substring match: covers WALL, WALLS, A-WALL, A-WALL-EXT… plus the Vietnamese "TUONG" (tường).
WALL_LAYER_HINTS = ("WALL", "TUONG")
WALL_ENTITY_TYPES = ("LWPOLYLINE", "POLYLINE", "LINE")
# A door/window is drawn as a gap in the wall plus a leaf/swing on its own layer; the layer names
# the kind, the gap gives position and width. "CUA DI"/"CUA SO" are the Vietnamese equivalents.
DOOR_LAYER_HINTS = ("DOOR", "CUADI", "CUA-DI", "CUA_DI", "CUA DI")
WINDOW_LAYER_HINTS = ("WINDOW", "CUASO", "CUA-SO", "CUA_SO", "CUA SO")
# $INSUNITS code -> metres. 0 (unitless) is treated as metres.
INSUNITS_TO_METRES = {0: 1.0, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}


class NoWallsFoundError(ValueError):
    """The drawing has no geometry on a wall-like layer; surfaced to the user instead of an empty plan."""


def _is_wall_layer(layer_name: str) -> bool:
    upper = layer_name.upper()
    return any(hint in upper for hint in WALL_LAYER_HINTS)


def _opening_kind(layer_name: str) -> str | None:
    upper = layer_name.upper()
    if any(hint in upper for hint in DOOR_LAYER_HINTS):
        return "door"
    if any(hint in upper for hint in WINDOW_LAYER_HINTS):
        return "window"
    return None


def _effective_layer(entity, inherited_layer: str | None) -> str:
    # Block content drawn on layer "0" takes the layer of the INSERT that places it.
    layer = entity.dxf.layer
    return inherited_layer if layer == "0" and inherited_layer else layer


def _raw_points(entity) -> list[tuple[float, float]]:
    kind = entity.dxftype()
    if kind == "LINE":
        return [(entity.dxf.start.x, entity.dxf.start.y), (entity.dxf.end.x, entity.dxf.end.y)]
    if kind == "LWPOLYLINE":
        points = [(p[0], p[1]) for p in entity.get_points(format="xy")]
    else:  # POLYLINE (2D/3D): the old-style polyline has is_closed, not LWPOLYLINE's closed
        if entity.is_poly_face_mesh or entity.is_polygon_mesh:
            return []
        points = [(v.x, v.y) for v in entity.points()]
    closed = entity.closed if kind == "LWPOLYLINE" else entity.is_closed
    if closed and points and points[0] != points[-1]:
        points.append(points[0])
    return points


def _marker_point(entity, transform: Matrix44 | None) -> tuple[float, float] | None:
    """One representative point for a door/window symbol, used only to name the gap it sits in."""
    kind = entity.dxftype()
    if kind in ("ARC", "CIRCLE"):
        point = (entity.dxf.center.x, entity.dxf.center.y)
    elif kind in WALL_ENTITY_TYPES:
        points = _raw_points(entity)
        if not points:
            return None
        point = (sum(x for x, _ in points) / len(points), sum(y for _, y in points) / len(points))
    else:
        return None
    if transform is not None:
        moved = transform.transform((point[0], point[1], 0))
        point = (moved.x, moved.y)
    return point


def _extract_from_space(space, transform: Matrix44 | None, inherited_layer: str | None,
                        scale: float, walls: list[dict], markers: list[tuple[str, float, float]]) -> None:
    for entity in space:
        kind = entity.dxftype()
        layer = _effective_layer(entity, inherited_layer)
        opening_kind = _opening_kind(layer)
        if kind == "INSERT":
            # ezdxf matrices use row vectors: apply the insert's own transform first, then the parent's.
            insert_transform = entity.matrix44()
            combined = insert_transform if transform is None else insert_transform @ transform
            block = entity.block()
            if block is None or block.block.is_xref:   # missing definition or unresolved external reference
                continue
            _extract_from_space(block, combined, layer, scale, walls, markers)
        elif opening_kind is not None:
            point = _marker_point(entity, transform)
            if point is not None:
                markers.append((opening_kind, point[0], point[1]))
        elif kind in WALL_ENTITY_TYPES and _is_wall_layer(layer):
            points = _raw_points(entity)
            if transform is not None:
                points = [(v.x, v.y) for v in (transform.transform((x, y, 0)) for x, y in points)]
            if len(points) < 2:
                continue
            walls.append({
                "points": [[round(x * scale, 6), round(y * scale, 6)] for x, y in points],
                "thickness_m": DEFAULT_WALL_THICKNESS_M,
                "height_m": DEFAULT_WALL_HEIGHT_M,
            })


# A unitless drawing whose extent exceeds this many units is taken to be in millimetres (a 200 m house is implausible).
UNITLESS_MM_EXTENT = 200.0
# Two parallel wall-layer lines this far apart, overlapping lengthwise, are the two faces of one wall.
FACE_PAIR_MIN_GAP_M = 0.05
FACE_PAIR_MAX_GAP_M = 0.45
FACE_PAIR_MAX_ANGLE_DEG = 2.0
FACE_PAIR_MIN_OVERLAP = 0.5      # of the shorter face
T_JOIN_SLACK_M = 0.01


def _metres_per_unit(doc, walls: list[dict]) -> float:
    units = doc.header.get("$INSUNITS", 0)
    if units in INSUNITS_TO_METRES and units != 0:
        return INSUNITS_TO_METRES[units]
    extent = max((abs(c) for w in walls for p in w["points"] for c in p), default=0.0)
    return 0.001 if extent > UNITLESS_MM_EXTENT else 1.0


def _segments(walls: list[dict]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    segs = []
    for wall in walls:
        pts = [tuple(p) for p in wall["points"]]
        segs.extend((a, b) for a, b in zip(pts, pts[1:]) if a != b)
    return segs


def _face_pair(s, t):
    """(gap, overlap, centreline) if segments s and t are the two faces of one wall, else None."""
    (ax, ay), (bx, by) = s
    length_s = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length_s, (by - ay) / length_s
    (cx, cy), (dx, dy) = t
    length_t = math.hypot(dx - cx, dy - cy)
    if abs(ux * (dy - cy) - uy * (dx - cx)) / length_t > math.sin(math.radians(FACE_PAIR_MAX_ANGLE_DEG)):
        return None
    nx, ny = -uy, ux
    dist_c, dist_d = nx * (cx - ax) + ny * (cy - ay), nx * (dx - ax) + ny * (dy - ay)
    gap = (dist_c + dist_d) / 2
    if not FACE_PAIR_MIN_GAP_M <= abs(gap) <= FACE_PAIR_MAX_GAP_M or abs(dist_c - dist_d) > T_JOIN_SLACK_M:
        return None
    tc, td = ux * (cx - ax) + uy * (cy - ay), ux * (dx - ax) + uy * (dy - ay)
    t0, t1 = min(tc, td), max(tc, td)
    overlap = min(length_s, t1) - max(0.0, t0)
    if overlap < FACE_PAIR_MIN_OVERLAP * min(length_s, length_t):
        return None
    start, end = (0.0 + t0) / 2, (length_s + t1) / 2
    half = gap / 2
    centreline = [[ax + ux * start + nx * half, ay + uy * start + ny * half],
                  [ax + ux * end + nx * half, ay + uy * end + ny * half]]
    return abs(gap), overlap, centreline


def _join_t_ends(walls: list[dict]) -> None:
    """A paired wall's centreline stops at the neighbouring wall's face; extend it onto that wall's centreline."""
    for wall in walls:
        if not wall.get("_paired"):
            continue
        for idx in (0, -1):
            px, py = wall["points"][idx]
            for other in walls:
                if other is wall:
                    continue
                (ax, ay), (bx, by) = other["points"][0], other["points"][-1]
                dx, dy = bx - ax, by - ay
                length_sq = dx * dx + dy * dy
                t = ((px - ax) * dx + (py - ay) * dy) / length_sq
                qx, qy = ax + t * dx, ay + t * dy
                if 0 < t < 1 and 0 < math.hypot(px - qx, py - qy) <= other["thickness_m"] / 2 + T_JOIN_SLACK_M:
                    wall["points"][idx] = [qx, qy]
                    break


# A line across a paired wall's thickness at its centreline closes the wall's outline (at every door jamb
# and wall end); it is drawing, not a wall.
END_CAP_TOLERANCE_M = 0.02


def _caps_a_wall(seg, paired: list[dict]) -> bool:
    (ax, ay), (bx, by) = seg
    length = math.hypot(bx - ax, by - ay)
    if length == 0:
        return True
    mid = ((ax + bx) / 2, (ay + by) / 2)
    for wall in paired:
        (cx, cy), (dx, dy) = wall["points"][0], wall["points"][-1]
        wall_length = math.hypot(dx - cx, dy - cy)
        if wall_length == 0 or abs(length - wall["thickness_m"]) > END_CAP_TOLERANCE_M:
            continue
        across = abs((bx - ax) * (dx - cx) + (by - ay) * (dy - cy)) / (length * wall_length)
        if across > 0.1:                      # not perpendicular to this wall
            continue
        t = max(0.0, min(1.0, ((mid[0] - cx) * (dx - cx) + (mid[1] - cy) * (dy - cy)) / wall_length ** 2))
        if math.hypot(mid[0] - cx - t * (dx - cx), mid[1] - cy - t * (dy - cy)) <= END_CAP_TOLERANCE_M:
            return True
    return False


def _rectangle_walls(walls: list[dict]) -> tuple[list[dict], list[dict]]:
    """Splits off closed four-corner right-angled outlines whose short side is a wall thickness, as centreline
    walls (marked paired, so T-ends still join); everything else is returned for face pairing."""
    rects, rest = [], []
    for wall in walls:
        pts = [tuple(p) for p in wall["points"]]
        if len(pts) == 5 and pts[0] == pts[-1]:
            pts = pts[:4]
        if len(pts) != 4:
            rest.append(wall); continue
        edges = [(pts[i], pts[(i + 1) % 4]) for i in range(4)]
        lengths = [math.dist(a, b) for a, b in edges]
        if min(lengths) == 0:
            rest.append(wall); continue
        square = all(abs((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) < 1e-6 * l1 * l2
                     for (a, b), (c, d), l1, l2 in zip(edges, edges[1:] + edges[:1], lengths, lengths[1:] + lengths[:1]))
        short, long_ = min(lengths[0], lengths[1]), max(lengths[0], lengths[1])
        if not square or not FACE_PAIR_MIN_GAP_M <= short <= FACE_PAIR_MAX_GAP_M or long_ < short:
            rest.append(wall); continue
        # The centreline runs along the long sides, through the middle of the short ones.
        i = 0 if lengths[0] >= lengths[1] else 1
        (a, b), (c, d) = edges[i + 1], edges[(i + 3) % 4]
        start = ((c[0] + d[0]) / 2, (c[1] + d[1]) / 2)
        end = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        rects.append({"points": [list(start), list(end)], "thickness_m": round(short, 6),
                      "height_m": DEFAULT_WALL_HEIGHT_M, "_paired": True})
    return rects, rest


def _pair_wall_faces(walls: list[dict]) -> list[dict]:
    """Real CAD plans draw a wall as its two face lines; merge each face pair into one centreline wall whose
    thickness is the gap. Lines without a partner stay as (default-thickness) centreline walls."""
    # A wall drawn as one closed rectangle is read whole: pairing its edges as loose faces could match an
    # edge with a neighbouring wall's edge and leave both walls partly missing.
    rect_walls, walls = _rectangle_walls(walls)
    segs = _segments(walls)
    bin_width = math.radians(FACE_PAIR_MAX_ANGLE_DEG)
    n_bins = round(math.pi / bin_width)
    bins: dict[int, list[int]] = {}
    for i, ((ax, ay), (bx, by)) in enumerate(segs):
        bins.setdefault(round((math.atan2(by - ay, bx - ax) % math.pi) / bin_width) % n_bins, []).append(i)

    candidates = []
    for b, members in bins.items():
        neighbours = members + bins.get((b + 1) % n_bins, [])
        for i in members:
            for j in neighbours:
                if j <= i and j in members:
                    continue
                match = _face_pair(segs[i], segs[j])
                if match:
                    gap, overlap, centreline = match
                    candidates.append((-overlap, gap, i, j, centreline))
    candidates.sort(key=lambda c: (c[0], c[1]))

    used, out = set(), list(rect_walls)
    for _, gap, i, j, centreline in candidates:
        if i in used or j in used:
            continue
        used.update((i, j))
        out.append({"points": centreline, "thickness_m": round(gap, 6), "height_m": DEFAULT_WALL_HEIGHT_M, "_paired": True})
    paired = list(out)
    out.extend({"points": [list(a), list(b)], "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M}
               for k, (a, b) in enumerate(segs) if k not in used and not _caps_a_wall((a, b), paired))
    _join_t_ends(out)
    for wall in out:
        wall.pop("_paired", None)
        wall["points"] = [[round(x, 6), round(y, 6)] for x, y in wall["points"]]
    return out


# How far a door/window symbol may sit from the gap it names before the gap is called a plain door.
OPENING_MARKER_RADIUS_M = 2.5


def _wall_gap_openings(walls: list[dict], markers: list[tuple[str, float, float]]) -> list[dict]:
    """Every empty doorway-sized gap becomes an opening; the nearest symbol on a DOOR/WINDOW layer names it.

    The gap also gets a wall of its own, as thick as the wall it interrupts: the opening sits in the middle
    of that wall, so the 3D cut leaves a lintel above every door and wall above and below every window.
    Without it the opening snapped to the end of the neighbouring wall and hung half in empty air."""
    openings = []
    for u, v, width in find_wall_gaps(walls):
        beside = next((w for w in walls if tuple(w["points"][0]) == u or tuple(w["points"][-1]) == u), None)
        walls.append({"points": [list(u), list(v)],
                      "thickness_m": beside["thickness_m"] if beside else DEFAULT_WALL_THICKNESS_M,
                      "height_m": beside["height_m"] if beside else DEFAULT_WALL_HEIGHT_M})
        cx, cy = round((u[0] + v[0]) / 2, 6), round((u[1] + v[1]) / 2, 6)
        kind, best = "door", OPENING_MARKER_RADIUS_M
        for marker_kind, mx, my in markers:
            distance = math.hypot(mx - cx, my - cy)
            if distance <= best:
                kind, best = marker_kind, distance
        openings.append({"type": kind, "bbox_center": [cx, cy], "width_m": round(width, 6)})
    return sorted(openings, key=lambda o: (o["bbox_center"][1], o["bbox_center"][0]))


def parse_dxf(path: str) -> dict:
    # recover tolerates the small structural defects many CAD exporters leave; readfile rejects the whole file.
    try:
        doc, _ = recover.readfile(path)
    except ezdxf.DXFStructureError as exc:
        raise ValueError(f"The DXF file is damaged or not a DXF drawing: {exc}") from exc
    raw: list[dict] = []
    markers: list[tuple[str, float, float]] = []
    _extract_from_space(doc.modelspace(), None, None, 1.0, raw, markers)
    if not raw:
        layers = sorted(layer.dxf.name for layer in doc.layers)
        raise NoWallsFoundError(
            f"No walls found: expected LINE/POLYLINE geometry on a layer containing one of "
            f"{WALL_LAYER_HINTS}; drawing layers are {layers}")
    scale = _metres_per_unit(doc, raw)
    in_metres = [dict(w, points=[[x * scale, y * scale] for x, y in w["points"]]) for w in raw]
    walls = _pair_wall_faces(in_metres)
    scaled_markers = [(kind, x * scale, y * scale) for kind, x, y in markers]
    openings = _wall_gap_openings(walls, scaled_markers)   # also adds the wall across each gap
    return {"walls": walls, "openings": openings}
