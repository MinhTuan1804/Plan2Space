import math
import unicodedata

from shapely import affinity
from shapely.geometry import Point, Polygon, box

FURNITURE_CATALOG = {
    "Bedroom": [
        {"item": "bed", "width_m": 1.6, "depth_m": 2.0},
        {"item": "nightstand", "width_m": 0.5, "depth_m": 0.4},
        {"item": "wardrobe", "width_m": 1.2, "depth_m": 0.6},
    ],
    "Living Room": [
        {"item": "sofa", "width_m": 2.0, "depth_m": 0.9},
        {"item": "coffee_table", "width_m": 1.0, "depth_m": 0.5},
        {"item": "tv_stand", "width_m": 1.5, "depth_m": 0.4},
    ],
}
# Keywords on the accent-stripped, lower-cased label (English + Vietnamese: "phòng ngủ", "phòng khách").
LABEL_KEYWORDS = [("Bedroom", ("bed", "ngu")), ("Living Room", ("living", "lounge", "khach"))]
DEFAULT_CATALOG = "Living Room"

MARGIN_M = 0.1
STEP_M = 0.2


def _normalise(label: str) -> str:
    stripped = unicodedata.normalize("NFD", label.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in stripped if unicodedata.category(c) != "Mn").lower()


def catalog_for(room_label: str) -> list[dict]:
    label = _normalise(room_label)
    for name, keywords in LABEL_KEYWORDS:
        if any(k in label for k in keywords):
            return FURNITURE_CATALOG[name]
    return FURNITURE_CATALOG[DEFAULT_CATALOG]


# Room polygons run along wall centrelines: half a wall plus a finger's gap keeps an item off the wall.
WALL_CLEARANCE_M = 0.12
EDGE_STEP_M = 0.1


def _footprint(x: float, y: float, w: float, d: float, rotation_deg: float):
    return affinity.rotate(box(x - w / 2, y - d / 2, x + w / 2, y + d / 2), rotation_deg, origin=(x, y))


def _fits(candidate, room_poly, placed_boxes, keep_clear_zones) -> bool:
    return (room_poly.contains(candidate)
            and all(candidate.intersection(b).area < 1e-6 for b in placed_boxes)
            and not any(candidate.intersects(z) for z in keep_clear_zones))


def _against_wall(room_poly, w, d, placed_boxes, zones):
    """Back to an edge, front (local -y) facing into the room; longest edges first, sliding along each."""
    coords = list(room_poly.exterior.coords)
    edges = sorted(zip(coords[:-1], coords[1:]), key=lambda e: -math.dist(e[0], e[1]))
    for (ax, ay), (bx, by) in edges:
        length = math.dist((ax, ay), (bx, by))
        if length < w + 2 * MARGIN_M:
            continue
        ux, uy = (bx - ax) / length, (by - ay) / length
        nx, ny = -uy, ux
        if not room_poly.contains(Point((ax + bx) / 2 + nx * 0.05, (ay + by) / 2 + ny * 0.05)):
            nx, ny = -nx, -ny
        rotation = math.degrees(math.atan2(nx, -ny))
        offset = WALL_CLEARANCE_M + d / 2
        s = MARGIN_M + w / 2
        while s <= length - MARGIN_M - w / 2 + 1e-9:
            x, y = ax + ux * s + nx * offset, ay + uy * s + ny * offset
            candidate = _footprint(x, y, w, d, rotation)
            if _fits(candidate, room_poly, placed_boxes, zones):
                return x, y, rotation, candidate
            s += EDGE_STEP_M
    return None


def _on_grid(room_poly, w, d, placed_boxes, zones):
    """Unrotated, trying spots nearest the room's middle first."""
    minx, miny, maxx, maxy = room_poly.bounds
    centre = room_poly.representative_point()
    spots = []
    y = miny + d / 2 + MARGIN_M
    while y + d / 2 + MARGIN_M <= maxy:
        x = minx + w / 2 + MARGIN_M
        while x + w / 2 + MARGIN_M <= maxx:
            spots.append((x, y))
            x += STEP_M
        y += STEP_M
    for x, y in sorted(spots, key=lambda s: math.dist(s, (centre.x, centre.y))):
        candidate = _footprint(x, y, w, d, 0.0)
        if _fits(candidate, room_poly, placed_boxes, zones):
            return x, y, 0.0, candidate
    return None


def suggest_layout(room_polygon: list[list[float]], room_label: str,
                   items: list[dict] | None = None, keep_clear: list[list[float]] | None = None) -> list[dict]:
    """Places each item inside the room without overlap and outside the keep-clear zones (in front of doors).
    Against-wall items go back-to-edge facing in; the rest go nearest the middle. Items that fit nowhere are
    skipped. Without `items`, the built-in catalog for the room label is used."""
    if len({tuple(p) for p in room_polygon}) < 3:
        raise ValueError("A room polygon needs at least 3 distinct points")
    room_poly = Polygon(room_polygon)
    if not room_poly.is_valid or room_poly.area <= 0:
        raise ValueError("Room polygon is invalid (self-intersecting or zero area)")
    zones = [Point(x, y).buffer(r) for x, y, r in (keep_clear or [])]
    wanted = items if items is not None else [dict(f, against_wall=False) for f in catalog_for(room_label)]

    placed_boxes, results = [], []
    for furniture in wanted:
        w, d = furniture["width_m"], furniture["depth_m"]
        spot = (_against_wall(room_poly, w, d, placed_boxes, zones) if furniture.get("against_wall") else None)             or _on_grid(room_poly, w, d, placed_boxes, zones)
        if spot is None:
            continue
        x, y, rotation, candidate = spot
        placed_boxes.append(candidate)
        results.append({"item": furniture["item"], "position": [round(x, 6), round(y, 6)],
                        "rotation_deg": round(rotation, 6), "width_m": w, "depth_m": d})
    return results
