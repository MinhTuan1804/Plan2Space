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


def parse_dxf(path: str) -> dict:
    doc = ezdxf.readfile(path)
    scale = INSUNITS_TO_METRES.get(doc.header.get("$INSUNITS", 0), 1.0)
    walls: list[dict] = []
    _extract_from_space(doc.modelspace(), None, None, scale, walls)
    if not walls:
        layers = sorted(layer.dxf.name for layer in doc.layers)
        raise NoWallsFoundError(
            f"No walls found: expected LINE/POLYLINE geometry on a layer containing one of "
            f"{WALL_LAYER_HINTS}; drawing layers are {layers}")
    return {"walls": walls, "openings": []}
