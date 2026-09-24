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
# Beyond this many skeleton fragments a scan is mostly hatching/text noise; fail fast with a clear message.
MAX_SEGMENTS = 50_000
PAIRWISE_CLEANUP_LIMIT = 400
MIN_COMPONENT_PX = 20
MIN_COMPONENT_FRACTION = 0.02
# Walls in a drawn plan are solid strokes several pixels wide; furniture, hatching and text are hairlines.
# An opening sized from the drawing's own stroke widths erases the hairlines and keeps the walls.
MIN_WALL_HALF_WIDTH_PX = 2.5    # below this a stroke is a hairline, not a wall (two-line walls stay untouched)
MIN_WALL_CENTRELINE_PX = 20     # fewer wall-thick centreline pixels than this: the drawing has no solid walls
# The kernel follows the THINNEST walls, not the thickest: 110 mm partitions sit beside 220 mm outer walls.
THINNEST_WALL_PERCENTILE = 10
MIN_KEPT_FRACTION = 0.15        # keeping less than this means the filter ate the walls: undo it


class VectorizationTooComplexError(ValueError):
    """The raster produced too many line fragments to vectorize in reasonable time."""

Segment = tuple[tuple[float, float], tuple[float, float]]


def _threshold_fallback(gray: np.ndarray) -> np.ndarray:
    """Deterministic non-ML wall mask used in tests and as a graceful degrade
    path when model weights are unavailable: dark pixels = wall."""
    return (gray < 128).astype(np.uint8)


def keep_thick_strokes(mask: np.ndarray) -> np.ndarray:
    """Removes hairlines (furniture, hatching, text) and keeps solid wall strokes.

    The kernel comes from the image's own stroke widths, and the unfiltered mask is returned whenever
    filtering would not help: no thick strokes at all, or so little left that the walls went with it.
    """
    mask = mask.astype(np.uint8)
    if not mask.any():
        return mask
    # Half-width of every stroke, read along its centreline so each stroke counts by length, not by area.
    ridge = cv2.distanceTransform(mask, cv2.DIST_L2, 3)[skeletonize(mask.astype(bool))]
    wall_ridge = ridge[ridge >= MIN_WALL_HALF_WIDTH_PX]
    if wall_ridge.size < MIN_WALL_CENTRELINE_PX:
        return mask
    thinnest_wall = float(np.percentile(wall_ridge, THINNEST_WALL_PERCENTILE))
    # An opening removes strokes narrower than its kernel: stay just under the thinnest wall's width.
    size = max(3, int(2 * thinnest_wall - 1) | 1)
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((size, size), np.uint8))
    if opened.sum() < MIN_KEPT_FRACTION * mask.sum():
        return mask
    return opened


def _drop_small_components(mask: np.ndarray) -> np.ndarray:
    """Removes text glyphs, dimension ticks and specks: each is a small connected blob, whereas walls
    join into large components. Without a trained segmenter this is what keeps labels out of the walls."""
    min_extent = max(MIN_COMPONENT_PX, MIN_COMPONENT_FRACTION * max(mask.shape))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.zeros(count, dtype=bool)
    keep[1:] = np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) >= min_extent
    return keep[labels].astype(np.uint8)


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


def _merge_pairwise(segments: list[Segment]) -> list[Segment]:
    """Exact pairwise union (restarts after each merge, so only for small inputs)."""
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
    return merged


def _merge_by_line(segments: list[Segment]) -> list[Segment]:
    """Near-linear merge: bucket segments by direction, cluster by offset from the origin along the bucket's
    normal, then sweep each cluster's intervals along the direction, joining overlaps and small gaps."""
    bin_width = math.radians(MERGE_ANGLE_DEG)
    n_bins = round(math.pi / bin_width)
    buckets: dict[int, list[Segment]] = {}
    for seg in segments:
        (ax, ay), (bx, by) = seg
        if ax == bx and ay == by:
            continue
        theta = math.atan2(by - ay, bx - ax) % math.pi
        buckets.setdefault(round(theta / bin_width) % n_bins, []).append(seg)

    merged: list[Segment] = []
    for bin_index, segs in buckets.items():
        theta = bin_index * bin_width
        ux, uy = math.cos(theta), math.sin(theta)
        nx, ny = -uy, ux
        items = []
        for (ax, ay), (bx, by) in segs:
            offset = (nx * (ax + bx) + ny * (ay + by)) / 2
            ta, tb = ux * ax + uy * ay, ux * bx + uy * by
            items.append((offset, min(ta, tb), max(ta, tb)))
        items.sort()

        clusters, current = [], [items[0]]
        for item in items[1:]:
            if item[0] - current[-1][0] <= MERGE_DISTANCE_PX:
                current.append(item)
            else:
                clusters.append(current)
                current = [item]
        clusters.append(current)

        for cluster in clusters:
            weight = sum(t1 - t0 for _, t0, t1 in cluster) or 1.0
            offset = sum(o * (t1 - t0) for o, t0, t1 in cluster) / weight
            spans = sorted((t0, t1) for _, t0, t1 in cluster)
            start, end = spans[0]
            for t0, t1 in spans[1:] + [(math.inf, math.inf)]:
                if t0 <= end + MERGE_DISTANCE_PX:
                    end = max(end, t1)
                    continue
                merged.append(((offset * nx + start * ux, offset * ny + start * uy),
                               (offset * nx + end * ux, offset * ny + end * uy)))
                start, end = t0, t1
    return merged


def _merge_collinear(segments: list[Segment]) -> list[Segment]:
    if len(segments) > MAX_SEGMENTS:
        raise VectorizationTooComplexError(
            f"The drawing is too complex to vectorize ({len(segments):,} line fragments, limit {MAX_SEGMENTS:,}). "
            "Try a cleaner scan without hatching/text, or upload the DXF.")
    merged = _merge_by_line(segments)
    # Direction buckets can split a line whose angle sits on a bucket edge; the exact pass joins those leftovers.
    if len(merged) <= PAIRWISE_CLEANUP_LIMIT:
        merged = _merge_pairwise(merged)
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
        mask = keep_thick_strokes(_threshold_fallback(gray))

    segments = _merge_collinear(_mask_to_segments(_drop_small_components(mask)))
    finalized = finalize_wall_geometry([[a, b] for a, b in segments])

    walls = [
        {"points": [[p[0], p[1]] for p in line], "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M}
        for line in finalized if len(line) >= 2
    ]
    return {"walls": walls, "openings": []}
