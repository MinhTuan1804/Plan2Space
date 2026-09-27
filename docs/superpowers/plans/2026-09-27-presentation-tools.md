# Presentation Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real sun study, a per-level minimap, plan-to-3D fly-to with saved views, and click-to-inspect and measure in 3D. Location, north and views are saved per project.

**Architecture:**
- A JSON `ViewSettings` column on Project, served by its own GET/PUT endpoints.
- On the web, a small settings store loads and saves it.
- Pure helpers in `src/lib/` (`sunPosition`, `miniMap`, `cameraViews`, `measure`) carry the maths.
- Components mount over the existing 3D `Scene` and `WalkMode`. Camera moves go through one `CameraRig` that consumes `editorStore.flyTo`.

**Tech Stack:**
- ASP.NET Core 8 + EF Core (MediatR handlers, xUnit + Testcontainers);
- React 18 + Zustand + R3F/drei (vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-27-presentation-tools-design.md`

## Global Constraints

- The settings JSON shape and validation are exactly the spec's:
  - `lat` within −90..90, `lon` within −180..180, `northDeg` within 0..360;
  - at most 20 views, each name 1–60 characters after trimming, each view's level 0..9;
  - every coordinate finite and within ±10 000.
- Defaults: `{ location: { lat: 10.776, lon: 106.700 }, northDeg: 0, views: [] }`.
- `northDeg` is measured clockwise from the plan's +y axis. Plan (x, y, h) maps to world (x, h, −y).
- The sun is within 1° of NOAA. Hours 5:00–19:00 in 15-minute steps. ▶ plays in about 10 s. At night the directional light is off and the hemisphere light is at 25 %. By day the intensity is `SUN_INTENSITY × clamp(sin(alt), 0.3, 1)`.
- The minimap is 200 × 200 px, with a 5 % margin, plan y up.
- A fly-to lasts 0.8 s with smoothstep easing.
- `roomView`: the target is the room's interior point at 1.2 m above its level. The camera is at the south-east (+x, −y), 45° up, at a distance of 1.2 × the larger side of the room's box.
- Measures show metres to two decimals. Areas show m² to one decimal.
- UI copy in Vietnamese as the spec gives it: "Lưu góc nhìn", "Đo", "Tuỳ chỉnh", "Không lưu được cài đặt xem", "Tầng N".
- 2D and 3D are side by side in `StudioPage`. A double-click on a room in 2D flies the visible 3D view; there is no tab to switch.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Settings saved while an earlier save is still in flight. The last write must win, and the panel must not flicker back to an old value.
2. A saved view on level 1 of a house that has since lost level 1, or has not been merged yet. Flying there must clamp to the existing levels and not throw.
3. Walk-mode minimap teleport onto a stair well hole or outside the house. Nothing must happen: no fall, no teleport.
4. A pick on a mesh inside a GLB (a child of the furniture group). The card must find `pick` on an ancestor.
5. Sun at polar-ish values (lat ±66 in December/June) and exactly at the horizon. `sunDirection` must not return NaN, and the light must switch off cleanly.

---

### Task 1: View settings on the server

**Files:**
- Modify: `backend/src/Plan2Space.Domain/Entities/Project.cs` (add `public string? ViewSettings { get; set; }`)
- Create: `backend/src/Plan2Space.Application/Projects/ViewSettings.cs` (records + validation), `backend/src/Plan2Space.Application/Projects/Queries/GetViewSettingsQuery.cs`, `backend/src/Plan2Space.Application/Projects/Commands/SaveViewSettingsCommand.cs`, `backend/src/Plan2Space.API/Controllers/ViewSettingsController.cs`
- Migration: `dotnet ef migrations add AddViewSettings -p src/Plan2Space.Infrastructure -s src/Plan2Space.API`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/ViewSettingsControllerTests.cs`

**Interfaces:**
- Produces:
  - `GET /api/projects/{projectId}/view-settings` → 200 with `{ location: {lat, lon}, northDeg, views: [{name, level, position: [x,y,z], target: [x,y,z]}] }`, or 404 when the project is missing or someone else's;
  - `PUT` of the same body → 204, or 400 with `{ message }`.
- Records: `LocationDto(double Lat, double Lon)`, `SavedViewDto(string Name, int Level, double[] Position, double[] Target)`, `ViewSettingsDto(LocationDto Location, double NorthDeg, List<SavedViewDto> Views)` with `static ViewSettingsDto Default`.
- `ViewSettingsDto.Validate() -> string?` returns the error message, or null.

- [ ] **Step 1:** Write the tests, using `AuthedProjectAsync` from `GeometryControllerTests` and `ProjectTestHelpers`:
  - `Defaults_WhenNeverSaved` (GET → HCMC, northDeg 0, empty views);
  - `RoundTrip` (PUT one view, then GET it back equal);
  - `[Theory] Invalid_Returns400` with one case per rule: lat 91, lon −181, northDeg 361, 21 views, empty name, a 61-character name, level 10, position length 2, coordinate 1e5;
  - `OtherUsersProject_Returns404`.
- [ ] **Step 2:** Run `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter ViewSettings`. Expected: FAIL (404 route missing).
- [ ] **Step 3:** Implement:
  - the entity property and the migration;
  - the handlers, which load by `ProjectId` and `OwnerId`, the same owner rule as `GetGeometryQuery`;
  - GET deserialises with `System.Text.Json` (web defaults) and falls back to `Default` when the column is null or invalid;
  - PUT validates, serialises and saves;
  - the controller follows `GeometryController`'s `CurrentUserId` pattern.
  `Validate` checks `double.IsFinite` on every number.
- [ ] **Step 4:** Run `dotnet test backend/Plan2Space.sln`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: per-project view settings (location, north, saved views)`.

### Task 2: Web settings store and editor state

**Files:**
- Create: `plan2space-web/src/services/viewSettingsService.ts`, `plan2space-web/src/stores/viewSettingsStore.ts`
- Modify: `plan2space-web/src/stores/editorStore.ts`, `plan2space-web/src/pages/StudioPage.tsx` (load on project open)
- Test: `plan2space-web/tests/viewSettingsStore.test.ts`

**Interfaces:**
- Produces:
  - `ViewSettings`, `SavedView` TS types matching Task 1; `DEFAULT_VIEW_SETTINGS`.
  - `fetchViewSettings(projectId)` and `saveViewSettings(projectId, s)`, which use the same `api` client as `geometryService.ts`.
  - `useViewSettingsStore`:
    - `{ projectId, settings, saveError: string | null, load(projectId), update(patch: Partial<ViewSettings>) }`;
    - `update` applies at once, then saves. A save that finishes after a newer update does not overwrite it, and the latest update wins (Review Focus 1). A failed save sets `saveError = 'Không lưu được cài đặt xem'`.
  - `editorStore` additions:
    - `flyTo: FlyTo | null`, `setFlyTo`, where `FlyTo = { position: [number, number, number]; target: [number, number, number]; level: number }` in plan coordinates `[x, y, h]`;
    - `sunDate: string` (ISO date, default today), `sunHour: number` (default 14), `setSun(date, hour)`;
    - `tool3d: 'select' | 'measure'`, `setTool3d`;
    - `picked: { kind: 'furniture' | 'opening' | 'room'; id: string } | null`, `setPicked`.

- [ ] **Step 1:** Write the tests, with `viewSettingsService` mocked:
  - `load` puts the fetched settings in;
  - a failed load keeps the defaults;
  - with two quick `update`s where the first save resolves last, the final `settings` and the last saved body are both the second update's;
  - a rejected save sets `saveError`.
- [ ] **Step 2:** Run `npx vitest run tests/viewSettingsStore.test.ts`. Expected: FAIL on import.
- [ ] **Step 3:** Implement. Stale saves are dropped by a sequence number. `StudioPage` calls `load(projectId)` next to the existing geometry load.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5:** Commit `feat: view settings store and presentation editor state`.

### Task 3: Sun study

**Files:**
- Create: `plan2space-web/src/lib/sunPosition.ts`, `plan2space-web/src/components/studio/Viewer3D/SunStudyPanel.tsx`
- Modify: `plan2space-web/src/components/studio/Viewer3D/SunLight.tsx`, `plan2space-web/src/components/studio/Viewer3D/Scene.tsx` (mount the panel)
- Test: `plan2space-web/tests/sunPosition.test.ts`, `plan2space-web/tests/sunStudyPanel.test.tsx`

**Interfaces:**
- Produces:
  - `sunPosition(date: Date, lat: number, lon: number): { altitudeDeg: number; azimuthDeg: number }`, with the azimuth clockwise from north;
  - `sunDirection(altitudeDeg, azimuthDeg, northDeg): [number, number, number]`, a world unit vector towards the sun;
  - `CITIES: { name: string; lat: number; lon: number }[]` with Hà Nội 21.028/105.854, Hải Phòng 20.845/106.688, Đà Nẵng 16.054/108.202, Huế 16.464/107.586, Nha Trang 12.238/109.197, Đà Lạt 11.940/108.458, TP.HCM 10.776/106.700, Cần Thơ 10.045/105.747;
  - `sunTime(date: string, hour: number, lon: number): Date`, the local civil time at UTC+7 (all cities are in Vietnam; the custom lat/lon uses UTC+7 too).

- [ ] **Step 1:** Write the tests:
  - three NOAA cases, each within 1°. Read the values from NOAA's calculator (gml.noaa.gov/grad/solcalc) for Hà Nội 2026-06-21 12:00, TP.HCM 2026-12-21 08:00 and Đà Nẵng 2026-03-21 06:00, all at UTC+7, and write them into the test with their source in a comment;
  - `sunDirection(90, 0, 0)` ≈ `[0, 1, 0]`;
  - `sunDirection(0, 0, 0)` points to world −z (plan +y is north);
  - with `northDeg` 90, azimuth 0 points to world +x;
  - lat 66 on 2026-12-21 at 12:00 gives a finite, non-NaN result (Review Focus 5).
  - `SunStudyPanel`: picking "Đà Nẵng" calls `useViewSettingsStore.update` with its location; the hour slider sets `sunHour`.
- [ ] **Step 2:** Run `npx vitest run tests/sunPosition.test.ts tests/sunStudyPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The NOAA equations: fractional year γ, then the equation of time, declination and hour angle, then the zenith and azimuth. Clamp the `acos` arguments to [−1, 1].
  - `SunLight` reads the store:
    - position = `centre + 40 × sunDirection(...)` (world);
    - `visible = altitude > 0`;
    - intensity = `SUN_INTENSITY × clamp(sin(alt), 0.3, 1)`.
  - `Scene`'s hemisphere light intensity × 0.25 at night.
  - The panel:
    - a city select;
    - "Tuỳ chỉnh" with lat/lon number inputs;
    - a north number input with a rotated arrow;
    - a date input;
    - the hour slider;
    - ▶, which advances `sunHour` by 0.25 every 180 ms from 5 up to 19.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5:** Commit `feat: sun study - real sun for place, date and hour`.

### Task 4: Minimap

**Files:**
- Create: `plan2space-web/src/lib/miniMap.ts`, `plan2space-web/src/components/studio/MiniMap.tsx`
- Modify: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx`, `plan2space-web/src/components/studio/Walk/WalkMode.tsx`
- Test: `plan2space-web/tests/miniMap.test.ts`, `plan2space-web/tests/miniMapComponent.test.tsx`

**Interfaces:**
- Consumes: `levelScene`, `levelsIn` (`lib/levels`), `groundAt` and `WalkLevels` (`lib/walkPhysics`), and `setFlyTo` (Task 2).
- Produces:
  - `mapTransform(bounds: {minX,minY,maxX,maxY}, size: number): { toMap(p: Point): Point; toPlan(q: Point): Point }`, which fits the larger side with a 5 % margin and flips y;
  - `<MiniMap level walls rooms marker={{x, y, headingDeg}} onPick={(p: Point) => void} levels? onLevel? />`, a presentational component.

- [ ] **Step 1:** Write the tests:
  - the `toPlan(toMap(p))` round trip;
  - the plan's top edge maps to the map's top (y flip);
  - a 10 × 5 plan leaves equal vertical margins;
  - the component renders one path per room and calls `onPick` with plan coordinates on click;
  - the level buttons show only with two levels.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - In `Scene`, a small in-canvas hook publishes the orbit target and camera heading to a ref-backed state throttled to 10 Hz. Clicking the map calls `setFlyTo` with the target at the clicked point (height unchanged) and the position moved by the current offset.
  - In `WalkMode`, clicking the map teleports only when `groundAt(p, levelElevation, world) !== null` on the walker's level. On a hole or outside the house nothing happens (Review Focus 3).
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5:** Commit `feat: minimap per level in 3D and walk mode`.

### Task 5: Camera rig, room fly-to and saved views

**Files:**
- Create: `plan2space-web/src/lib/cameraViews.ts`, `plan2space-web/src/components/studio/Viewer3D/CameraRig.tsx`, `plan2space-web/src/components/studio/Viewer3D/ViewsPanel.tsx`
- Modify: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx`, `plan2space-web/src/components/studio/Canvas2D/RoomLayer.tsx` (`onDblClick` / `onDblTap`)
- Test: `plan2space-web/tests/cameraViews.test.ts`, `plan2space-web/tests/viewsPanel.test.tsx`

**Interfaces:**
- Consumes: `interiorPoint` (`lib/planGeometry`), `levelElevation` (`lib/levels`), `flyTo`/`setFlyTo`, and `useViewSettingsStore` (Task 2).
- Produces:
  - `roomView(room: Room, elevation: number): { position: Vec3; target: Vec3 }`, in plan `[x, y, h]`;
  - `ease(t: number): number`, smoothstep;
  - `lerp3(a, b, t)`;
  - `toWorld([x, y, h]) = [x, h, -y]`;
  - `<CameraRig />`, in the canvas, consumes `flyTo` over 0.8 s. It clamps `flyTo.level` to `levelsIn(walls)` and sets `editorStore.level` (Review Focus 2).

- [ ] **Step 1:** Write the tests:
  - `roomView` on a 4 × 3 room at (0..4, 0..3) with elevation 3.6: the target is the interior point at h 4.8, and the position is south-east and 45° up at a distance of 4.8;
  - `ease(0) = 0`, `ease(1) = 1`, `ease(0.5) = 0.5`;
  - `ViewsPanel`: "Lưu góc nhìn" plus a name adds a view through `update`; clicking a view sets `flyTo`; deleting removes it.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - `CameraRig` reads the drei `OrbitControls` via `makeDefault` (`useThree().controls`) and eases the camera and `controls.target`.
  - A room double-click calls `setFlyTo({ ...roomView(room, levelElevation(walls, levelOf(room))), level: levelOf(room) })`.
  - `ViewsPanel` saves the current camera and target, converted back to plan coordinates.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5:** Commit `feat: fly from the plan to a room, saved views`.

### Task 6: Info card and measure

**Files:**
- Create: `plan2space-web/src/lib/measure.ts`, `plan2space-web/src/components/studio/Viewer3D/InfoCard.tsx`, `plan2space-web/src/components/studio/Viewer3D/MeasureTool.tsx`
- Modify: `FurnitureModels.tsx`, `OpeningModels.tsx`, `HouseModel.tsx` (floor meshes), `Scene.tsx` (HUD "Đo" toggle, pointer handling)
- Test: `plan2space-web/tests/measure.test.ts`, `plan2space-web/tests/infoCard.test.tsx`

**Interfaces:**
- Consumes: `picked`/`setPicked` and `tool3d` (Task 2), `useCatalog`, `polygonArea`.
- Produces:
  - `findPick(object: THREE.Object3D): { kind; id } | null`, which walks the ancestors (Review Focus 4);
  - `distance3(a: Vec3, b: Vec3): number`;
  - `formatMetres(d): string`, e.g. `"3.46 m"`;
  - `formatArea(a): string`, e.g. `"19.7 m²"`;
  - `<InfoCard />`, which reads `picked` and the stores.

- [ ] **Step 1:** Write the tests:
  - `findPick` finds `pick` on a grandparent;
  - it returns null on a bare mesh;
  - `distance3([0,0,0], [3,4,0]) = 5`;
  - `formatMetres(3.456) = "3.46 m"`;
  - `InfoCard` for furniture shows the catalog name and "W × D × H m";
  - for an opening it shows "Cửa đi" / "Cửa sổ" and the width, plus the door style;
  - for a room it shows the name, the area and "Tầng 2" for level 1.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - `userData.pick` goes on the furniture group, the opening group and each floor mesh.
  - `Scene`'s canvas `onClick`, in select mode: `setPicked(findPick(e.object))`.
  - In measure mode, the first two clicks set A and B from `e.point`. `MeasureTool` draws a drei `<Line>` and an `<Html>` label. A third click restarts, and Esc clears.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p . && npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: info card and measure in 3D`.
