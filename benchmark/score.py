"""Stage 1 scores (0-100) of one pipeline result against its answer: walls, stray stubs, rooms, openings, names.

`found` is the pipeline's save body (walls/rooms/openings with {x, y} points); `truth` is truth.json."""
import math
import unicodedata

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

WALL_OFFSET_M = 0.1
WALL_THICKNESS_M = 0.05
STUB_TOUCH_M = 0.05
STUB_TRUTH_END_M = 0.15
ROOM_IOU = 0.85
SPLIT_OVERLAP_M2 = 0.5
OPENING_CENTRE_M = 0.3
OPENING_WIDTH_M = 0.15
EPS = 1e-9


def _xy(points) -> list[tuple]:
    return [(p["x"], p["y"]) if isinstance(p, dict) else (p[0], p[1]) for p in points]


def _poly(points) -> Polygon:
    p = Polygon(_xy(points))
    return p if p.is_valid else p.buffer(0)


def _mean_pr(matched_found: float, total_found: float, matched_truth: float, total_truth: float) -> float:
    if total_found == 0 and total_truth == 0:
        return 100.0
    precision = matched_found / total_found if total_found else 0.0
    recall = matched_truth / total_truth if total_truth else 0.0
    return 100.0 * (precision + recall) / 2


def score_walls(found: dict, truth: dict) -> float:
    """Mean of precision and recall by wall length: a wall counts where it lies within 0.1 m of an answer wall
    of the same thickness (within 0.05 m)."""
    fw = [(LineString(_xy(w["points"])), w["thicknessMeters"]) for w in found["walls"]]
    tw = [(LineString(_xy(w["points"])), w["thickness"]) for w in truth["walls"]]
    same = lambda a, b: abs(a - b) <= WALL_THICKNESS_M + EPS

    def covered(lines, others) -> float:
        total = 0.0
        for line, t in lines:
            near = [o.buffer(WALL_OFFSET_M + EPS) for o, ot in others if same(t, ot)]
            if near:
                total += line.intersection(unary_union(near)).length
        return total

    return _mean_pr(covered(fw, tw), sum(l.length for l, _ in fw), covered(tw, fw), sum(l.length for l, _ in tw))


def stray_stubs(found: dict, truth: dict) -> int:
    """Wall ends that meet no other wall and no opening, where the answer has no wall end either."""
    lines = [LineString(_xy(w["points"])) for w in found["walls"]]
    openings = [(Point(_xy([o["position"]])[0]), o["widthMeters"] / 2) for o in found["openings"]]
    truth_ends = [Point(p) for w in truth["walls"] for p in (w["points"][0], w["points"][-1])]
    stubs = 0
    for i, line in enumerate(lines):
        for end in (Point(line.coords[0]), Point(line.coords[-1])):
            if any(j != i and other.distance(end) <= STUB_TOUCH_M for j, other in enumerate(lines)):
                continue
            if any(end.distance(c) <= half + STUB_TOUCH_M for c, half in openings):
                continue
            if any(end.distance(t) <= STUB_TRUTH_END_M for t in truth_ends):
                continue
            stubs += 1
    return stubs


def stub_score(stubs: int) -> float:
    return max(0.0, 100.0 - 10.0 * stubs)


def _iou(a: Polygon, b: Polygon) -> float:
    union = a.union(b).area
    return a.intersection(b).area / union if union else 0.0


def score_rooms(found: dict, truth: dict) -> dict:
    """Answer rooms paired one-to-one with found rooms at IoU >= 0.85 (best first); splits and merges apart."""
    tp = [_poly(r["points"]) for r in truth["rooms"]]
    fp = [_poly(r["points"]) for r in found["rooms"]]
    candidates = sorted(((_iou(t, f), i, j) for i, t in enumerate(tp) for j, f in enumerate(fp)), reverse=True)
    pairs, used_t, used_f = [], set(), set()
    for iou, i, j in candidates:
        if iou < ROOM_IOU:
            break
        if i not in used_t and j not in used_f:
            pairs.append((i, j))
            used_t.add(i)
            used_f.add(j)

    def pieces_cover(whole: Polygon, parts: list[Polygon]) -> bool:
        overlaps = [whole.intersection(p).area for p in parts]
        big = [a for a in overlaps if a > SPLIT_OVERLAP_M2]
        return len(big) >= 2 and sum(big) >= ROOM_IOU * whole.area

    splits = sum(1 for i, t in enumerate(tp) if i not in used_t and pieces_cover(t, fp))
    merges = sum(1 for j, f in enumerate(fp) if j not in used_f and pieces_cover(f, tp))
    score = 100.0 * len(pairs) / len(tp) if tp else 100.0
    return {"score": score, "splits": splits, "merges": merges, "pairs": pairs}


def score_openings(found: dict, truth: dict) -> float:
    """Pairs within 0.3 m, of the same type (any case) and width within 0.15 m; mean of precision and recall."""
    fo = [(Point(_xy([o["position"]])[0]), o["type"].lower(), o["widthMeters"]) for o in found["openings"]]
    to = [(Point(o["centre"]), o["type"].lower(), o["width"]) for o in truth["openings"]]
    candidates = sorted((tc.distance(fc), i, j) for i, (tc, tt, tw) in enumerate(to) for j, (fc, ft, fw) in enumerate(fo)
                        if tt == ft and abs(tw - fw) <= OPENING_WIDTH_M + EPS)
    used_t, used_f = set(), set()
    for d, i, j in candidates:
        if d > OPENING_CENTRE_M + EPS:
            break
        if i not in used_t and j not in used_f:
            used_t.add(i)
            used_f.add(j)
    return _mean_pr(len(used_f), len(fo), len(used_t), len(to))


def normalise_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).lower().split())


def score_names(found: dict, truth: dict, pairs: list[tuple[int, int]] | None = None) -> float:
    """Over the rooms paired by score_rooms: the found label equals the answer's name, accents and case aside."""
    pairs = score_rooms(found, truth)["pairs"] if pairs is None else pairs
    if not pairs:
        return 0.0
    same = sum(1 for i, j in pairs
               if normalise_name(found["rooms"][j]["label"]) == normalise_name(truth["rooms"][i]["name"]))
    return 100.0 * same / len(pairs)
