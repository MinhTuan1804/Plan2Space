# Realism and interaction (project C) — design

## Why

The 3D view looks flat next to sites that present houses well. Three things account for most of the difference:

- lighting: a single sun plus a flat sky, with no environment reflections, no contact darkening and hard shadows;
- materials: floors are painted in code, with no surface relief or roughness;
- a house that cannot be touched: doors do not open and rooms have no lights.

This project fixes those three.

Out of scope:
- path-traced stills;
- baked lightmaps;
- furniture material swaps;
- opening windows;
- doors that block walking.

## Quality setting

- `quality: 'high' | 'low'` lives in `editorStore`.
  - It is remembered in `localStorage` under `p2s.quality`, and every read or write is wrapped in try/catch. It defaults to `'high'`.
  - A "Cao/Thấp" toggle sits in the 3D view's HUD and in walk mode.
- Automatic downgrade uses drei's `PerformanceMonitor` in both canvases.
  - When it reports a decline within the first 5 s, quality switches to `'low'` once.
  - It never switches back up on its own.
- High quality turns on SSAO, soft shadows, bloom and the 1K textures.
- Low quality turns them all off and uses the 512 px textures.

## 1. Lighting

- **Environment.** A 1K HDRI from Poly Haven (CC0) is served at `public/hdri/sky_1k.hdr`.
  - drei's `<Environment files=… />` uses it for image-based lighting and reflections. It is not drawn as a background: the view keeps its current background colour.
  - `environmentIntensity` is 1 by day and 0.15 at night. Night means the sun study's `sun.up` is false.
  - The existing hemisphere light is kept and lowered to 40 % of its current value by day, because the HDRI now carries most of the fill.
- **Soft shadows.** drei's `<SoftShadows size={25} samples={10} focus={0} />`, only when quality is high.
- **Post-processing**, only when quality is high, using the new dependency `@react-three/postprocessing`:
  - an `EffectComposer` with `N8AO` (aoRadius 0.5, intensity 2, distanceFalloff 1);
  - `Bloom` (luminanceThreshold 0.9, intensity 0.3);
  - tone mapping stays the renderer's `NeutralToneMapping`.
- The composer keeps working with the section box: clipping planes stay on the renderer.

## 2. PBR materials

- **Assets.** Eight CC0 materials from ambientCG, each with colour, normal (GL) and roughness maps:
  - `wood_oak`, `wood_walnut`, `wood_light`, `marble`, `ceramic_tile`, `terrazzo`, `pebbles`, `concrete`.
  - They are stored as `public/materials/<id>/{color,normal,roughness}_{1k,512}.webp`.
  - A committed script, `tools/materials/build.mjs`, reads the downloaded 1K/2K PNGs and writes the WebP sizes using `sharp` (already in `tools/furniture`).
  - `public/materials/SOURCES.md` lists each asset's source page and licence.
- **Catalogue.** `lib/floorMaterials.ts`:
  - `FLOOR_MATERIALS: { id, name, tileM }[]`, where `tileM` is the real size one texture repeat covers;
  - `defaultFloorMaterial(type: RoomType | null, areaM2) -> id` maps today's rules:
    - bathroom → ceramic_tile;
    - kitchen → terrazzo;
    - courtyard/light well → pebbles;
    - garage → concrete;
    - balcony → ceramic_tile;
    - otherwise wood_oak.
- **Per-room choice.**
  - Rooms gain an optional `FloorMaterial` string (a DB column, the save input, the DTO and the web `Room.floorMaterial`), taken the same path as `WallColor`.
  - The value is null (automatic) or one of the eight ids; anything else is a 400.
  - The room panel in 2D gets a "Sàn" select: "Tự động" plus the eight names.
- **Floors** render with `MeshStandardMaterial({ map, normalMap, roughnessMap })`.
  - UVs come from plan metres divided by `tileM`, and the colour map is in the sRGB colour space.
  - Textures load through one cached loader per id and size, and are shared across rooms.
- **Walls** keep their per-room paint, with roughness 0.9.
- **Glass** in windows uses `MeshPhysicalMaterial` with transmission 1, roughness 0.05 and thickness 0.01 when quality is high. When quality is low it keeps today's transparent material.

## 3. Interaction

- **Viewing state** in `editorStore`, never saved:
  - `openDoors: Set<string>` of opening ids, with `toggleDoor(id)`;
  - `lightsOverride: Map<string, boolean>` of room ids, with `toggleLight(id)`.
  - A room's light is on when its override says so. Without an override it follows the sun: on at night, off by day.
- **Doors.**
  - An open door's leaf, or leaves, rotate from closed (0) to open (±90°, on the side `doorSwingSign` gives) over 0.6 s. The motion is `doorOpenFraction(elapsed)`, a smoothstep.
  - A garage door's panel rolls up: its height scales to 10 % and it moves up by 90 % of the opening height, over 1.2 s.
  - Doors are closed by default. Today's model is drawn open, so the closed pose is the new rest.
- **Lights.**
  - Each room whose light is on gets a `pointLight` (colour #ffd9a0, intensity 8, distance 1.5 × the larger side of the room's box, decay 2, no shadow).
  - It is placed at the room's interior point, 0.3 m below the ceiling of its level.
  - A small emissive disc marks the fitting.
- **Controls.**
  - In the 3D view (select mode), the InfoCard of a door shows "Mở cửa"/"Đóng cửa", and a room's shows "Bật đèn"/"Tắt đèn".
  - In walk mode:
    - **E** toggles the door the crosshair points at, when it is within 2.5 m;
    - **L** toggles the light of the room the walker stands in.
    - The hint line shows "E: mở/đóng cửa · L: đèn".
  - `lib/interaction.ts` holds `doorInSight(eye, look, openings, walls, maxM = 2.5) -> id | null`. It uses a ray against each door's opening rectangle (width × door height, on its wall line) and is pure and tested.

## Error handling

- A texture or HDRI that fails to load falls back to today's look for that surface (the procedural floor, the plain sky), through an error boundary per floor group and one round the environment. The rest of the scene renders.
- An unknown `floorMaterial` id on the web (for example from an older client) renders the default for the room.

## Testing

Pure logic:
- `defaultFloorMaterial` for each rule;
- `doorOpenFraction` at 0, half and the full time;
- the light rule (override versus night);
- the auto-downgrade rule: only a decline within 5 s, and only once;
- `doorInSight` (hit, beyond range, looking away, a window ignored).

.NET integration:
- a room's `floorMaterial` round-trips;
- null clears it;
- an unknown id is a 400.

Components:
- the room panel "Sàn" select saves;
- the InfoCard door and light buttons toggle the store;
- the quality toggle persists.
