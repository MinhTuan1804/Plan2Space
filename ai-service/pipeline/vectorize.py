import logging
import math
import os

import cv2
import numpy as np
from PIL import Image
from skimage.measure import approximate_polygon
from skimage.morphology import skeletonize

from pipeline.geometry_finalizer import finalize_wall_geometry

logger = logging.getLogger(__name__)

DEFAULT_WALL_THICKNESS_M = 0.2
DEFAULT_WALL_HEIGHT_M = 2.8
SIMPLIFY_TOLERANCE_PX = 2.0
MERGE_DISTANCE_PX = 3.0
MERGE_ANGLE_DEG = 5.0
MIN_SEGMENT_PX = 5.0

Segment = tuple[tuple[float, float], tuple[float, float]]


def _threshold_fallback(gray: np.ndarray) -> np.ndarray:
    """Deterministic non-ML wall mask used in tests and as a graceful degrade
    path when model weights are unavailable: dark pixels = wall."""
    return (gray < 128).astype(np.uint8)


def _mask_to_segments(mask: np.ndarray) -> list[Segment]:
    # Contours of a 1px skeleton trace both sides of every line, so each wall appears 2+ times;
    # split contours into straight segments here and merge the duplicates afterwards.
    skeleton = skeletonize(mask.astype(bool)).astype(np.uint8)
    contours, _ = cv2.findContours(skeleton, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    segments = []
    for contour in contours:
        pts = contour.reshape(-1, 2).astype(float)
        if len(pts) < 2:
            continue
        pts = np.vstack([pts, pts[:1]])   # contours are closed loops
        simplified = approximate_polygon(pts, tolerance=SIMPLIFY_TOLERANCE_PX)
        for a, b in zip(simplified[:-1], simplified[1:]):
            segments.append(((float(a[0]), float(a[1])), (float(b[0]), float(b[1]))))
    return segments


def _try_merge(s: Segment, t: Segment) -> Segment | None:
    """Union of two segments if they lie on the same line (within tolerance) and overlap or touch."""
    (ax, ay), (bx, by) = s
    length = math.hypot(bx - ax, by - ay)
    if length == 0:
        return None
    ux, uy = (bx - ax) / length, (by - ay) / length
    (cx, cy), (dx, dy) = t
    t_len = math.hypot(dx - cx, dy - cy)
    if t_len == 0:
        return None
    cos_angle = abs(ux * (dx - cx) / t_len + uy * (dy - cy) / t_len)
    if cos_angle < math.cos(math.radians(MERGE_ANGLE_DEG)):
        return None
    for px, py in ((cx, cy), (dx, dy)):
        if abs(-uy * (px - ax) + ux * (py - ay)) > MERGE_DISTANCE_PX:
            return None
    proj = lambda px, py: ux * (px - ax) + uy * (py - ay)
    t0, t1 = sorted((proj(cx, cy), proj(dx, dy)))
    if t0 > length + MERGE_DISTANCE_PX or t1 < -MERGE_DISTANCE_PX:
        return None
    lo, hi = min(0.0, t0), max(length, t1)
    return (ax + ux * lo, ay + uy * lo), (ax + ux * hi, ay + uy * hi)


def _merge_collinear(segments: list[Segment]) -> list[Segment]:
    merged = list(segments)
    changed = True
    while changed:
        changed = False
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                union = _try_merge(merged[i], merged[j])
                if union is not None:
                    merged[i] = union
                    del merged[j]
                    changed = True
                    break
            if changed:
                break
    return [s for s in merged if math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) >= MIN_SEGMENT_PX]


def vectorize_raster(image_path: str, use_model: bool = True, checkpoint_path: str | None = None) -> dict:
    """Returns walls in PIXEL coordinates (image y-down); scaling to metres happens in the serializer."""
    gray = np.array(Image.open(image_path).convert("L"))

    checkpoint_path = checkpoint_path or os.environ.get("P2S_VIT_CHECKPOINT")
    if use_model and checkpoint_path:
        from models.vit_wall_segmenter import ViTWallSegmenter
        heatmap = ViTWallSegmenter(checkpoint_path).predict_heatmap(gray)
        mask = (heatmap > 0.5).astype(np.uint8)
    else:
        if use_model:
            logger.warning("No ViT checkpoint configured (P2S_VIT_CHECKPOINT); using threshold wall mask")
        mask = _threshold_fallback(gray)

    segments = _merge_collinear(_mask_to_segments(mask))
    finalized = finalize_wall_geometry([[a, b] for a, b in segments])

    walls = [
        {"points": [[p[0], p[1]] for p in line], "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M}
        for line in finalized if len(line) >= 2
    ]
    return {"walls": walls, "openings": []}
