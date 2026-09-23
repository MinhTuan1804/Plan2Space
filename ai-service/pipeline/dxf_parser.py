import math

import ezdxf
from ezdxf.math import Matrix44

DEFAULT_WALL_THICKNESS_M = 0.2
DEFAULT_WALL_HEIGHT_M = 2.8
# Substring match: covers WALL, WALLS, A-WALL, A-WALL-EXT… plus the Vietnamese "TUONG" (tường).
WALL_LAYER_HINTS = ("WALL", "TUONG")
WALL_ENTITY_TYPES = ("LWPOLYLINE", "POLYLINE", "LINE")
# $INSUNITS code -> metres. 0 (unitless) is treated as metres.
INSUNITS_TO_METRES = {0: 1.0, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}


class NoWallsFoundError(ValueError):
    """The drawing has no geometry on a wall-like layer; surfaced to the user instead of an empty plan."""


def _is_wall_layer(layer_name: str) -> bool:
    upper = layer_name.upper()
    return any(hint in upper for hint in WALL_LAYER_HINTS)


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
    else:  # 2D POLYLINE
        points = [(v.x, v.y) for v in entity.points()]
    if entity.closed and points and points[0] != points[-1]:
        points.append(points[0])
    return points


def _extract_from_space(space, transform: Matrix44 | None, inherited_layer: str | None,
                        scale: float, walls: list[dict]) -> None:
    for entity in space:
        kind = entity.dxftype()
        layer = _effective_layer(entity, inherited_layer)
        if kind == "INSERT":
            # ezdxf matrices use row vectors: apply the insert's own transform first, then the parent's.
            insert_transform = entity.matrix44()
            combined = insert_transform if transform is None else insert_transform @ transform
            _extract_from_space(entity.block(), combined, layer, scale, walls)
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


def _pair_wall_faces(walls: list[dict]) -> list[dict]:
    """Real CAD plans draw a wall as its two face lines; merge each face pair into one centreline wall whose
    thickness is the gap. Lines without a partner stay as (default-thickness) centreline walls."""
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

    used, out = set(), []
    for _, gap, i, j, centreline in candidates:
        if i in used or j in used:
            continue
        used.update((i, j))
        out.append({"points": centreline, "thickness_m": round(gap, 6), "height_m": DEFAULT_WALL_HEIGHT_M, "_paired": True})
    out.extend({"points": [list(a), list(b)], "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M}
               for k, (a, b) in enumerate(segs) if k not in used)
    _join_t_ends(out)
    for wall in out:
        wall.pop("_paired", None)
        wall["points"] = [[round(x, 6), round(y, 6)] for x, y in wall["points"]]
    return out


def parse_dxf(path: str) -> dict:
    doc = ezdxf.readfile(path)
    raw: list[dict] = []
    _extract_from_space(doc.modelspace(), None, None, 1.0, raw)
    if not raw:
        layers = sorted(layer.dxf.name for layer in doc.layers)
        raise NoWallsFoundError(
            f"No walls found: expected LINE/POLYLINE geometry on a layer containing one of "
            f"{WALL_LAYER_HINTS}; drawing layers are {layers}")
    scale = _metres_per_unit(doc, raw)
    in_metres = [dict(w, points=[[x * scale, y * scale] for x, y in w["points"]]) for w in raw]
    return {"walls": _pair_wall_faces(in_metres), "openings": []}
