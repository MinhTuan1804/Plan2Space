# Recognition Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score DXF recognition against known answers on ~60 generated and a few real drawings, gate regressions in CI, and fix the three weakest scoring groups.

**Architecture:**
- Stage 1 (Python) runs the worker's own DXF chain on every case, scores walls, stubs, rooms, openings and names, and writes each result in the web's save-body JSON.
- Stage 2 (vitest) loads that JSON, runs the web's own merge, stair and floor code, and scores stairs, merge and upper floor.
- `run.py` joins both stages into one report and compares it with a committed baseline.

**Tech Stack:** Python 3 (ezdxf, shapely, pytest) in `ai-service/.venv`; TypeScript and vitest in `plan2space-web`.

**Spec:** `docs/superpowers/specs/2026-09-27-recognition-benchmark-design.md`

## Global Constraints

- Tolerances, copied from the spec:
  - wall centreline offset ≤ 0.1 m, thickness within 0.05 m;
  - stray stub −10 points each, floored at 0;
  - room IoU ≥ 0.85;
  - opening centre ≤ 0.3 m, same type, width within 0.15 m;
  - names equal after dropping accents and case;
  - stair well IoU ≥ 0.85;
  - merge offset error ≤ 0.1 m;
  - upper floor area difference ≤ 0.5 m²;
  - the CI gate fails a case that drops more than 2 points below its baseline.
- Scores are 0–100 per group. The total is the mean of the groups that apply.
- Stage 1 must run exactly the worker's chain: `parse_dxf` → `heal_wall_topology(snap_tolerance_m=0.005)` → `rooms_from_walls` → `label_rooms` → `serialize_pipeline_result`.
- Stage 2 must import the web's own `planMerge`, `mergeFloors`, `stairWells`, `stairFor`, `holeRooms` and `floorPieces`. It must not copy them.
- The user's drawings are never committed: real cases live in `benchmark/private/`, which is git-ignored. CI scores generated cases only.
- Generated cases are written by the generator at run time into `benchmark/cases/`, which is git-ignored. The generator and `baseline.json` are committed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A variant whose DXF the parser rejects (for example, no layer named like a wall). It must score 0 in every group with the error in the report, and the run must go on.
2. Units in cm or m. The answer is in metres, so the scorer must compare metres to metres, never raw drawing units.
3. A room split by a stray wall. It must show as a split (one answer room, two found rooms), not as a missing room plus an extra room.
4. Opening type case: the pipeline emits `door`/`window`, the answers say `Door`/`Window`, and stage 2 needs `Door`/`Window`.
5. A two-storey case where `planMerge` finds no merge. Groups 6 and 7 must score 0 and not crash.

---

### Task 1: One DXF job function shared by the worker and the benchmark

**Files:**
- Create: `ai-service/pipeline/dxf_job.py`
- Modify: `ai-service/workers/tasks.py:62-78`
- Test: `ai-service/tests/test_dxf_job.py`

**Interfaces:**
- Produces: `process_dxf(path: str) -> dict`. It returns `serialize_pipeline_result(...)`'s dict: `walls[{id, points[{x,y}], thicknessMeters, heightMeters}]`, `openings[{wallId, type: 'door'|'window', position{x,y}, widthMeters, sillHeightMeters}]`, `rooms[{id, points, label}]`.

- [ ] **Step 1:** Write `test_process_dxf_matches_worker_chain`. On `tests/fixtures`' existing simple DXF (use the one `test_dxf_openings_and_rooms.py` loads), assert:
  - `process_dxf(path)` has the keys `walls`, `openings`, `rooms`;
  - it has the same wall count, room labels and opening types as the chain written out by hand in the test.
- [ ] **Step 2:** Run `cd ai-service && .venv/Scripts/python -m pytest tests/test_dxf_job.py -v`. Expected: FAIL, `ModuleNotFoundError: pipeline.dxf_job`.
- [ ] **Step 3:** Implement `process_dxf` as the chain in Global Constraints. Replace lines 65–78 of `workers/tasks.py`, DXF branch only, with a call to it. The raster branch is unchanged.
- [ ] **Step 4:** Run `.venv/Scripts/python -m pytest tests/ -q`. Expected: all pass.
- [ ] **Step 5:** Commit `refactor: one DXF job function for the worker and the benchmark`.

### Task 2: House descriptions and the clean writer

**Files:**
- Create: `benchmark/houses.py`, `benchmark/generate.py`, `benchmark/.gitignore` (`cases/`, `out/`, `report/`, `private/`)
- Test: `benchmark/tests/test_generate.py`

**Interfaces:**
- Produces:
  - `House` dataclass: `name: str`, `levels: list[Level]`, and for a two-storey house `gap_m: float` (how far apart the two blocks are drawn).
  - `Level`: `rooms: list[RoomSpec]`, `openings: list[OpeningSpec]`, `stair_entry: tuple|None`, `stair_exit: list[tuple]|None` (a polygon).
  - `RoomSpec(name: str, type: str|None, points: list[tuple])`, with points in metres and the ring closed.
  - `OpeningSpec(type: 'Door'|'Window', centre: tuple, width: float)`.
  - `HOUSES: list[House]`.
  - `walls_of(level) -> list[dict(points, thickness)]`. Every room edge is a wall. A shared edge is one wall, 0.11 m thick. An edge on the outline of the level's room union is 0.22 m thick.
  - `write_case(house, variant: str, out_dir) -> Path`. It writes `drawing.dxf` and `truth.json` in the spec's schema.
  - `generate_all(out_dir) -> list[Path]`.

- [ ] **Step 1:** Write the tests:
  - `test_rooms_tile_each_level`: for every house and level, the room polygons do not overlap (pairwise intersection area < 1e-6) and their union equals the convex outline area when the house is rectangular. For non-rectangular houses, compare with the `house.outline_area` field.
  - `test_truth_round_trips`: the written `truth.json` loads, and `walls`/`rooms`/`openings` equal what `houses.py` gives.
  - `test_clean_case_scores_as_drawn`: `process_dxf` on `case01/clean` finds as many rooms as the truth has. This is the smoke test that the clean writer draws what the pipeline expects today.
- [ ] **Step 2:** Run `ai-service/.venv/Scripts/python -m pytest benchmark/tests -v`. Expected: FAIL on import.
- [ ] **Step 3:** Implement:
  - `houses.py`: port the 10 layouts in `E:/Project Indivdual/AutoCad/generate_10_benchmark_dxf.py` into `RoomSpec`/`OpeningSpec` data.
  - House 11: a two-storey house with stair well, light well and rear balcony. Model it on `nha_2tang_pa_a`: a 10 × 13.6 m ground floor, the upper floor drawn 20 m to the right, the stair well 2.8 × 3.8 m, and the door mid-way along the well's east side.
  - `generate.py` `clean` writer: a closed LWPOLYLINE outline per wall segment on layer `WALL`, with openings cut as gaps. Doors are a line on layer `DOOR` across the gap and windows a line on `WINDOW`, the way the old script draws them. Room names are TEXT on `TEXT-ROOM`. Units are mm, with `$INSUNITS = 4`.
  - A two-storey house draws level 1 translated by `(width + gap_m, 0)`. Its truth `levels.offset` is `(-(width + gap_m), 0)`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(benchmark): house descriptions and clean case writer`.

### Task 3: Dirty variants

**Files:**
- Modify: `benchmark/generate.py`
- Test: `benchmark/tests/test_generate.py`

**Interfaces:**
- Produces: `VARIANTS = ['clean', 'two_lines', 'gaps', 'door_blocks', 'mtext_names', 'odd_layers', 'units_cm', 'units_m', 'clutter']`, plus `'side_by_side'` for two-storey houses only. The two-storey clean case is already drawn side by side, so `side_by_side` adds the balcony overhang and moves the stair door. `write_case` accepts any of them.

The variants:
1. `two_lines`: each wall is two parallel LINEs, one on each face.
2. `gaps`: every wall-end joint pulled back by a seeded random 5–30 mm.
3. `door_blocks`: each door is an INSERT of a block holding a leaf line and a 90° ARC, on layer `A-DOOR`.
4. `mtext_names`: names as MTEXT with `\P` and formatting codes; one name in three sits inside a block.
5. `odd_layers`: walls on `A-WALL`, `TUONG` or `0`, one per house in rotation; texts on `A-ANNO-ROOM`.
6. `units_cm` / `units_m`: coordinates scaled and `$INSUNITS` set to 5 / 6.
7. `clutter`: a hatch in every wet room, dimension lines along two sides on `DIM`, and a 2 × 1.6 m bed drawn as 4 LINEs on `FURNITURE`.

The truth is identical across one house's variants: the answer never changes, only the drawing.

- [ ] **Step 1:** Write the tests:
  - `test_every_variant_writes_a_readable_dxf`: `ezdxf.readfile` succeeds for each house × variant.
  - `test_variants_share_the_answer`: every variant's `truth.json` equals the clean one's.
  - `test_units_variants_scale_geometry`: the `units_cm` wall extents are 0.1 × those of `clean` in drawing units.
- [ ] **Step 2:** Run them. Expected: FAIL (unknown variant).
- [ ] **Step 3:** Implement the variants. Seed the randomness with `hash((house.name, variant))`, so the cases are the same on every run.
- [ ] **Step 4:** Run `pytest benchmark/tests -v`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(benchmark): dirty variants of every house`.

### Task 4: Stage 1 scoring (groups 1–4)

**Files:**
- Create: `benchmark/score.py`, `benchmark/score_pipeline.py`
- Test: `benchmark/tests/test_score.py`

**Interfaces:**
- Produces, in `score.py` (pure: result dict + truth dict in, number out):
  - `score_walls(found, truth) -> float`
  - `stray_stubs(found, truth) -> int`, with the stub score `max(0, 100 - 10 * stubs)`
  - `score_rooms(found, truth) -> dict(score, splits, merges)`
  - `score_openings(found, truth) -> float`
  - `score_names(found, truth) -> float`
- Produces, in `score_pipeline.py`:
  - `run_stage1(case_dirs) -> list[dict]`. Each row is `{case, walls, stubs, rooms, openings, names, splits, merges, error}`.
  - It writes `out/<case>.json` (the `process_dxf` result) for stage 2.

- [ ] **Step 1:** Write the tests, one per group, each with hand-made `found` built from the truth:
  - the exact copy scores 100;
  - shifted by 0.09 m it still scores 100;
  - shifted by 0.11 m it scores < 100;
  - walls: one wall missing scores 100 × (1 − its length share / 2);
  - stubs: a 0.5 m wall added that touches only one other wall gives 1 stub; an opening jamb gives 0;
  - rooms: one answer room cut into two halves gives `splits == 1`;
  - names: `'Phòng Ngủ'` vs `'phong ngu'` matches;
  - openings: `door` vs `Door` matches (Review Focus 4).
- [ ] **Step 2:** Run `pytest benchmark/tests/test_score.py -v`. Expected: FAIL on import.
- [ ] **Step 3:** Implement with shapely.
  - Walls: buffer each answer centreline by 0.1 m. A found wall's length inside that buffer counts as matched when the thicknesses agree within 0.05. Recall and precision are both taken by length.
  - Stubs: a found wall end is a stub when it is more than 0.05 m from every other found wall and every opening's gap end, and more than 0.15 m from every answer wall end.
  - Rooms: greedy one-to-one pairing on IoU ≥ 0.85, highest first. A split is an answer room covered ≥ 85 % by two or more found rooms, each with overlap > 0.5 m². A merge is the reverse.
  - Openings: greedy pairing on distance ≤ 0.3 m with a case-insensitive type match and width within 0.15 m. Score = mean of precision and recall.
  - Names: over the rooms paired above, normalise names with `unicodedata` NFD, strip combining marks, `đ` → `d`, lowercase and trim.
  - `run_stage1` catches each case's exception and records `error` with 0 in every group (Review Focus 1).
- [ ] **Step 4:** Run `pytest benchmark/tests -v`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(benchmark): stage 1 scoring of walls, stubs, rooms, openings and names`.

### Task 5: Stage 2 scoring (groups 5–7)

**Files:**
- Create: `plan2space-web/tests/benchmark/score.ts`, `plan2space-web/tests/benchmark/score.test.ts`, `plan2space-web/tests/benchmark/stage2.test.ts`

**Interfaces:**
- Consumes: `out/<case>.json` (Task 4) and `truth.json` (Task 2).
- Produces:
  - `toPlan(result) -> PlanData`, which capitalises opening types (Review Focus 4);
  - `scoreStair(plan, truth) -> number`;
  - `scoreMerge(plan, truth) -> number`;
  - `scoreUpperFloor(plan, truth) -> number`;
  - `stage2.test.ts` writes `benchmark/out/<case>.web.json` with `{stair, merge, floor}` for every two-storey case. It is skipped with a message when `benchmark/out` is empty.

- [ ] **Step 1:** Write `score.test.ts` on a hand-made merged-ready plan: the two 10 × 13.6 blocks from `tests/levels.test.ts`, a stair well and a matching truth. Assert:
  - the right plan scores 100/100/100;
  - moving the upper block 0.2 m off gives merge < 100;
  - dropping the upper stair room gives stair 0;
  - a plan with a single block gives merge 0 and floor 0 without throwing (Review Focus 5).
- [ ] **Step 2:** Run `cd plan2space-web && npx vitest run tests/benchmark/score.test.ts`. Expected: FAIL on import.
- [ ] **Step 3:** Implement:
  - Merge: `planMerge`. Score 100 when the offset error ≤ 0.1 m, else 0.
  - Floor: `mergeFloors` with the truth's storey heights, then the area of `floorPieces` over the upper rooms against `truth.levels.upperFloorArea`. Score 100 when within 0.5 m², else scaled down linearly to 0 at 5 m².
  - Stair: well IoU ≥ 0.85 (use `polygon-clipping` intersection) gives 50; entry and exit checks give 25 each. The entry check is that `surfaceHeight` at `stairEntry` is null or ≤ 0.6 or ≥ 2.3. The exit check is that the top tread centre, stepped 0.3 m past its end or side, lies in `stairExit`.
- [ ] **Step 4:** Run `npx vitest run tests/benchmark`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(benchmark): stage 2 scoring of stairs, merge and upper floor with the web's own code`.

### Task 6: Runner, report, baseline, overlay, CI

**Files:**
- Create: `benchmark/run.py`, `benchmark/baseline.json`, `benchmark/README.md` (commands only)
- Modify: `.github/workflows/*.yml` (the ai-service job, or a new job after it that runs both stages)
- Test: `benchmark/tests/test_run.py`

**Interfaces:**
- Produces:
  - `python benchmark/run.py [--update-baseline] [--overlay CASE] [--private]`. The steps:
    1. `generate_all` when `cases/` is stale;
    2. `run_stage1`;
    3. `npx vitest run tests/benchmark/stage2.test.ts`;
    4. merge the rows and print the table in the spec's format;
    5. write `report/<timestamp>.json`;
    6. compare with the baseline and exit 1 when any case is more than 2 points below it;
    7. with `--update-baseline`, rewrite the baseline and exit 0.
  - `--private` adds the cases in `private/`, which are never written to the baseline.

- [ ] **Step 1:** Write the tests:
  - `test_gate_fails_on_drop`: `compare({'a': 90}, {'a': 87.9})` reports `a`.
  - `test_gate_passes_within_two`: 88.1 against 90 is not reported.
  - `test_new_case_is_not_a_regression`.
  - `test_total_is_mean_of_applicable_groups`: groups 5–7 are `None` for one-storey cases.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `run.py`. The overlay uses matplotlib when installed (check `ai-service/requirements.txt`); otherwise it draws with Pillow, which the pipeline already uses. It draws the answer walls green and the found walls red, and saves `report/<case>.png`.
- [ ] **Step 4:** Run `python benchmark/run.py --update-baseline`. Expected: the table prints and `baseline.json` is written. Then run `python benchmark/run.py`. Expected: exit 0.
- [ ] **Step 5:** Add the CI step, `python benchmark/run.py` after the ai-service tests with node available, and commit it with `benchmark: runner, report, baseline and CI gate` and the first baseline.

### Task 7: The first real case

**Files:**
- Create: `benchmark/private/nha_2tang_pa_a/drawing.dxf` (copied from `E:/Project Indivdual/AutoCad/nha_2tang_pa_a.dxf`, git-ignored), `benchmark/private/nha_2tang_pa_a/truth.json` (git-ignored)
- Create: `benchmark/export_truth.py`, a tool that turns a project's saved geometry into `truth.json`
- Test: `benchmark/tests/test_export_truth.py`

**Interfaces:**
- Produces: `export_truth(geometry_json: dict, levels_hint: dict|None) -> dict`, in the truth schema. `geometry_json` is the body of `GET /api/projects/{id}/geometry`, or the same shape pulled from Postgres.

- [ ] **Step 1:** Write `test_export_truth_maps_geometry`. A two-wall, one-room, one-door geometry becomes truth with the thickness, name and `Door` carried over.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it. Export project `c22e060a-32e6-4c75-98b2-af957da12417` (the user's corrected Nhà_2_Tầng_V2) from Postgres with the SQL used earlier in this session, and convert it. The levels block (stair well, light wells, entry, exit, upper floor area) comes from the merged rooms and walls:
  - `stairExit` is the corridor strip `x 2.8–6.4, y 5.8–6.9` at level 1;
  - `upperFloorArea` is the level-1 room area less the wells.
  - The two-block `blocks`/`offset` come from the unmerged import: 20 m apart.
- [ ] **Step 4:** Run `python benchmark/run.py --private`. Expected: a row for `nha_2tang_pa_a`.
- [ ] **Step 5:** Commit `feat(benchmark): export a corrected project as a real case's answer` (tool and test only; the case stays private).

### Tasks 8–10: Fix the three lowest groups

The first report (Task 6 Step 4, plus Task 7) decides which groups these are: the three with the lowest mean over all cases, lowest first. Each task follows the same steps.

**Files:** decided by the root cause. Expected in `ai-service/pipeline/dxf_parser.py`, `gnn_healing.py`, `rooms.py` or `wall_gaps.py`, or in the web's `lib/levels.ts` and `Viewer3D/slabs.ts`/`stairs.ts` for groups 5–7.

- [ ] **Step 1:** For the lowest-scoring cases in the group, run `run.py --overlay <case>` and read the picture. Find the root cause. One cause usually spans several variants, such as `two_lines`, `odd_layers` and `door_blocks`.
- [ ] **Step 2:** Write the smallest failing unit test in the module that owns the cause, reproducing it on a trimmed version of the failing case's geometry.
- [ ] **Step 3:** Run it. Expected: FAIL for the reason found in Step 1.
- [ ] **Step 4:** Fix the cause, then run the owning suite: `pytest ai-service/tests` or `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Run `python benchmark/run.py`. Expected:
  - the group's mean has risen;
  - no case has dropped more than 2 points.

  If a case dropped, go back to Step 1 with that case.
- [ ] **Step 6:** Run `python benchmark/run.py --update-baseline`. Commit the fix, its test and the new baseline together as `fix(recognition): <cause>` with the group's before → after mean in the body.
