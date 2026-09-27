"""A project's saved (user-corrected) geometry as a benchmark answer, in the coordinates of its drawing.

    python benchmark/export_truth.py GEOMETRY.json CASE_DIR [--offset DX DY --entry X Y --exit X,Y X,Y ...]

GEOMETRY.json is the body of GET /api/projects/{id}/geometry. For a merged two-storey project the upper
storey is moved back by -offset to where the drawing has it; the levels block stays in merged coordinates."""
import json
import sys
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import _is_light_well, _is_stair  # noqa: E402


def _closed(points: list) -> list:
    return points if points[0] == points[-1] else points + [points[0]]


def export_truth(geometry: dict, levels_hint: dict | None = None) -> dict:
    dx, dy = (levels_hint or {}).get("offset", [0, 0])
    level = lambda x: x.get("level") or 0
    # Drawn position = merged position - offset, for everything above the ground floor.
    at = lambda p, lv: [p["x"] - dx, p["y"] - dy] if lv else [p["x"], p["y"]]
    truth = {
        "walls": [{"points": [at(p, level(w)) for p in w["points"]], "thickness": w["thicknessMeters"]}
                  for w in geometry["walls"]],
        "rooms": [{"points": _closed([at(p, level(r)) for p in r["points"]]), "name": r["label"], "type": None}
                  for r in geometry["rooms"]],
        "openings": [{"type": o["type"].capitalize(), "centre": at(o["position"], level(o)), "width": o["widthMeters"]}
                     for o in geometry["openings"]],
    }
    if not levels_hint:
        return truth
    merged = lambda r: _closed([[p["x"], p["y"]] for p in r["points"]])
    lower = [r for r in geometry["rooms"] if level(r) == 0]
    upper = [r for r in geometry["rooms"] if level(r) == 1]
    wells = [r for r in lower if _is_stair(r["label"]) or _is_light_well(r["label"])]
    upper_area = unary_union([Polygon(merged(r)) for r in upper])
    cut = unary_union([Polygon(merged(r)) for r in wells]).intersection(upper_area)

    def bounds(rooms, shift):
        xs = [p["x"] - shift[0] for r in rooms for p in r["points"]]
        ys = [p["y"] - shift[1] for r in rooms for p in r["points"]]
        return {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}

    truth["levels"] = {
        "blocks": [bounds(lower, (0, 0)), bounds(upper, (dx, dy))],
        "offset": [dx, dy],
        "heights": levels_hint.get("heights", [3.6, 3.6]),
        "stairWell": next(merged(r) for r in lower if _is_stair(r["label"])),
        "lightWells": [merged(r) for r in lower if _is_light_well(r["label"])],
        "stairEntry": levels_hint["stairEntry"],
        "stairExit": levels_hint["stairExit"],
        "upperFloorArea": round(upper_area.area - cut.area, 6),
    }
    return truth


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("geometry")
    ap.add_argument("case_dir")
    ap.add_argument("--offset", nargs=2, type=float)
    ap.add_argument("--entry", nargs=2, type=float)
    ap.add_argument("--exit", nargs="+")
    a = ap.parse_args()
    hint = None
    if a.offset:
        hint = {"offset": a.offset, "stairEntry": a.entry,
                "stairExit": [[float(v) for v in xy.split(",")] for xy in a.exit]}
    geometry = json.loads(Path(a.geometry).read_text(encoding="utf-8"))
    Path(a.case_dir).mkdir(parents=True, exist_ok=True)
    (Path(a.case_dir) / "truth.json").write_text(json.dumps(export_truth(geometry, hint), indent=1), encoding="utf-8")
