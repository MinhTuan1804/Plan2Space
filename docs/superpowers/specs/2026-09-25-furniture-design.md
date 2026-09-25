# Furniture — Design

**Date:** 2026-09-25
**Status:** Approved for planning (the user approved the approaches and asked for execution without further stops)
**Builds on:** `2026-09-24-scale-calibration-and-walkthrough-design.md` (branch `feature/scale-and-walkthrough`, unmerged; this work branches from it as `feature/furniture`).

## Why

The house can now be scaled correctly and walked through, but it is empty. The product goal is to see *your
home* furnished. The user has collected 21 GLB models in `plan2space/model3d/` (105 MB). None is used: the
app has no furniture feature, and most files are unusable as they are — nine are in centimetres, millimetres
or inches, three are implausibly proportioned, and seven weigh 6–25 MB each.

## Intended outcome

A person picks furniture from a library and places it on the 2D plan, or tags a room with its type and presses
**Auto-furnish**; the furniture appears as real models in the 3D pane and in the walk-through, and blocks the
player like walls do.

Decisions taken with the user:

- Furniture is **placed on the 2D plan** (footprints you drag, rotate, delete) and **seen in 3D**.
- **Room types + Auto-furnish** are in scope: the user tags each room (bedroom, living room, kitchen, dining
  room, bathroom) and the staging algorithm, extended from two room types to five, furnishes it.
- Furniture is stored in a **new `FurnitureItems` table saved in the existing geometry save**, so it inherits
  optimistic concurrency, the local draft and the unsaved-changes warning.
- Models are **static files** in `plan2space-web/public/furniture/` with a `catalog.json`, produced by a
  normalisation script from `model3d/`, which is not committed.
- The room type is stored in the **existing `Label`** field, chosen from a fixed list — no migration for rooms.

## Two problems found in the existing code, and their resolution

1. **Room labels would be wiped on every save.** Saving after a wall edit re-derives rooms as new rooms labelled
   "Room N". Re-derived rooms must **inherit the label of the old room that contains them** (the old room
   containing the new room's interior point).
2. **Furniture must not belong to a room.** Rooms are replaced on re-derivation; furniture tied to room ids would
   vanish. Furniture is stored in **absolute plan coordinates**, independent of rooms. Calibration scales its
   positions and keeps its sizes, exactly like openings.

## Catalog

`public/furniture/catalog.json` is the single source of truth, read by the frontend. Each entry:
`id`, `name` (Vietnamese), `file` (GLB path, or null → drawn as a box), `widthM`, `depthM`, `heightM`,
`elevationM` (0 on the floor; wall-mounted items above it), `againstWall` (true for beds, wardrobes, sofas,
counters…), `roomTypes`, `attribution`. A top-level `autoFurnish` maps each room type to the item ids to place.

The staging service no longer owns a catalog for this flow: **the client sends the items to place** (id, width,
depth, against-wall) and the service only positions them. Its built-in two-type catalog stays as a fallback so
existing callers keep working.

**Local frame convention.** Width runs along local x, depth along local y, and the item's **front faces local
−y** at rotation 0. Rotation is counter-clockwise degrees in plan space. In 3D, a GLB (Y-up, front +Z by glTF
convention) is wrapped in a +90° X rotation, which maps its +Y to plan up and its +Z front to plan −y.

## Normalising the models

A Node script in `tools/furniture/` (its own `package.json`, outside the web build) reads
`tools/furniture/sources.json` (catalog fields plus the source file per id) and, for each model:

- computes its bounding box and applies **one uniform scale** so it fits the catalog's width × depth × height
  (this absorbs cm, mm and inch sources without per-file unit guesses and never distorts proportions);
- turns it 90° about the vertical axis first when its longer horizontal side is along depth rather than width;
- moves its footprint centre to the origin and its base to the floor;
- welds, prunes, simplifies meshes above 30 000 triangles, and re-encodes textures to at most 1024 px WebP;
- writes `public/furniture/<id>.glb` and `catalog.json`, and fails loudly if any output exceeds 2 MB.

Only the outputs are committed; `model3d/` is added to `.gitignore`. Items without a model (washing machine) are
catalog entries with `file: null`.

## Placing furniture in 2D

- A **Furniture (F)** tool opens a library panel grouped by room type. Choosing an item then clicking the
  plan places it (rotation 0).
- With the Select tool, a furniture footprint can be selected, dragged, rotated 90° with **R**, and deleted with
  Delete, like walls and openings.
- Footprints draw as filled rectangles with the item's name, under walls and above rooms.

## Room types and Auto-furnish

- With the Select tool, clicking inside a room selects it. A small panel shows its type (a select over the five
  types, stored as the room's label) and an **Auto-furnish** button.
- Auto-furnish sends the room polygon, the room type's items, and **keep-clear zones in front of every door**
  to `POST /api/staging/suggest`. The returned placements **replace** the furniture whose centre lies in that
  room.
- The staging algorithm places `againstWall` items with their back to a room edge, facing into the room
  (sliding along each long enough edge), and the others on the existing grid search; every item must lie inside
  the room, overlap nothing placed, and avoid the keep-clear zones. Items that fit nowhere are skipped.
- Floor material follows the room type when there is one (kitchen and bathroom tile, others wood), otherwise the
  existing area rule.

## 3D and the walk-through

`HouseModel` renders each furniture item: the GLB (loaded once per file and cloned per instance) or, without a
file, a box of its real size. Items standing on the floor (`elevationM` < 0.3 m) become walk blockers — their
footprint's four edges — so the player walks around the bed instead of through it.

## Save and import

- The geometry save gains an optional `furniture` list. **Absent means untouched** (the co-pilot's saves),
  present means replace. Each item: `catalogId` (1–64 chars, `[a-z0-9_-]`), finite `x`, `y`, `rotationDeg`;
  at most 2000 items. Invalid input is a 400, like other geometry validation.
- The geometry GET returns `furniture`.
- An **import replaces the whole plan, furniture included** (the worker's save sends an empty list). The import
  confirmation text says so.

## Non-goals

Furniture uploaded by users. Snapping manually placed items to walls. Furniture stacked on other furniture
(the cooktop on the counter is manual). Colour or material choice per item. Door and window 3D models.

## Testing

- **Backend:** furniture round-trips through save/GET; absent list leaves furniture untouched; invalid items are
  a 400; an import clears furniture; staging passes items and keep-clear zones through.
- **Python:** explicit items are placed; against-wall items touch an edge and face into the room; nothing
  overlaps or leaves the room; keep-clear zones stay empty; the fallback catalog still works.
- **Tools:** the fit-scale and orientation maths; the script's outputs are measured (size and bounds).
- **Web:** store actions, save/draft/snapshot and calibration include furniture; label carry-over on
  re-derivation; auto-furnish replaces only that room's furniture; walk blockers from furniture;
  room-type floor materials. 3D rendering is checked by the user in a browser.

## Risks

- **Model orientation:** the script can find the width axis but not which side is the front. A model may face
  the wall; a per-item `yawOffsetDeg` in `sources.json` corrects it after the user sees it.
- **Licences:** the models' sources are unknown. `attribution` fields are left empty and flagged to the user;
  CC-BY models need attribution before the product ships.
- **Weight:** ~20 GLBs of up to 2 MB each load lazily per item actually used; a furnished house loads a few MB.
