# Presentation tools (project B) — design

## Why

Plan2Space already shows a house in 3D, walks through it, stacks two storeys and cuts sections. To present a design the way Curic Publish does, it still lacks:

- sunlight for the real place and time;
- a map that shows where one is in the house;
- a quick way from the plan to a spot in 3D, and back to saved viewpoints;
- a way to ask "what is this, how big is it, how far is that" by clicking in 3D.

This project adds those four tools to the existing 3D view and walk mode.

Out of scope:
- share links for clients (a separate spec);
- a solid cap for section cuts;
- a 3D sun-path arc.

## Stored settings

Location, north and saved views belong to the project, on the server.

- `Project.ViewSettings`: a new nullable text column holding JSON, added by migration `AddViewSettings`.
- `GET /api/projects/{id}/view-settings` returns the settings, or the defaults when the column is null.
- `PUT /api/projects/{id}/view-settings` validates the body and stores it. Only the project's owner may call either endpoint, the same rule as geometry.

Shape:
```json
{ "location": { "lat": 10.776, "lon": 106.700 }, "northDeg": 0,
  "views": [ { "name": "Phòng khách", "level": 0, "position": [x, y, z], "target": [x, y, z] } ] }
```

- Positions and targets are plan coordinates: `[x, y, height]` in metres, height measured from the ground floor.
- `northDeg` is the angle of north measured clockwise from the plan's +y axis. 0 means north is up on the plan.
- The defaults are Ho Chi Minh City (10.776, 106.700), `northDeg` 0 and no views.

Validation. A body that fails any rule gets 400 with a message:
- `lat` must be within −90..90 and `lon` within −180..180;
- `northDeg` must be within 0..360;
- there may be at most 20 views;
- a view's name must be 1–60 characters after trimming;
- a view's level must be within 0..9;
- every coordinate must be a finite number within ±10 000.

## 1. Sun study

- `lib/sunPosition.ts`: `sunPosition(date: Date, lat: number, lon: number) -> { altitudeDeg, azimuthDeg }`.
  - It uses the NOAA solar-position equations: declination and the equation of time from the fractional year, then the hour angle.
  - The azimuth is measured clockwise from true north.
  - It is written in the project with no dependency. It must agree with NOAA's calculator to within 1°.
- Converting to the scene: the plan's north lies at `northDeg` from +y, and plan y becomes world −z.
  - `sunDirection(altitudeDeg, azimuthDeg, northDeg) -> [x, y, z]` is a unit vector in world space, pointing from the house towards the sun.
- The `SunStudyPanel` over the 3D view offers:
  - a city select: Hà Nội, Hải Phòng, Đà Nẵng, Huế, Nha Trang, Đà Lạt, TP.HCM, Cần Thơ;
  - latitude and longitude inputs, which "Tuỳ chỉnh" fills in;
  - a north dial of 0–359° as a number input with a compass arrow;
  - a date input;
  - an hour slider from 5:00 to 19:00 in 15-minute steps;
  - a ▶ button that runs the slider from 5:00 to 19:00 in about 10 s.
- Date and hour are viewing state, like the section box, and are not saved. Location and north are saved to view settings.
- `SunLight` places its light at `centre + 40 m × sunDirection`.
  - When the altitude is ≤ 0 it switches off the directional light and dims the hemisphere light to 25 %: night.
  - Its intensity scales with `sin(altitude)`, clamped to 0.3..1 of today's value while the sun is up.

## 2. Minimap

- The `MiniMap` is a 200 × 200 px SVG in the bottom-left of the 3D view and of walk mode.
  - It draws the walls and rooms of the level on show and fits the level's bounds with a 5 % margin.
  - Plan y points up the map.
- The level on show:
  - in the 3D view it is `editorStore.level`, with a Tầng 1 / Tầng 2 switch on the map when the house has two levels;
  - in walk mode it is the walker's level.
- The marker is a triangle at the orbit target (3D view) or at the walker (walk mode), pointing the way the camera looks.
- Clicking the map:
  - in the 3D view, flies the camera's target to that plan point and keeps its offset;
  - in walk mode, teleports the walker there if `groundAt` gives a floor at the click on that level, and otherwise does nothing.
- `lib/miniMap.ts` holds `mapTransform(bounds, size) -> { toMap(p), toPlan(q) }`, pure and tested.

## 3. Plan ↔ 3D and saved views

- `editorStore.flyTo`: `{ position: [x,y,z], target: [x,y,z], level } | null`. It is a request the 3D view consumes and then clears.
- A `CameraRig` inside the 3D canvas eases the camera position and the OrbitControls target to the request over 0.8 s (smoothstep), then clears it.
- From the plan: double-clicking a room in 2D switches to the 3D tab and flies to that room.
  - The target is the room's interior point at 1.2 m above its level.
  - The camera sits outside the room's bounding box, at a distance of 1.2 × its larger side and 45° up, from the room's south-east.
  - `roomView(room, elevation) -> { position, target }` in `lib/cameraViews.ts`, pure and tested.
- The `ViewsPanel` over the 3D view:
  - "Lưu góc nhìn" asks for a name (inline input) and saves the current camera position, target and level;
  - each saved view has buttons to fly to it, rename it and delete it;
  - each change is written to view settings at once.

## 4. Info and measure in 3D

- Every pickable mesh group carries `userData.pick`:
  - furniture: `{ kind: 'furniture', id }`;
  - openings: `{ kind: 'opening', id }`;
  - floors: `{ kind: 'room', id }`.
- Clicking in the 3D view (select mode) takes the nearest hit whose ancestors carry `pick`, and shows an `InfoCard`:
  - furniture: catalog name, width × depth × height;
  - a door or window: its type and width, plus the door style;
  - a room: its name, area (m², one decimal) and "Tầng N".
- A click on nothing closes the card.
- The "Đo" tool, a toggle in the 3D HUD:
  - the first click on any surface sets point A, and the second click sets point B;
  - it draws a line A–B with a label of the distance in metres (two decimals);
  - a third click starts again, and Esc clears.
- Measurement is 3D (straight-line) distance.

## Error handling

- A failed settings load keeps the defaults and shows no error.
- A failed save shows "Không lưu được cài đặt xem" in the panel, and the change stays on screen.
- A fly-to or teleport to a point outside the house does nothing.

## Testing

Pure logic:
- `sunPosition` against NOAA's calculator, within 1°, for three cases. The expected values are read from NOAA's calculator when the test is written; the figures below are approximate.
  - Hà Nội, 21 June, 12:00 local: altitude near 87°;
  - TP.HCM, 21 December, 08:00: a low morning sun in the south-east;
  - Đà Nẵng, 21 March, 06:00: around sunrise, altitude near 0°.
- `sunDirection` with `northDeg` 0 and 90.
- `mapTransform` round trip.
- `roomView`.
- The measure distance.

Components:
- `SunStudyPanel` updates the store and saves the location;
- `ViewsPanel` saves, flies and deletes;
- `InfoCard` content for each kind.

.NET integration:
- the settings round-trip;
- defaults when unset;
- 400 for each validation rule;
- 404 for another user's project.
