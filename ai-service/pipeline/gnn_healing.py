import math


def _distance(a: list[float], b: list[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _find(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def _project_onto_segment(p: list[float], a: list[float], b: list[float]) -> tuple[list[float], float]:
    """Closest point to p on segment ab, and its parameter t in [0, 1]."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return list(a), 0.0
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length_sq))
    return [a[0] + t * dx, a[1] + t * dy], t


def heal_wall_topology(walls: list[dict], snap_tolerance_m: float = 0.05) -> list[dict]:
    """Deterministic geometric snap of near-miss endpoints into shared junctions.

    Endpoints within tolerance of each other are clustered and moved to the cluster centroid
    (so 3+ walls meeting at a corner all share one point); an endpoint left alone that lies
    within tolerance of another wall's interior is projected onto it (T-junction).
    Tolerance is in the same units as the points. A trained WallEndpointGNN
    (models/wall_graph_gnn.py) can replace the fixed tolerance with a learned per-edge
    probability once checkpoints exist; the function signature and output shape stay the same.
    """
    healed = [dict(w, points=[list(map(float, p)) for p in w["points"]]) for w in walls]

    endpoints = []
    for wi, wall in enumerate(healed):
        endpoints.append((wi, 0))
        endpoints.append((wi, len(wall["points"]) - 1))
    coords = [healed[wi]["points"][idx] for wi, idx in endpoints]

    parent = list(range(len(endpoints)))
    for i in range(len(endpoints)):
        for j in range(i + 1, len(endpoints)):
            if endpoints[i][0] != endpoints[j][0] and _distance(coords[i], coords[j]) <= snap_tolerance_m:
                parent[_find(parent, i)] = _find(parent, j)

    clusters: dict[int, list[int]] = {}
    for i in range(len(endpoints)):
        clusters.setdefault(_find(parent, i), []).append(i)

    for members in clusters.values():
        if len(members) < 2:
            continue
        centroid = [sum(coords[m][0] for m in members) / len(members),
                    sum(coords[m][1] for m in members) / len(members)]
        for m in members:
            wi, idx = endpoints[m]
            healed[wi]["points"][idx] = list(centroid)

    # T-junctions: a lone endpoint just short of (or past) another wall's interior.
    for members in clusters.values():
        if len(members) != 1:
            continue
        wi, idx = endpoints[members[0]]
        p = healed[wi]["points"][idx]
        best = None
        for wj, other in enumerate(healed):
            if wj == wi:
                continue
            for a, b in zip(other["points"][:-1], other["points"][1:]):
                q, t = _project_onto_segment(p, a, b)
                d = _distance(p, q)
                if 0.0 < t < 1.0 and d <= snap_tolerance_m and (best is None or d < best[0]):
                    best = (d, q)
        if best is not None:
            healed[wi]["points"][idx] = best[1]

    # Clusters chain, so a wall shorter than the tolerance can get both ends snapped onto one point.
    # A zero-length wall has no geometry to draw (the 3D view crashed on it); drop it.
    return [w for w in healed if any(p != w["points"][0] for p in w["points"][1:])]
