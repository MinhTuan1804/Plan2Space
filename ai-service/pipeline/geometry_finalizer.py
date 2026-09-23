from shapely.geometry import LineString, Polygon
from shapely.validation import make_valid

Point2 = tuple[float, float]


def _dedupe_consecutive(points: list[Point2]) -> list[Point2]:
    out = [points[0]]
    for p in points[1:]:
        if p != out[-1]:
            out.append(p)
    return out


def _largest_polygon(geometry) -> Polygon | None:
    candidates = [g for g in getattr(geometry, "geoms", [geometry]) if isinstance(g, Polygon) and g.area > 0]
    # make_valid may nest MultiPolygons inside a GeometryCollection.
    for g in getattr(geometry, "geoms", []):
        candidates.extend(p for p in getattr(g, "geoms", []) if isinstance(p, Polygon) and p.area > 0)
    return max(candidates, key=lambda g: g.area, default=None)


def _finalize_loop(points: list[Point2]) -> list[Point2] | None:
    if points[0] != points[-1]:
        points = points + [points[0]]
    if len(set(points)) < 3:
        return None
    polygon = Polygon(points)
    if polygon.is_valid and polygon.area > 0:
        return points
    # Self-intersecting outline (e.g. a bowtie from a missed wall): keep the largest valid piece
    # rather than handing an invalid polygon to the geometry API / PostGIS.
    repaired = _largest_polygon(make_valid(polygon))
    return None if repaired is None else [(float(x), float(y)) for x, y in repaired.exterior.coords]


def finalize_wall_geometry(raw_polylines: list[list[Point2]], close_loops: bool = False) -> list[list[Point2]]:
    """Cleans vectorized polylines: drops degenerate ones; with close_loops, closes and repairs room outlines.

    Degenerate inputs are dropped, so the output can be shorter than the input.
    """
    finalized = []
    for raw in raw_polylines:
        if not raw:
            continue
        points = _dedupe_consecutive([(float(x), float(y)) for x, y in raw])
        if close_loops:
            loop = _finalize_loop(points)
            if loop is not None:
                finalized.append(loop)
        elif len(points) >= 2 and LineString(points).is_valid:
            finalized.append(points)
    return finalized
