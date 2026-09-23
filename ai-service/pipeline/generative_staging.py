import unicodedata

from shapely.geometry import Polygon, box

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


def suggest_layout(room_polygon: list[list[float]], room_label: str) -> list[dict]:
    """Greedy grid placement: each catalog item goes to the first spot fully inside the room polygon
    that doesn't overlap an already placed item. Items that fit nowhere are skipped."""
    if len({tuple(p) for p in room_polygon}) < 3:
        raise ValueError("A room polygon needs at least 3 distinct points")
    room_poly = Polygon(room_polygon)
    if not room_poly.is_valid or room_poly.area <= 0:
        raise ValueError("Room polygon is invalid (self-intersecting or zero area)")
    minx, miny, maxx, maxy = room_poly.bounds

    placed_boxes = []
    results = []
    for furniture in catalog_for(room_label):
        w, d = furniture["width_m"], furniture["depth_m"]
        placed = False
        y = miny + d / 2 + MARGIN_M
        while y + d / 2 + MARGIN_M <= maxy and not placed:
            x = minx + w / 2 + MARGIN_M
            while x + w / 2 + MARGIN_M <= maxx and not placed:
                candidate = box(x - w / 2, y - d / 2, x + w / 2, y + d / 2)
                if room_poly.contains(candidate) and all(candidate.intersection(b).area < 1e-6 for b in placed_boxes):
                    placed_boxes.append(candidate)
                    results.append({"item": furniture["item"], "position": [round(x, 6), round(y, 6)],
                                    "rotation_deg": 0.0, "width_m": w, "depth_m": d})
                    placed = True
                x += STEP_M
            y += STEP_M

    return results
