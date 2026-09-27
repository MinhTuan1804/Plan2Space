"""The recognition benchmark: generate the cases, score both stages, print the report, hold the baseline.

    python benchmark/run.py                    score, compare with baseline.json (exit 1 on a regression)
    python benchmark/run.py --update-baseline  score and make this run the baseline
    python benchmark/run.py --private          also score the real drawings in benchmark/private/
    python benchmark/run.py --overlay CASE     draw the answer (green) and the result (red) to report/CASE.png
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "ai-service")]

from generate import generate_all  # noqa: E402
from score_pipeline import run_stage1  # noqa: E402

WEB = HERE.parent / "plan2space-web"
BASELINE = HERE / "baseline.json"
MAX_DROP = 2.0
STAGE1 = ["walls", "stubs", "rooms", "openings", "names"]
STAGE2 = ["stair", "merge", "floor"]


def total(row: dict) -> float:
    scores = [row[k] for k in STAGE1 + STAGE2 if row.get(k) is not None]
    return sum(scores) / len(scores)


def compare(baseline: dict, current: dict) -> list[str]:
    """Every group of every case more than 2 points below its baseline. Per group, not per total: a total
    averages up to eight groups and would let a whole lost room slip through. New cases and groups pass."""
    drops = []
    for case, groups in current.items():
        for group, score in groups.items():
            before = baseline.get(case, {}).get(group)
            if before is not None and score is not None and score < before - MAX_DROP:
                drops.append(f"{case}: {group} {before:.1f} -> {score:.1f}")
    return drops


def run_stage2() -> dict:
    proc = subprocess.run("npx vitest run tests/benchmark/stage2.test.ts", cwd=WEB, shell=True,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    rows = {}
    for line in proc.stdout.splitlines():
        if "BENCH2 " in line:        # vitest may prefix colour codes
            r = json.loads(line[line.index("BENCH2 ") + len("BENCH2 "):])
            rows[r.pop("case")] = r
    if proc.returncode != 0:
        raise SystemExit(f"stage 2 failed:\n{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}")
    return rows


def print_table(rows: list[dict]) -> None:
    head = f"{'case':46}" + "".join(f"{k:>9}" for k in STAGE1 + STAGE2) + f"{'total':>9}"
    print(head)
    print("-" * len(head))
    for r in rows:
        cells = "".join(f"{'–' if r.get(k) is None else round(r[k]):>9}" for k in STAGE1 + STAGE2)
        note = f"  ERROR: {r['error'][:60]}" if r["error"] else (
            f"  splits {r['splits']} merges {r['merges']}" if r["splits"] or r["merges"] else "")
        print(f"{r['case'][:46]:46}{cells}{total(r):>9.1f}{note}")
    print("-" * len(head))
    means = {k: [r[k] for r in rows if r.get(k) is not None] for k in STAGE1 + STAGE2}
    print(f"{'MEAN':46}" + "".join(f"{(sum(v) / len(v) if v else 0):>9.1f}" for v in means.values())
          + f"{sum(total(r) for r in rows) / len(rows):>9.1f}")


def overlay(case: str) -> Path:
    from PIL import Image, ImageDraw
    case_dir = next(d for d in (HERE / "cases" / case, HERE / "private" / case) if d.exists())
    truth = json.loads((case_dir / "truth.json").read_text(encoding="utf-8"))
    found = json.loads((HERE / "out" / f"{case}.json").read_text(encoding="utf-8"))
    lines = [("#16a34a", [tuple(p) for p in w["points"]]) for w in truth["walls"]]
    lines += [("#dc2626", [(p["x"], p["y"]) for p in w["points"]]) for w in found["walls"]]
    xs = [x for _, ps in lines for x, _ in ps]
    ys = [y for _, ps in lines for _, y in ps]
    scale, pad = 40, 20
    img = Image.new("RGB", (int((max(xs) - min(xs)) * scale) + 2 * pad, int((max(ys) - min(ys)) * scale) + 2 * pad), "white")
    draw = ImageDraw.Draw(img)
    to = lambda p: (pad + (p[0] - min(xs)) * scale, pad + (max(ys) - p[1]) * scale)
    for colour, ps in lines:
        draw.line([to(p) for p in ps], fill=colour, width=3 if colour == "#16a34a" else 1)
    out = HERE / "report" / f"{case}.png"
    out.parent.mkdir(exist_ok=True)
    img.save(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--private", action="store_true")
    ap.add_argument("--overlay")
    args = ap.parse_args()
    if args.overlay:
        print(overlay(args.overlay))
        return 0
    # ponytail: the cases are rebuilt on every run (a few seconds); cache them if the set grows large.
    cases = generate_all(HERE / "cases")
    if args.private and (HERE / "private").exists():
        cases += sorted(d for d in (HERE / "private").iterdir() if (d / "truth.json").exists())
    out = HERE / "out"
    for old in out.glob("*.json"):
        old.unlink()
    rows = run_stage1(cases, out)
    web = run_stage2()
    for r in rows:
        r.update(web.get(r["case"], {k: None for k in STAGE2}))
    print_table(rows)
    report = HERE / "report" / f"{time.strftime('%Y%m%d-%H%M%S')}.json"
    report.parent.mkdir(exist_ok=True)
    report.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    private = {d.name for d in (HERE / "private").iterdir()} if (HERE / "private").exists() else set()
    current = {r["case"]: {k: None if r.get(k) is None else round(r[k], 2) for k in STAGE1 + STAGE2}
               for r in rows if r["case"] not in private}
    if args.update_baseline:
        BASELINE.write_text(json.dumps(current, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"baseline written: {len(current)} cases")
        return 0
    baseline = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else {}
    for c in sorted(current):
        for k, score in current[c].items():
            before = baseline.get(c, {}).get(k)
            if before is not None and score is not None and abs(score - before) >= 0.5:
                print(f"  {c}: {k} {before:.1f} -> {score:.1f}")
    dropped = compare(baseline, current)
    if dropped:
        print(f"REGRESSION (> {MAX_DROP} points below baseline):")
        for d in dropped:
            print(f"  {d}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
