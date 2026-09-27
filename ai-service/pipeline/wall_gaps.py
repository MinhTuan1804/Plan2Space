"""Doorways seen from the wall graph.

A real architectural plan breaks the wall where a door or window sits, so the gap between two
collinear wall ends *is* the opening: it gives the position and the width. The same gaps must be
bridged before rooms can be polygonized, otherwise every loop is broken by a doorway.
"""
import math

# A gap in a wall wider than this is a missing wall, not a doorway.
MAX_OPENING_WIDTH_M = 3.5   # a garage door; wider gaps are missing walls
# Narrower than the slimmest real door leaf: a gap this small is the wall's own thickness at a junction.
MIN_OPENING_WIDTH_M = 0.4
COLLINEAR_ANGLE_DEG = 3.0
ACROSS_TOLERANCE_M = 0.05
# Walls shorter than this are piers or stubs (a drawn square has no long side).
STUB_LENGTH_M = 0.5
# A wall at more than 30 degrees to a gap runs across it.
CROSSING_SIN = math.sin(math.radians(30))
# How far off the wall's line the far end of a gap may sit: a wall half-thickness.
MAX_GAP_OFFSET_M = 0.15


def _direction(wall: dict) -> tuple[float, float]:
    (ax, ay), (bx, by) = wall["points"][0], wall["points"][-1]
    length = math.hypot(bx - ax, by - ay) or 1.0
    return (bx - ax) / length, (by - ay) / length


def _parallel(u: tuple[float, float], v: tuple[float, float]) -> bool:
    return abs(u[0] * v[0] + u[1] * v[1]) >= math.cos(math.radians(COLLINEAR_ANGLE_DEG))


def find_wall_gaps(walls: list[dict], keep_crossing=None) -> list[tuple[tuple[float, float], tuple[float, float], float]]:
    """Returns (end, other end, width) for every empty collinear gap narrow enough to be a doorway.

    Two walls that both end on walls running across the gap (the cross walls of a corridor, meeting it
    from either side) line up like doorway jambs but are not one: bridging them cuts the corridor in two.
    Such a gap is kept only when keep_crossing(u, v, width) says so (a door is drawn in it)."""
    segments = [(tuple(wall["points"][i]), tuple(wall["points"][i + 1]))
                for wall in walls for i in range(len(wall["points"]) - 1)]

    def _distance_to_segment(p, a, b) -> float:
        dx, dy = b[0] - a[0], b[1] - a[1]
        length_sq = dx * dx + dy * dy
        if length_sq == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length_sq))
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)

    def is_empty(u, v, width) -> bool:
        # Checking the ends alone is not enough: drawings overlap wall segments, so a gap can sit
        # inside another wall's body without any end falling in it. Sample the gap instead.
        for t in (0.25, 0.5, 0.75):
            point = (u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t)
            if any(_distance_to_segment(point, a, b) <= ACROSS_TOLERANCE_M for a, b in segments):
                return False
        return True

    def lands_across(end, other_end) -> bool:
        """The end meets a wall running across the gap (a T or a corner), not stopping free like a jamb."""
        gx, gy = other_end[0] - end[0], other_end[1] - end[1]
        glen = math.hypot(gx, gy) or 1.0
        for a, b in segments:
            sx, sy = b[0] - a[0], b[1] - a[1]
            slen = math.hypot(sx, sy) or 1.0
            if abs(gx * sy - gy * sx) / (glen * slen) > CROSSING_SIN and _distance_to_segment(end, a, b) <= ACROSS_TOLERANCE_M:
                return True
        return False

    def length(wall) -> float:
        (ax, ay), (bx, by) = wall["points"][0], wall["points"][-1]
        return math.hypot(bx - ax, by - ay)

    best: dict[tuple[float, float], tuple[tuple[float, float], tuple[float, float], float]] = {}
    for i, wall in enumerate(walls):
        for other in walls[i + 1:]:
            # A pier or stub about as long as it is thick has no real direction: take the other wall's.
            short_wall, short_other = length(wall) < STUB_LENGTH_M, length(other) < STUB_LENGTH_M
            runs = other if short_wall else wall          # the one that has a real direction
            direction = _direction(runs)
            if not (short_wall or short_other or _parallel(direction, _direction(other))):
                continue
            # A pier's end sits off the wall's line (its centreline crosses the wall); put the gap on
            # the line of the wall it interrupts, or the doorway comes out skewed.
            base = runs["points"][0]

            def on_line(p):
                t = (p[0] - base[0]) * direction[0] + (p[1] - base[1]) * direction[1]
                return (base[0] + direction[0] * t, base[1] + direction[1] * t)
            for u in (wall["points"][0], wall["points"][-1]):
                for v in (other["points"][0], other["points"][-1]):
                    u, v = tuple(u), tuple(v)
                    if abs(direction[0] * (v[1] - u[1]) - direction[1] * (v[0] - u[0])) > MAX_GAP_OFFSET_M:
                        continue    # see below; checked here too so the projection cannot hide a corner
                    u, v = on_line(u), on_line(v)
                    width = math.hypot(v[0] - u[0], v[1] - u[1])
                    if not MIN_OPENING_WIDTH_M <= width <= MAX_OPENING_WIDTH_M:
                        continue
                    # The gap must run along the wall, not across a corner and not off at a slight
                    # angle: over a 4 m gap three degrees is 20 cm sideways, enough to cut a room in two.
                    if abs(direction[0] * (v[1] - u[1]) - direction[1] * (v[0] - u[0])) > MAX_GAP_OFFSET_M:
                        continue
                    if not is_empty(u, v, width):
                        continue
                    if lands_across(u, v) and lands_across(v, u) and not (keep_crossing and keep_crossing(u, v, width)):
                        continue
                    centre = (round((u[0] + v[0]) / 2, 3), round((u[1] + v[1]) / 2, 3))
                    if width < best.get(centre, (None, None, math.inf))[2]:
                        best[centre] = (u, v, width)
    return one_gap_per_side(list(best.values()))


def one_gap_per_side(gaps):
    """A wall end bounds one doorway on each side: a stub further along would otherwise add a wider phantom
    gap overlapping the real one, so the narrowest gap at each end and side wins. A short pier's two ends meet on the wall line at one point and it stands between two
    openings, one either side. Same side = the gaps leave the end in directions less than 90° apart."""
    kept, used = [], {}
    for u, v, width in sorted(gaps, key=lambda g: g[2]):
        ends = ((u, (v[0] - u[0], v[1] - u[1])), (v, (u[0] - v[0], u[1] - v[1])))
        if any(d[0] * e[0] + d[1] * e[1] > 0 for end, d in ends for e in used.get(end, [])):
            continue
        for end, d in ends:
            used.setdefault(end, []).append(d)
        kept.append((u, v, width))
    return kept


def point_segment_distance(p, a, b) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length_sq))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
