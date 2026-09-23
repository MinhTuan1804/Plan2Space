import math

import numpy as np
import trimesh
from trimesh import transformations as tf

DOOR_HEIGHT_M = 2.1      # same as the Studio viewer's cutters (cutOpenings.ts)
WINDOW_HEIGHT_M = 1.2
CONTENT_TYPES = {"gltf": "model/gltf+json", "glb": "model/gltf-binary", "obj": "model/obj"}
# Project space is Z-up (plan XY + height Z); glTF and most OBJ consumers are Y-up.
Z_UP_TO_Y_UP = tf.rotation_matrix(-math.pi / 2, [1, 0, 0])


def _xy(p) -> tuple[float, float]:
    # Accepts the API's GeometryDto points ({"x", "y"}) as well as [x, y] pairs.
    return (float(p["x"]), float(p["y"])) if isinstance(p, dict) else (float(p[0]), float(p[1]))


def _box_along(a, b, width_across: float, height: float, z0: float = 0.0, length: float | None = None, centre=None):
    (ax, ay), (bx, by) = a, b
    angle = math.atan2(by - ay, bx - ax)
    length = math.hypot(bx - ax, by - ay) if length is None else length
    cx, cy = centre if centre is not None else ((ax + bx) / 2, (ay + by) / 2)
    box = trimesh.creation.box(extents=[length, width_across, height])
    box.apply_transform(tf.rotation_matrix(angle, [0, 0, 1]))
    box.apply_translation([cx, cy, z0 + height / 2])
    return box


def _nearest_segment(segments, p):
    def distance(seg):
        (ax, ay), (bx, by) = seg
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
    return min(segments, key=distance)


def _wall_mesh(wall: dict, openings: list[dict]) -> trimesh.Trimesh | None:
    points = [_xy(p) for p in wall["points"]]
    segments = [(a, b) for a, b in zip(points, points[1:]) if a != b]
    if not segments:
        return None
    thickness, height = float(wall["thicknessMeters"]), float(wall["heightMeters"])
    # Every segment of a polyline wall (not just first→last point); union so corners are one solid.
    boxes = [_box_along(a, b, thickness, height) for a, b in segments]
    mesh = boxes[0] if len(boxes) == 1 else trimesh.boolean.union(boxes, engine="manifold")

    cutters = []
    for o in openings:
        centre = _xy(o["position"])
        a, b = _nearest_segment(segments, centre)
        cut_height = DOOR_HEIGHT_M if str(o["type"]).lower() == "door" else WINDOW_HEIGHT_M
        cutters.append(_box_along(a, b, thickness * 2, cut_height, z0=float(o["sillHeightMeters"]),
                                  length=float(o["widthMeters"]), centre=centre))
    if cutters:
        mesh = trimesh.boolean.difference([mesh, *cutters], engine="manifold")
    return mesh


def build_mesh_from_geometry(geometry: dict) -> trimesh.Trimesh:
    """Z-up mesh of all walls with their door/window openings cut out (mirrors the Studio 3D viewer)."""
    openings = geometry.get("openings", [])
    meshes = [m for m in (
        _wall_mesh(w, [o for o in openings if o.get("wallId") == w.get("id")]) for w in geometry.get("walls", [])
    ) if m is not None]
    if not meshes:
        raise ValueError("The plan has no walls — nothing to export")
    return meshes[0] if len(meshes) == 1 else trimesh.util.concatenate(meshes)


def export_mesh(mesh: trimesh.Trimesh, fmt: str) -> bytes:
    if fmt not in CONTENT_TYPES:
        raise ValueError(f"Unsupported export format: {fmt} (use gltf, glb or obj)")
    y_up = mesh.copy()
    y_up.apply_transform(Z_UP_TO_Y_UP)
    if fmt == "gltf":
        # Single self-contained .gltf (buffers embedded as data URIs) instead of .gltf + .bin files.
        files = trimesh.exchange.gltf.export_gltf(trimesh.Scene(y_up), embed_buffers=True)
        return files["model.gltf"]
    exported = y_up.export(file_type=fmt)
    return exported if isinstance(exported, bytes) else exported.encode("utf-8")
