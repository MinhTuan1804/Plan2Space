# Multi-storey houses: stacked floors, stairs and light wells — design

**Date:** 2026-09-27
**Status:** approved in conversation, awaiting written-spec review
**Branch:** `feature/multi-storey`

## Why

Multi-storey plans (e.g. `nha_2tang_pa_a.dxf`) draw each floor side by side: the ground floor at x 0–10 m,
the first floor at x 20–30 m. Plan2Space has no notion of a floor, so the 3D view shows two houses standing
next to each other, with no stair between them and light wells that are just rooms. The user wants:

1. A **Merge floors** button that stacks the upper floor on the lower one and saves the house as two storeys.
2. A **stair** in 3D on the ground floor that clearly leads up to the first floor.
3. **Light wells** shown sensibly: open through the upper slab and the roof, railed, glazed at the top.

Decisions taken with the user:

| Question | Choice |
|---|---|
| What does Merge do? | Merges for real and saves; every element belongs to a level; the 2D plan switches level. |
| How is the stair made? | Generated in code to fit the stair well (dog-leg, landing, handrails); walkable. |
| Light wells? | Void through the upper slab and the roof, 1 m railing where there is no wall, glass roof pane, pebble floor below. |

## What the drawing gives us (reference plan)

- Titles `GROUND FLOOR` / `FIRST FLOOR` above each plan (layer `TEXT`).
- Notes: ground storey 3.60 m, first 3.50 m, first-floor slab at +3.600; stair of 2 flights, 21 risers at
  171 mm, going 270 mm, flight width 1250 mm, in a 2800 × 3800 mm well; light wells open through the
  first-floor slab and roof, with identical coordinates on both floors.
- Stair treads on layer `STAIR` at the same place on both plans, with an `UP` text.
- Room names `STAIRS`, `LIGHT WELL 1`, `LIGHT WELL 2` on both floors.

## Scope

**In:** a level on every element; the merge; a level switch in 2D; stacked 3D with slabs, light wells and a
generated stair; walking up and down the stair.

**Out (YAGNI):** un-merge (re-import instead); tested behaviour above two storeys (the model allows level
0, 1, 2…, only two are tested); per-level GLB/PDF export; a level-aware co-pilot (it keeps each element's
level untouched); a user-uploaded stair model.

## 1. Data: a level on every element

- New integer column `Level` (default `0`) on `Walls`, `Rooms`, `Openings`, `Furniture`, with a migration.
- Save and load carry `level`. Absent in a save → `0`, so existing projects and clients are unchanged.
- The co-pilot copies each element's level when it rebuilds the lists.
- Validation: `0 ≤ level ≤ 9`; an opening's level must equal its wall's level.
- **Storey height** = the height of that level's walls (the tallest one). Elevation of level *n* = the sum
  of the storey heights of levels 0 … n−1. No new project fields.
- The import still writes every element at level 0 (floors stay side by side until the user merges).

## 2. The Merge button

**Detection (web, pure functions, `lib/levels.ts`):**
- Split the plan's walls into **blocks**: connected groups whose wall slabs touch or lie within 0.5 m.
  Rooms, openings and furniture follow the block their position falls in.
- The button shows only while the plan is all level 0 and has **two or more blocks each at least 20 m²**.
  The two largest blocks are the candidates.
- **Which is the ground floor:** the left block (smaller x), which is how plans lay floors out; the
  dialog's **Swap** button covers the rest. (Floor titles such as `GROUND FLOOR` sit on a general text
  layer the import does not keep; reading them is left for later.)
- **Alignment offset:** align the blocks' bounding-box lower-left corners. Floors of one house share their
  outline, so this lines them up. Reference plan: (−20.0, 0.0). (Aligning on the stair rooms was rejected:
  on the reference plan the first-floor stair room is merged with a corridor, so its centroid is off.)

**Dialog:** shows which block becomes floor 1 and floor 2 (with a **Swap** button), the storey heights
(defaults 3.6 m and 3.5 m, editable, 2.2–6.0 m), and **Merge**.

**Merge (store action):** translate the upper block's walls, rooms, openings and furniture by the offset,
set their `level = 1`, set every wall's `heightMeters` to its level's storey height, then save through the
normal save path. One undoable step in the store (restore the snapshot on failure).

## 3. 2D plan: level switch

- Toolbar control **Tầng 1 / Tầng 2 …**, shown when the plan has more than one level.
- The canvas shows and edits only the current level; new walls, openings and furniture get the current
  level. Room re-derivation runs per level (walls of one level derive that level's rooms).
- Selection, auto-furnish and wall paint work unchanged within the level.

## 4. 3D: stacking, slabs, roof and light wells

- Each level's walls, floors, openings, furniture and fixtures render in a group raised to its elevation.
- **Slab** between levels, 0.15 m thick, top at the upper level's elevation: the union of the upper
  level's rooms **minus** holes for stair wells and light wells (section 5 and below).
- **Roof** = the top level's ceilings as today; over a light well it is a transparent glass pane instead.
  (The 3D overview keeps its current "no ceilings" view; the walk shows ceilings and roof.)
- **Stair well** = a stair room on a level whose room directly above (overlapping ≥ 50 %) is also a stair
  room. **Light well** = a room typed `courtyard` whose name contains `GIẾNG TRỜI` / `LIGHT WELL`, present
  on the level above at the same place.
- **Railings** (1.0 m, posts + top rail + glass-like infill) on the upper level along every edge of a stair
  or light-well hole that has no wall on it.
- **Pebble floor** under a light well on the lowest level (a tile-coloured floor kind `pebble`).

## 5. 3D: the generated stair

Built by a pure function `stairGeometry(well, riseM, entry)` → treads, landing, stringers, handrail paths.

- Fits the stair well's bounding rectangle (well rooms are rectangles in practice; a non-rectangular well
  uses its largest inscribed axis-aligned rectangle).
- **Dog-leg (U) stair**: two parallel flights, each at most 1.25 m wide and at most half the well's short
  side, running along the long side; a landing across the far end at half the rise.
- **Risers:** `n = round(rise / 0.17)`, riser height `rise / n`; going = (long side − landing depth) ÷
  (n/2 treads), clamped to 0.22–0.30 m. Reference plan: rise 3.60 m → 21 risers of 171 mm.
- **Start end:** the short side nearest the well's door opening, else the `UP` text position when the
  drawing has one on the stair layer, else the side nearest the plan's origin.
- The last tread lands flush with the upper slab's top.
- Handrails at 0.9 m along both flights and the landing; railing round the hole upstairs (section 4).

## 6. Walk: climbing

- The player has a current level and a ground height. Each frame: `groundHeight(x, y)` = the stair's
  surface height where the player stands inside a stair footprint, else the current level's elevation; the
  eye is `groundHeight + 1.6 m`, eased over ~0.15 s.
- Stepping off the top of the stair onto the upper floor switches the current level; collision uses that
  level's walls, furniture and railings. Railings block like walls.
- The stair's side against the landing void and the hole edges are blocked so the player cannot fall.

## 7. Error handling

- Merge with a single block, or blocks of very different size (smaller < 50 % of larger): the button stays
  hidden / the dialog warns "these don't look like floors of one house" and still allows Merge.
- No stair room above a stair room → no stair is generated; the level still stacks.
- Save failure during merge → the store restores its snapshot and shows the server's message.
- Old projects (all level 0) render exactly as today.

## 8. Testing

- **Backend:** `level` round-trips; absent → 0; out-of-range → 400; opening/wall level mismatch → 400;
  co-pilot keeps levels; migration applies.
- **Web (vitest), with the reference plan's geometry:**
  - blocks: two blocks found; ground floor = the left one; offset (−20, 0);
  - merge: moved coordinates, levels, wall heights 3.6 / 3.5, one save;
  - level switch filters and assigns level to new elements;
  - slab: holes exactly over the stair well and both light wells;
  - railings only on hole edges without walls;
  - stair: 21 risers, top tread at +3.600, inside the well, flights ≤ 1.25 m wide;
  - walk: ground height follows the stair, level switches at the top, railings block.
- **Visual:** render the reference house on a probe page (not committed) — stacked floors, the stair from
  the ground floor, the light wells from below and above.

## Delivery in three phases

Each phase is usable on its own and ends green.

1. **Levels + Merge + 2D level switch** (backend column/API/migration, detection, dialog, store, toolbar).
2. **3D stacking + slabs + roof + light wells + railings.**
3. **Generated stair + walking up and down.**
