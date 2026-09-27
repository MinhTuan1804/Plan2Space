# Realism and Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 3D view and walk mode:
- HDRI lighting, SSAO, soft shadows and bloom, behind a Cao/Thấp quality switch;
- real PBR floor materials, chosen per room;
- doors that open, a garage door that rolls up, and room lights.

**Architecture:**
- A `FloorMaterial` room field follows the `WallColor` path end to end.
- CC0 assets are built by a committed script into `public/materials` and `public/hdri`.
- Pure helpers in `src/lib/` hold the rules: `floorMaterials`, `interaction` and `quality`.
- R3F components read the quality setting and the viewing state from `editorStore`.

**Tech Stack:**
- ASP.NET Core 8 + EF Core;
- React 18, R3F, drei (`Environment`, `SoftShadows`, `PerformanceMonitor`), and the new dependency `@react-three/postprocessing` (`N8AO`, `Bloom`);
- `sharp`, from `tools/furniture`'s node_modules, for the asset script.

**Spec:** `docs/superpowers/specs/2026-09-27-realism-interaction-design.md`

## Global Constraints

- Quality:
  - `'high' | 'low'`, default high, stored in `localStorage['p2s.quality']` with try/catch round every access;
  - automatic downgrade only when a decline comes within the first 5 s, and only once;
  - low quality turns off SSAO, soft shadows and bloom, and uses 512 px textures.
- Lighting values:
  - HDRI at `/hdri/sky_1k.hdr`, not drawn as the background; `environmentIntensity` 1 by day and 0.15 at night;
  - hemisphere light at 40 % of `SKY_LIGHT.intensity` by day (the night rule stays);
  - SoftShadows size 25, samples 10, focus 0;
  - N8AO aoRadius 0.5, intensity 2, distanceFalloff 1;
  - Bloom luminanceThreshold 0.9, intensity 0.3.
- Materials:
  - ids `wood_oak, wood_walnut, wood_light, marble, ceramic_tile, terrazzo, pebbles, concrete`;
  - files `public/materials/<id>/{color,normal,roughness}_{1k,512}.webp`;
  - default rules:
    - bathroom → ceramic_tile;
    - kitchen → terrazzo;
    - courtyard → pebbles;
    - garage → concrete;
    - balcony → ceramic_tile;
    - otherwise wood_oak;
  - walls take roughness 0.9;
  - glass on high quality is physical with transmission 1, roughness 0.05 and thickness 0.01.
- `FloorMaterial` on the server is null or one of the eight ids; anything else is a 400. The column's max length is 32.
- Doors:
  - open to ±90° over 0.6 s with smoothstep, closed by default;
  - a garage door rolls to 10 % height, moving up 90 % of the opening height, over 1.2 s.
- Lights:
  - #ffd9a0, intensity 8, distance 1.5 × the larger side of the room's box, decay 2, no shadow;
  - placed 0.3 m below the ceiling at the room's interior point;
  - the override wins, otherwise the light is on at night.
- Walk keys: E acts on the door in sight within 2.5 m, L on the light of the room the walker is in. The hint reads "E: mở/đóng cửa · L: đèn".
- Asset downloads come only from ambientCG.com and polyhaven.com (CC0), with each source recorded in `public/materials/SOURCES.md`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A texture or HDRI that 404s. The scene must still render: that surface falls back to today's look (error boundary plus `Suspense`).
2. An older room with no `floorMaterial`, or an unknown id from the server. It must show the default for its type.
3. The quality switch while the 3D view is open. It must not leak GPU textures or leave the composer mounted on low.
4. The E key with no door in sight, or with only a window in sight. Nothing may happen and nothing may throw.
5. Many rooms with lights on at night (for example 25 rooms). The frame rate matters, so point lights must cast no shadows.

---

### Task 1: Floor material per room, server to panel

**Files:**
- Modify: `backend/src/Plan2Space.Domain/Entities/Room.cs`, `backend/src/Plan2Space.Infrastructure/Persistence/Plan2SpaceDbContext.cs` (max length 32), `backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs` (`RoomInput` gains `string? FloorMaterial = null` and validation), `backend/src/Plan2Space.Application/Geometry/Queries/GetGeometryQuery.cs` (`RoomDto` gains it), `backend/src/Plan2Space.Application/Copilot/Commands/InterpretCopilotMessageCommand.cs` (passes it through)
- Migration: `AddRoomFloorMaterial`
- Modify: `plan2space-web/src/services/geometryService.ts` (`Room.floorMaterial?: string | null`, and the save payload), `plan2space-web/src/stores/geometryStore.ts` (save mapping; add `setRoomFloorMaterial(id, material | null)` next to the wall-colour setter), `plan2space-web/src/components/studio/Canvas2D/RoomPanel.tsx` ("Sàn" select)
- Create: `plan2space-web/src/lib/floorMaterials.ts`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs` (new facts), `plan2space-web/tests/floorMaterials.test.tsx`

**Interfaces:**
- Produces:
  - `FLOOR_MATERIALS: { id: FloorMaterialId; name: string; tileM: number }[]`, with names Gỗ sồi, Gỗ óc chó, Gỗ sáng, Đá hoa, Gạch men, Terrazzo, Sỏi, Bê tông and tileM 2, 2, 2, 1.5, 1, 1.5, 1, 2;
  - `defaultFloorMaterial(type: RoomType | null) -> FloorMaterialId`;
  - `floorMaterialOf(room: Room) -> FloorMaterialId`, which falls back to the default when the id is unknown (Review Focus 2).

- [ ] **Step 1:** Write the tests:
  - .NET `FloorMaterial_RoundTrips_AndNullClears` and `UnknownFloorMaterial_Returns400`;
  - web: `defaultFloorMaterial` for each rule, `floorMaterialOf` with an unknown id, and the RoomPanel select calling `setRoomFloorMaterial` and being saved in the payload.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, following `WallColor` line for line. The server validates against the same eight ids.
- [ ] **Step 4:** Run `dotnet test backend/Plan2Space.sln` and `npx vitest run && npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5:** Commit `feat: floor material per room`.

### Task 2: CC0 assets

**Files:**
- Create: `tools/materials/build.mjs`, `tools/materials/sources.json`, `plan2space-web/public/materials/SOURCES.md`, `plan2space-web/public/materials/<id>/*.webp`, `plan2space-web/public/hdri/sky_1k.hdr`
- Test: `tools/materials/build.test.mjs` (node:test)

**Interfaces:**
- Produces: the files named in Global Constraints. `sources.json` holds `{ id, page, zip }` per material and `{ page, file }` for the HDRI.

- [ ] **Step 1:** Write `build.test.mjs`. For a 64 × 64 test PNG, `resizeSet(input, outDir, 'color')` writes `color_1k.webp` and `color_512.webp` with widths `min(1024, w)` and `min(512, w)`.
- [ ] **Step 2:** Run `node --test tools/materials`. Expected: FAIL.
- [ ] **Step 3:** Implement `resizeSet`. `build.mjs` downloads each zip into `tools/materials/.cache/` (git-ignored), unzips, maps `*_Color`, `*_NormalGL` and `*_Roughness` to color, normal and roughness, and writes the WebP files. The HDRI is copied as is. Pick ambientCG assets per id (a wood floor, marble, ceramic tiles, terrazzo, pebbles, concrete), at 1K or 2K, and record the chosen pages in `sources.json` and `SOURCES.md`.
- [ ] **Step 4:** Run `node --test tools/materials && node tools/materials/build.mjs`. Expected: tests pass, 8 × 6 WebP files plus the HDRI exist, and the total size is under 8 MB.
- [ ] **Step 5:** Commit the script, the sources and the built assets (the cache stays out): `feat: CC0 floor materials and sky`.

### Task 3: Quality and lighting

**Files:**
- Create: `plan2space-web/src/lib/quality.ts`, `plan2space-web/src/components/studio/Viewer3D/Atmosphere.tsx`
- Modify: `plan2space-web/src/stores/editorStore.ts` (`quality`, `setQuality`), `Scene.tsx`, `Walk/WalkMode.tsx` (mount `<Atmosphere />`, add the HUD toggle), `package.json` (`@react-three/postprocessing`)
- Test: `plan2space-web/tests/quality.test.ts`

**Interfaces:**
- Produces:
  - `loadQuality(): Quality` and `saveQuality(q)`, with try/catch;
  - `shouldDowngrade(elapsedS: number, alreadyDowngraded: boolean) -> boolean`, true only when `elapsedS <= 5` and not already downgraded;
  - `<Atmosphere />` renders, inside a canvas:
    - `<Environment files="/hdri/sky_1k.hdr" environmentIntensity={night ? 0.15 : 1} />` wrapped in an error boundary;
    - on high quality, `<SoftShadows …/>` and `<EffectComposer><N8AO …/><Bloom …/></EffectComposer>`;
    - `<PerformanceMonitor onDecline={…}>`, which applies `shouldDowngrade`.

- [ ] **Step 1:** Write the tests:
  - `shouldDowngrade(3, false) = true`, `(6, false) = false`, `(3, true) = false`;
  - `loadQuality` returns high when `localStorage.getItem` throws;
  - `setQuality('low')` persists.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Run `npm i @react-three/postprocessing@^2` (the version that works with R3F 8, React 18 and three 0.169), then implement. The hemisphere light takes the 40 % day factor in `Scene` and `WalkMode`.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p . && npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: environment lighting, SSAO, soft shadows, bloom and a quality switch`.

### Task 4: PBR floors and glass

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/pbr.ts` (texture cache), `plan2space-web/src/components/studio/Viewer3D/FloorMaterialMesh.tsx`
- Modify: `HouseModel.tsx` (`Floor` renders through the PBR material, with today's `floorTexture` as the fallback), `buildWallGeometry`/wall material (roughness 0.9), `OpeningModels.tsx` (`WindowFrame` glass on high quality)
- Test: `plan2space-web/tests/pbr.test.ts`

**Interfaces:**
- Consumes: `floorMaterialOf` (Task 1) and `quality` (Task 3).
- Produces:
  - `texturePaths(id, quality) -> { color, normal, roughness }`;
  - `planUVs(geometry, tileM)`, which sets the `uv` attribute from plan x/y divided by `tileM`;
  - `<PbrFloor points holes material quality />`, which suspends while loading and is wrapped by the caller in an error boundary that renders today's `Floor`.

- [ ] **Step 1:** Write the tests:
  - `texturePaths('marble', 'low')` points at the `_512.webp` files;
  - `planUVs` on a 2 × 1 shape with tileM 1 gives UVs spanning 0..2 by 0..1;
  - the cache returns the same object for the same id and quality.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - load with `useTexture` from drei;
  - the colour map is `SRGBColorSpace`;
  - wrapping is `RepeatWrapping`;
  - anisotropy is 8 on high quality and 1 on low.
  - Switching quality swaps the textures. The cache holds both sizes, and nothing is disposed while it is in use (Review Focus 3).
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p . && npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: PBR floors per room and glass`.

### Task 5: Doors and lights

**Files:**
- Create: `plan2space-web/src/lib/interaction.ts`, `plan2space-web/src/components/studio/Viewer3D/RoomLights.tsx`
- Modify: `editorStore.ts` (`openDoors`, `toggleDoor`, `lightsOverride`, `toggleLight`), `OpeningModels.tsx` (animated leaf rotation from closed to open; garage roll), `HouseModel.tsx` (mount `RoomLights` per level), `InfoCard.tsx` (the buttons)
- Test: `plan2space-web/tests/interaction.test.tsx`

**Interfaces:**
- Produces:
  - `doorOpenFraction(elapsedS, durationS) -> 0..1`, a smoothstep;
  - `lightOn(roomId, overrides, night) -> boolean`;
  - `roomLight(room, ceilingZ) -> { position: [x, y, z], distance }`, in plan coordinates within the level group;
  - `<RoomLights rooms height night />`.

- [ ] **Step 1:** Write the tests:
  - the fraction is 0, 0.5 and 1 at 0, 0.3 and 0.6 s over 0.6 s;
  - `lightOn` is true for an override `true` by day, false for an override `false` at night, and follows `night` without an override;
  - `roomLight` on a 4 × 3 room with a ceiling at 3.6 is at z 3.3 with distance 6;
  - InfoCard: "Mở cửa" toggles `openDoors` and then reads "Đóng cửa"; "Bật đèn" sets the override.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The `Door` leaf's `rotationY` becomes `layout.rotationY × fraction`, animated in `useFrame` towards the target.
  - The garage group scales in z and moves up by the fraction.
  - Point lights get `castShadow={false}` (Review Focus 5), plus an emissive disc of 0.15 m radius.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p . && npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: doors that open and room lights`.

### Task 6: Walk-mode keys

**Files:**
- Modify: `plan2space-web/src/lib/interaction.ts` (`doorInSight`), `Walk/WalkMode.tsx` (E and L handlers, hint text)
- Test: `plan2space-web/tests/interaction.test.tsx` (more cases)

**Interfaces:**
- Consumes: `toggleDoor`/`toggleLight` (Task 5) and `levelScene`.
- Produces: `doorInSight(eye: {x, y, h}, look: {x, y, h}, openings, walls, maxM = 2.5) -> string | null`. It takes the nearest door whose opening rectangle (width along its wall segment, from its sill up to `DOOR_HEIGHT_M`) the ray crosses within `maxM`. Windows are ignored.

- [ ] **Step 1:** Write the tests:
  - a door 2 m ahead is hit;
  - a door 3 m ahead is null;
  - looking away gives null;
  - a window ahead gives null (Review Focus 4);
  - of two doors in line, the nearer one is returned.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The `Player` keeps the eye and look in refs.
  - A `keydown` listener, active only while pointer-locked, handles E (`doorInSight` → `toggleDoor`) and L (the room under the walker on its level → `toggleLight`).
  - The hint line is extended.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit -p . && npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: open doors and switch lights while walking`.
