"""Stage 1: run the worker's DXF job on every case, score groups 1-4, keep each result for stage 2."""
import json
from pathlib import Path

from pipeline.dxf_job import process_dxf
from score import score_names, score_openings, score_rooms, score_walls, stray_stubs, stub_score


def run_stage1(case_dirs, out_dir) -> list[dict]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for case in map(Path, case_dirs):
        truth = json.loads((case / "truth.json").read_text(encoding="utf-8"))
        row = {"case": case.name, "splits": 0, "merges": 0, "error": None}
        try:
            found = process_dxf(str(case / "drawing.dxf"))
        except Exception as exc:   # a drawing the pipeline rejects scores 0 everywhere; the run goes on
            rows.append({**row, "walls": 0, "stubs": 0, "rooms": 0, "openings": 0, "names": 0, "error": str(exc)})
            continue
        rooms = score_rooms(found, truth)
        rows.append({**row,
                     "walls": score_walls(found, truth),
                     "stubs": stub_score(stray_stubs(found, truth)),
                     "rooms": rooms["score"], "splits": rooms["splits"], "merges": rooms["merges"],
                     "openings": score_openings(found, truth),
                     "names": score_names(found, truth, rooms["pairs"])})
        (out_dir / f"{case.name}.json").write_text(json.dumps(found), encoding="utf-8")
    return rows
