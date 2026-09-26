# Multi-storey Houses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stack the floors of a side-by-side multi-storey plan into one saved two-storey house, with slabs, light wells and a generated stair in 3D, and walking up and down.

**Architecture:** Every element (wall, room, opening, furniture) gets an integer `level`. A web-side Merge moves the upper block onto the lower one and sets levels; the 2D plan edits one level at a time; the 3D view renders each level at its elevation, adds slabs with holes, railings and glass over light wells, and a stair generated from the stair well. The walk tracks a ground height that follows the stair.

**Tech Stack:** ASP.NET Core 8 + EF Core/Npgsql (migration), React 18 + TS, Zustand, react-konva, R3F/three, vitest, xUnit.

**Spec:** `docs/superpowers/specs/2026-09-27-multi-storey-design.md`

## Global Constraints

- `Level` integer, default `0`, allowed `0 ≤ level ≤ 9`; an opening's level equals its wall's level.
- Storey height = tallest wall of that level; elevation(n) = sum of storey heights of levels 0…n−1.
- Merge defaults: storey heights 3.6 m (level 0) and 3.5 m (level 1), editable 2.2–6.0 m.
- Blocks: walls whose slabs touch or lie within 0.5 m; a block counts if its bounding box ≥ 20 m². Ground floor = the left block; alignment = bounding-box lower-left corners.
- Slab thickness 0.15 m; railing height 1.0 m; handrail height 0.9 m; riser target 0.17 m; going clamped 0.22–0.30 m; flight width ≤ 1.25 m and ≤ half the well's short side.
- Stair well = stair room (`stair`, `thang` in the normalised name) with a stair room overlapping it ≥ 50 % on the level above. Light well = room of type `courtyard` whose name contains `gieng troi` or `light well`, present on the level above at the same place (≥ 50 % overlap).
- Old projects (all level 0) render and behave exactly as today.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A plan with one block, or blocks of very different size: no crash; the button hides (one block) or the dialog warns (smaller < 50 % of larger) and still merges.
- Re-deriving rooms after a wall edit on level 1 must not wipe level-0 rooms (rooms are derived per level) — test in Task 4.
- Saving after a merge from a client that does not send `level` (the co-pilot) must not drop levels — test in Task 1.
- A stair well that is not a rectangle, or narrower than 1.5 m: still produces a stair inside it (inscribed rectangle, flights at half width) — test in Task 7.
- Walking into a stair or light-well hole on level 1 must be blocked by the railing — test in Task 8.

---

## Phase 1 — Levels, Merge, 2D level switch

### Task 1: `Level` on every element (backend)

**Files:**
- Modify: `backend/src/Plan2Space.Domain/Entities/{Wall,Room,Opening,FurnitureItem}.cs` — `public int Level { get; set; }`
- Modify: `backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs` — inputs + validation + mapping
- Modify: `backend/src/Plan2Space.Application/Geometry/Queries/GetGeometryQuery.cs` — DTOs
- Modify: `backend/src/Plan2Space.Application/Copilot/Commands/InterpretCopilotMessageCommand.cs` — pass levels through
- Create: migration `AddLevels` (`dotnet ef migrations add AddLevels --project src/Plan2Space.Infrastructure --startup-project src/Plan2Space.API`)
- Test: `backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs`, `CopilotControllerTests.cs`

**Interfaces:**
- Produces: `WallInput(..., int Level = 0)`, `RoomInput(..., int Level = 0)`, `OpeningInput(..., int Level = 0)`, `FurnitureInput(..., int Level = 0)` (append as the last optional parameter of each record); DTOs gain `int Level` (last, default 0); JSON field `level`.

- [ ] **Step 1: Write the failing tests** — `Levels_RoundTrip_AndDefaultToZero` (save a wall, room, opening and furniture with `level = 1`, reload, all `level == 1`; save again without `level`, all `0`); `[Theory] InvalidLevel_Returns400` for `level = -1`, `level = 10`, and an opening with `level = 1` on a wall with `level = 0`; `ACopilotEdit_KeepsLevels` (seed with `level = 1`, run the add_opening intent, the seeded wall/room/door still `level == 1`).
- [ ] **Step 2: Run** `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter "FullyQualifiedName~Level"` — Expected: FAIL (`level` missing / not 400).
- [ ] **Step 3: Implement** the entity properties, record parameters, validation (`GeometryValidationException("level must be 0-9")`, `"An opening's level must match its wall's level"`), mapping in save and load, co-pilot pass-through; add the migration.
- [ ] **Step 4: Run** `dotnet test backend/Plan2Space.sln` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: every wall, room, opening and furniture item has a level`.

### Task 2: Levels in the web model, block detection and the merge function

**Files:**
- Modify: `plan2space-web/src/services/geometryService.ts` — `level?: number` on `Wall`, `Room`, `Opening`, `FurnitureItem`; save payload types
- Modify: `plan2space-web/src/stores/geometryStore.ts` — save payload sends `level: x.level ?? 0` for all four
- Create: `plan2space-web/src/lib/levels.ts`
- Test: `plan2space-web/tests/levels.test.ts`

**Interfaces:**
- Produces:
  - `levelOf(x: { level?: number }): number` (→ `x.level ?? 0`)
  - `interface Block { wallIds: string[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }`
  - `findBlocks(walls: Wall[]): Block[]` — sorted by bounding-box area descending; blocks under 20 m² dropped
  - `interface MergePlan { lower: Block; upper: Block; offset: Point; sizeMismatch: boolean }`
  - `planMerge(walls: Wall[]): MergePlan | null` — `null` unless all walls are level 0 and ≥ 2 blocks; lower = the block with smaller `minX`; `offset = lower.bounds.min − upper.bounds.min`; `sizeMismatch` when smaller area < 50 % of larger
  - `mergeFloors(plan: PlanData, merge: MergePlan, heights: [number, number]): PlanData` where `PlanData = { walls; rooms; openings; furniture }` — moves every element of the upper block (walls by id; rooms/furniture by centroid/position inside the upper bounds; openings by their wall) by `offset`, sets `level = 1`; sets each wall's `heightMeters` to `heights[level]`
  - `storeyHeight(walls: Wall[], level: number): number` and `levelElevation(walls: Wall[], level: number): number`

- [ ] **Step 1: Write the failing tests** using the reference plan's two outlines (two 10 × 13.6 m rectangles of walls at x 0–10 and 20–30, a 2.8 × 3.8 stair room in each at the same local place): `findBlocks` returns 2 blocks; `planMerge` → `lower.bounds.minX === 0`, `offset ≈ { x: -20, y: 0 }`, `sizeMismatch === false`; one block → `planMerge === null`; blocks 136 m² and 40 m² → `sizeMismatch === true`; `mergeFloors` moves an upper wall from x 20 to x 0, sets its `level` 1, a lower wall keeps level 0, heights become 3.6 / 3.5, an upper room's points and an upper opening's position move by −20; `levelElevation(walls, 1) === 3.6`.
- [ ] **Step 2: Run** `npx vitest run tests/levels.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/levels.ts` (blocks: union-find over walls whose buffered slabs (thickness/2 + 0.25 m) intersect, using segment distance from `planGeometry`), the `level` fields and the save payload.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: find a plan's floor blocks and merge them into levels`.

### Task 3: Merge button, dialog and store action

**Files:**
- Modify: `plan2space-web/src/stores/geometryStore.ts` — `mergeLevels(heights: [number, number]): Promise<string | null>`
- Create: `plan2space-web/src/components/studio/MergeFloorsDialog.tsx`
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` — button **Ghép tầng**, shown when `planMerge(walls) !== null`
- Test: `plan2space-web/tests/mergeFloors.test.tsx`

**Interfaces:**
- Consumes: `planMerge`, `mergeFloors` (Task 2).
- Produces: store action `mergeLevels(heights, swap = false)` — swaps lower/upper when `swap`; snapshots, applies `mergeFloors`, marks walls edited, calls `saveToServer`; on failure restores the snapshot and returns the server message, else `null`.

- [ ] **Step 1: Write the failing tests** — the dialog lists "Tầng 1: khối trái / Tầng 2: khối phải", **Đảo** swaps the text, height inputs default 3.6 and 3.5 and reject values outside 2.2–6.0, **Ghép** calls `mergeLevels([3.6, 3.5], false)`; the store action with a mocked `saveGeometry` leaves upper walls at level 1 and x − 20; with `saveGeometry` rejecting, the plan equals the snapshot and the message is returned; the size-mismatch warning text shows when `sizeMismatch`.
- [ ] **Step 2: Run** `npx vitest run tests/mergeFloors.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the action, the dialog (Vietnamese copy as above; warning "Hai khối này có vẻ không phải các tầng của cùng một nhà"), the toolbar button.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: merge the floors of a side-by-side plan into one two-storey house`.

### Task 4: 2D level switch

**Files:**
- Modify: `plan2space-web/src/stores/editorStore.ts` — `level: number`, `setLevel(level: number)`
- Modify: `plan2space-web/src/components/studio/Canvas2D/{WallLayer,RoomLayer,OpeningLayer,FurnitureLayer}.tsx`, `useWallTool.ts`, `useOpeningTool.ts`, `CanvasEditor.tsx` (furniture placement) — show/snap/pick only `levelOf(x) === level`; new elements get `level`
- Modify: `plan2space-web/src/stores/geometryStore.ts` — room re-derivation per level
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` — **Tầng 1 / Tầng 2** buttons when levels > 1
- Test: `plan2space-web/tests/levelSwitch.test.tsx`

**Interfaces:**
- Consumes: `levelOf` (Task 2).
- Produces: `useEditorStore().level`; `levelsIn(walls: Wall[]): number[]` added to `lib/levels.ts`.

- [ ] **Step 1: Write the failing tests** — with walls on levels 0 and 1, `WallLayer` renders only level-0 lines after `setLevel(0)` and only level-1 after `setLevel(1)`; `addWall` while on level 1 creates a level-1 wall; a placed opening and furniture take the current level; saving with `wallsEdited` derives rooms by calling `deriveRooms` once per level with only that level's walls and keeps each level's rooms (level-0 rooms survive a level-1 edit); the toolbar shows the switch only when `levelsIn(walls).length > 1`.
- [ ] **Step 2: Run** `npx vitest run tests/levelSwitch.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Rooms derived for level L carry `level: L`; the label/paint carry-over looks only at the previous rooms of level L.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: edit a multi-storey plan one level at a time`.

## Phase 2 — 3D stacking, slabs, light wells

### Task 5: Levels stacked in 3D

**Files:**
- Modify: `plan2space-web/src/components/studio/Viewer3D/HouseModel.tsx` — one `<group position={[0, 0, levelElevation(walls, L)]}>` per level containing that level's walls (joints computed per level), floors, openings, furniture
- Modify: `Viewer3D/OpeningModels.tsx`, `Viewer3D/FurnitureModels.tsx` — accept `openings`/`walls`/`rooms` and `furniture` as props instead of reading the whole store
- Modify: `Viewer3D/floorPlan.ts` — `wallHeight` stays per list
- Test: `plan2space-web/tests/stacking.test.ts`

**Interfaces:**
- Consumes: `levelsIn`, `levelElevation`, `levelOf`.
- Produces: `levelScene(plan: PlanData, level: number): PlanData` in `lib/levels.ts` (filters by level); `HouseModel` unchanged externally.

- [ ] **Step 1: Write the failing tests** — `levelScene` returns only that level's elements; wall joints for level 1 ignore level-0 walls (a level-1 wall ending over a level-0 wall gets no extension); `levelElevation` for a merged reference plan is 0 and 3.6.
- [ ] **Step 2: Run** `npx vitest run tests/stacking.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: stack each level at its elevation in 3D`.

### Task 6: Slabs with holes, roof, light wells, railings

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/slabs.ts` (pure)
- Create: `plan2space-web/src/components/studio/Viewer3D/LevelShell.tsx` (renders slab, glass panes, railings, pebble floor)
- Modify: `Viewer3D/HouseModel.tsx`, `Viewer3D/floorPlan.ts` (floor kind `pebble`), `Viewer3D/textures.ts` (pebble texture)
- Modify: `plan2space-web/src/lib/roomTypes.ts` — `isStairName(label)`, `isLightWellName(label)`
- Test: `plan2space-web/tests/slabs.test.ts`

**Interfaces:**
- Consumes: `levelScene`, `levelElevation`, `polygonArea`, `pointInPolygon`.
- Produces:
  - `stairWells(rooms: Room[], level: number): Room[]` and `lightWells(rooms: Room[], level: number): Room[]` — rooms on `level` with a matching room on `level + 1` overlapping ≥ 50 %
  - `slabOutline(rooms: Room[], upperLevel: number): { outer: Point[][]; holes: Point[][] }` — outer = the upper level's rooms, holes = the stair and light wells below it
  - `railingRuns(hole: Point[], walls: Wall[]): [Point, Point][]` — hole edges (or parts of them) not covered by a wall of that level within half its thickness
  - `SLAB_THICKNESS_M = 0.15`, `RAILING_HEIGHT_M = 1.0`

- [ ] **Step 1: Write the failing tests** with the merged reference plan's rooms: `stairWells(rooms, 0)` has one room; `lightWells(rooms, 0)` has two; `slabOutline(rooms, 1).holes` has 3 polygons at those rooms; `railingRuns` for light well 1 on level 1 returns only its edges without walls (a well fully walled on 4 sides → `[]`; a well open on one side → that side); a level-0 light well floor gets kind `pebble`.
- [ ] **Step 2: Run** `npx vitest run tests/slabs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the pure functions and `LevelShell` (slab: `THREE.Shape` with holes extruded 0.15 m under the upper level; roof panes: transparent `meshPhysicalMaterial` over top-level light wells at the top wall height; railings: posts every 1.2 m + top rail + infill panel at opacity 0.25).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run build` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: slabs between levels with stair and light-well holes, railings and a glass roof`.

## Phase 3 — Stair and walking

### Task 7: Generated stair

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/stairs.ts` (pure)
- Create: `plan2space-web/src/components/studio/Viewer3D/StairModel.tsx`
- Modify: `Viewer3D/HouseModel.tsx` — a `StairModel` per stair well on each level
- Test: `plan2space-web/tests/stairs.test.ts`

**Interfaces:**
- Consumes: `stairWells` (Task 6), `levelElevation`.
- Produces:
  - `interface Tread { x: number; y: number; w: number; d: number; top: number }` (plan-space box centre, width along x, depth along y, top height above the level)
  - `interface StairPlan { treads: Tread[]; landing: Tread; handrails: [Point3, Point3][]; footprint: Point[]; surfaceHeight(p: Point): number | null }`
  - `stairGeometry(well: Point[], rise: number, entry: Point | null): StairPlan` — `entry` = the door opening position of the well, else `null`
  - `RISER_TARGET_M = 0.17`, `FLIGHT_MAX_WIDTH_M = 1.25`

- [ ] **Step 1: Write the failing tests** — reference well 2.8 × 3.8 m, rise 3.6: `treads.length + 1 === 21` risers (the landing is one riser), riser height ≈ 0.1714, highest tread `top === 3.6`, every tread inside the well, flight width ≤ 1.25; the first tread sits at the well end nearest `entry`; `surfaceHeight` is 0 at the bottom, 1.8 on the landing, 3.6 at the top, `null` outside the footprint; a 1.4 m-wide well → flights 0.7 m; an L-shaped well → all treads inside its inscribed rectangle.
- [ ] **Step 2: Run** `npx vitest run tests/stairs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the dog-leg: long axis of the well rectangle, two flights side by side, landing across the far end at half rise; `StairModel` renders treads, landing, stringers and handrails (0.9 m).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run build` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: generate a dog-leg stair in each stair well`.

### Task 8: Walking up and down

**Files:**
- Modify: `plan2space-web/src/lib/walkPhysics.ts` — `groundHeight`, `levelAt`, railing blockers
- Modify: `plan2space-web/src/components/studio/Walk/WalkMode.tsx` — per-frame ground height and level; blockers per level + railings + stair sides
- Test: `plan2space-web/tests/walkLevels.test.ts`

**Interfaces:**
- Consumes: `stairGeometry`, `railingRuns`, `levelElevation`, `levelScene`.
- Produces: `groundHeight(p: Point, level: number, stairs: StairPlan[], elevations: number[]): number`; `nextLevel(p: Point, level: number, stairs: StairPlan[], elevations: number[]): number` (switches up at the top tread, down at the bottom); `railingBlockers(runs: [Point, Point][]): Blocker[]` (halfWidth 0.05).

- [ ] **Step 1: Write the failing tests** — on the reference house: standing on tread k gives `groundHeight` equal to its top; stepping off the top tread onto level 1 floor gives 3.6 and `nextLevel === 1`; walking back down returns level 0; `stepPlayer` against a light-well railing on level 1 stops the player 0.3 m from the run; the stair's open side toward the landing void is blocked on level 1.
- [ ] **Step 2: Run** `npx vitest run tests/walkLevels.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; the eye eases to `groundHeight + EYE_HEIGHT_M` over 0.15 s.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run build` — Expected: all pass.
- [ ] **Step 5: Commit** `feat: walk up and down the stair between levels`.

### Task 9: Whole-stack check

- [ ] **Step 1:** Python (`cd ai-service && .venv/Scripts/python -m pytest -q`), web (`npx vitest run && npx tsc --noEmit && npm run build`), .NET (`dotnet test backend/Plan2Space.sln`) — all green.
- [ ] **Step 2:** `docker compose up -d --build --wait` → the `AddLevels` migration applied (`\d "Walls"` shows `Level`).
- [ ] **Step 3:** Through the API as a test user: import `nha_2tang_pa_a.dxf`, save a merged plan built by `mergeFloors` (via a vitest-free node script or the probe page), reload → levels 0/1, walls at 3.6/3.5.
- [ ] **Step 4:** Probe page (not committed) rendering the merged reference house with the app's modules: screenshots from outside (stacked floors), inside the ground-floor stair well looking up the stair, from level 1 into a light well (railing, glass above). Delete the probe files.
- [ ] **Step 5:** Hand the interactive check to the user (Merge in the real app, switch levels, walk up the stair).
