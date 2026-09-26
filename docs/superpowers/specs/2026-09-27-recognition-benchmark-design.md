# Recognition benchmark — design

## Why

Each new drawing needs manual fixes: missing or extra walls, stray wall stubs sticking out, rooms without floors or split in two, wrong doors, wrong room names, stairs that are not built or go the wrong way, and upper floors that lose parts of their floor after merging. Each fix so far was made against one file, and nothing shows whether it breaks another. This project builds a scored set of drawings with known answers, so that every change to recognition is measured against all of them. It then fixes the three weakest areas that the scores show.

The 10 drawings in `output_benchmark/` score 10/10 today. They were generated to suit the pipeline: closed polyline walls on `WALL`, names on `TEXT-ROOM`, and 500 mm jambs on every opening. So they cannot measure real-world robustness, and they carry no answers beyond a room count.

## Scope

In scope:
- A benchmark folder with drawings and answer files.
- A generator for clean houses and their "dirty" variants.
- A two-stage scorer (Python pipeline, then TypeScript web logic).
- A report, a baseline, and a regression gate.
- Fixing the pipeline for the three lowest-scoring groups on the first report.

Out of scope:
- Features like Curic's (project B, which gets its own spec).
- Realism and interaction (project C).
- SketchUp import (dropped).

## Layout

```
plan2space/benchmark/
  cases/<case>/drawing.dxf
  cases/<case>/truth.json
  generate.py            houses + dirty variants, answers written from the same description
  score_pipeline.py      stage 1: run the ai-service pipeline, score groups 1–4, write out/<case>.json
  run.py                 runs both stages, prints the report, compares with baseline.json
  baseline.json          per-case scores that CI holds the line on
  out/, report/          generated, git-ignored
plan2space-web/tests/benchmark.test.ts   stage 2: score groups 5–7 from out/*.json
```

## Answer file (`truth.json`)

All values are in metres, in the drawing's own coordinates after unit conversion.

- `walls`: each wall as `{ points, thickness }`, the centreline.
- `rooms`: each room as `{ points, name, type }`, where `type` is one of the web's `RoomType` values or null.
- `openings`: each opening as `{ type: "Door"|"Window", centre, width }`.
- `levels` (two-storey drawings only):
  - `blocks`: the two blocks, `[lowerBounds, upperBounds]`.
  - `offset`: the true merge offset.
  - `stairWell`: the polygon of the stair well.
  - `lightWells`: the polygons of the light wells.
  - `stairEntry`: the point just inside the stair well's door.
  - `stairExit`: the area, in upper-level plan coordinates, where the top of the stair must open.
  - `upperFloorArea`: the area of the upper floor once the wells are cut out.

Where the answers come from:
- Generated cases: `generate.py` writes the DXF and `truth.json` from one house description, so the answer is exact.
- Real drawings: the pipeline's output gives a draft. The user corrects it in the app, and it is exported once to `truth.json`. `nha_2tang_pa_a.dxf` is the first real case.

## Generator

At least 10 house descriptions: the existing 10 styles, plus one two-storey house with a stair, a light well and a rear balcony. Each house is written as a clean case and as one variant per defect:

1. Walls drawn as two loose parallel lines, not closed polylines.
2. Gaps of 5–30 mm at wall joints.
3. Doors as blocks with a swing arc, on an unusual layer.
4. Room names as formatted MTEXT, or inside blocks.
5. Arbitrary layer names (`A-WALL`, `TUONG`, `0`).
6. Units in cm or m instead of mm (through `$INSUNITS`).
7. Clutter: hatches, dimension lines, and furniture drawn as lines.
8. Two-storey only: the two blocks side by side, a balcony that sticks out, and stair doors in different positions.

The initial set is about 60 cases.

## Scoring

Each case gets a 0–100 score per group, and the total is their mean.

| Group | Method | Match when |
|---|---|---|
| 1. Walls | Pair found walls with answer walls by centreline. Score = mean of precision and recall, weighted by wall length. | offset ≤ 0.1 m, thickness within 0.05 m |
| 1b. Stray stubs | Count wall ends that meet no other wall, no opening jamb, and no answer wall end. | −10 points per stub, floored at 0 |
| 2. Rooms | Pair each answer room with the found room of highest IoU. Report splits and merges separately. | IoU ≥ 0.85 |
| 3. Openings | Pair by centre. | centre ≤ 0.3 m, same type, width within 0.15 m |
| 4. Names / types | Over the rooms paired in group 2. | name equal after dropping accents and case; type equal |
| 5. Stair | Run the web's `stairWells` and `stairFor` on the merged plan. | well IoU ≥ 0.85, entry point not blocked by low steps, top tread exit inside `stairExit` |
| 6. Merge | Run `planMerge`. | two blocks found, offset error ≤ 0.1 m |
| 7. Upper floor | Run `mergeFloors`, then `floorPieces`. | area difference ≤ 0.5 m² |

Groups 5–7 run the web's own code, so the score reflects what users see. A case without levels shows "–" for groups 5–7 and is scored on groups 1–4.

## Report and gate

`python benchmark/run.py`:
- runs both stages;
- prints a table with one row per case and one column per group, plus the total;
- writes `report/<timestamp>.json`;
- prints what moved against `baseline.json`.

Two more commands:
- `--overlay <case>`: writes a PNG with the answer in green and the result in red.
- `--update-baseline`: rewrites the baseline, and is committed with the change that earns it.

CI runs the benchmark and fails when any case drops more than 2 points below its baseline.

## First improvement round

After the first report, fix the pipeline for the three groups with the lowest mean score, in that order. Each fix must raise its group's mean without dropping any case by more than 2 points, and it lands together with a baseline update. Which three groups these are is decided by the report, not now.

## Error handling

- A case whose DXF fails to parse scores 0 in every group and is reported with its error; the run continues.
- A missing `truth.json` fails the run and names the case.
- Stage 2 with no `out/*.json` fails and says to run stage 1 first.

## Testing

- The generator: every generated case's `truth.json` round-trips, and its rooms tile the house outline (no overlap, full cover).
- The scorer: one test per group, using hand-made results that are right, off by just under the tolerance, and off by just over it.
- The regression gate: the benchmark run itself, in CI.
