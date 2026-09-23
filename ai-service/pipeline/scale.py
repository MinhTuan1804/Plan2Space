"""Pixel -> project-space (metres) conversion for raster plans, calibrated from OCR'd dimension labels."""
import math
import re
import statistics

MAX_LABEL_DISTANCE_PX = 60.0
_NUMBER = re.compile(r"^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(mm|m)?$")


def parse_dimension_metres(text: str) -> float | None:
    """'3000' / '3,000' / '4500mm' -> millimetres; '3.6m' -> metres. Returns metres, or None if not a dimension."""
    match = _NUMBER.match(text.strip().lower().replace(" ", ""))
    if not match:
        return None
    number, unit = match.groups()
    value = float(number.replace(",", ""))
    if unit == "m":
        return value
    if unit == "mm" or value >= 100:
        return value / 1000.0
    return None   # a bare small number ("12") is a room tag or level, not a length


def _point_segment_distance(p, a, b) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length_sq))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def estimate_metres_per_pixel(walls_px: list[dict], dimensions: list[dict]) -> float | None:
    """Median of (label value / length of the wall segment nearest the label) over all usable labels."""
    candidates = []
    for dim in dimensions:
        metres = parse_dimension_metres(dim["text"])
        if metres is None:
            continue
        best = None
        for wall in walls_px:
            for a, b in zip(wall["points"][:-1], wall["points"][1:]):
                d = _point_segment_distance(dim["bbox_center"], a, b)
                length = math.hypot(b[0] - a[0], b[1] - a[1])
                if length > 0 and d <= MAX_LABEL_DISTANCE_PX and (best is None or d < best[0]):
                    best = (d, length)
        if best is not None:
            candidates.append(metres / best[1])
    return statistics.median(candidates) if candidates else None


def to_project_space(walls_px: list[dict], symbols_px: list[dict], metres_per_pixel: float,
                     image_height_px: int) -> tuple[list[dict], list[dict]]:
    """Scales to metres and flips y (image rows grow downward, plan y grows upward)."""
    def convert(x, y):
        return [round(x * metres_per_pixel, 6), round((image_height_px - y) * metres_per_pixel, 6)]

    walls = [dict(w, points=[convert(x, y) for x, y in w["points"]]) for w in walls_px]
    symbols = [dict(s, bbox_center=convert(*s["bbox_center"])) for s in symbols_px]
    return walls, symbols
