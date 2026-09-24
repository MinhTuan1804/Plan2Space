"""Helpers for GeometryDto-shaped plans (the API's GET /geometry payload) shared by the exporters and BOQ."""
import math

DOOR_HEIGHT_M = 2.1      # same as the Studio viewer's cutters (cutOpenings.ts)
WINDOW_HEIGHT_M = 1.2


class ExportInputError(ValueError):
    """The plan/request can't be exported (no walls, unknown format) — a client error, unlike library failures."""


Point = tuple[float, float]
Segment = tuple[Point, Point]


def xy(p) -> Point:
    # Accepts the API's {"x", "y"} objects as well as [x, y] pairs.
    return (float(p["x"]), float(p["y"])) if isinstance(p, dict) else (float(p[0]), float(p[1]))


def wall_segments(wall: dict) -> list[Segment]:
    points = [xy(p) for p in wall["points"]]
    return [(a, b) for a, b in zip(points, points[1:]) if a != b]


def segment_length(segment: Segment) -> float:
    (ax, ay), (bx, by) = segment
    return math.hypot(bx - ax, by - ay)


def nearest_segment(segments: list[Segment], p: Point) -> Segment:
    def distance(seg: Segment) -> float:
        (ax, ay), (bx, by) = seg
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
    return min(segments, key=distance)


def opening_height(opening: dict) -> float:
    return DOOR_HEIGHT_M if str(opening["type"]).lower() == "door" else WINDOW_HEIGHT_M


def openings_of(geometry: dict, wall: dict) -> list[dict]:
    return [o for o in geometry.get("openings", []) if o.get("wallId") == wall.get("id")]
