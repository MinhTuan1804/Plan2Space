import math
import uuid

MAX_SYMBOL_TO_WALL_M = 0.5
WINDOW_SILL_HEIGHT_M = 0.9


def _closest_point_on_segment(p, a, b) -> tuple[list[float], float]:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return [ax, ay], math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    closest = [ax + t * dx, ay + t * dy]
    return closest, math.hypot(px - closest[0], py - closest[1])


def serialize_pipeline_result(walls: list[dict], symbols: list[dict], default_opening_width_m: float = 0.9) -> dict:
    """Builds the geometry API's save body (Task 5 WallInput/RoomInput/OpeningInput, camelCase).

    Walls and symbols must already be in project-space metres. Each wall gets a fresh id so
    openings can reference it by WallId; an opening's position is projected onto its wall.
    """
    walls_out = [{
        "id": str(uuid.uuid4()),
        "points": [{"x": float(x), "y": float(y)} for x, y in w["points"]],
        "thicknessMeters": w["thickness_m"],
        "heightMeters": w["height_m"],
    } for w in walls]

    openings_out = []
    for symbol in symbols:
        best = None   # (distance, wall index, point on wall)
        for idx, wall in enumerate(walls):
            for a, b in zip(wall["points"][:-1], wall["points"][1:]):
                point, d = _closest_point_on_segment(symbol["bbox_center"], a, b)
                if best is None or d < best[0]:
                    best = (d, idx, point)
        if best is None or best[0] > MAX_SYMBOL_TO_WALL_M:
            continue
        _, idx, (x, y) = best
        openings_out.append({
            "wallId": walls_out[idx]["id"],
            "type": symbol["type"],
            "position": {"x": round(x, 6), "y": round(y, 6)},
            "widthMeters": default_opening_width_m,
            "sillHeightMeters": 0.0 if symbol["type"] == "door" else WINDOW_SILL_HEIGHT_M,
        })

    return {"walls": walls_out, "rooms": [], "openings": openings_out}
