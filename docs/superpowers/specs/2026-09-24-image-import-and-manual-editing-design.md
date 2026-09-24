# Image Import and Manual Editing — Design

**Date:** 2026-09-24
**Status:** Approved for planning
**Supersedes nothing.** Extends `2026-09-23-plan2space-design.md`.

## Why

Plan2Space reads a DXF well: the drawing that prompted this work yields 75 walls,
7 rooms and 16 openings with their real widths. It reads an image badly. The same
drawing as a screenshot yields 1107 walls; a typical furnished plan found online
(`ban-ve-thiet-ke-nha-cap-4-dep-4.jpg`, 7.0 x 11.725 m, six rooms) yields 801 walls,
one 1.5 m² room, no openings, and a bounding box of 4.1 x 6.82 m — wrong geometry at
the wrong scale.

DXF is an architect's format. A person who wants to see their own house in 3D does not
have one, and anyone who does have one already owns CAD software and does not need this
product. The image path is therefore the product; the DXF path is a shortcut for
professionals.

The raster branch has no trained weights (`No ViT checkpoint configured`,
`YOLO-OBB weights not found`), so it thresholds on darkness and traces every dark pixel:
beds, sofas, sanitary ware, dining tables, tile hatching, text, dimension lines. Training
the models is out of scope, as it was in the original plan.

## Intended outcome

An imported image produces a **draft** the user corrects by hand. The user is not an
architect; correctness comes from the editing tools, not from recognition accuracy.
Success is that a person can import a photo or screenshot of a floor plan and, within a
few minutes of editing, reach a 3D model of their own home.

Decisions taken with the user, recorded here because they bound everything below:

- The image import must yield a draft, not a finished model. Editing tools take priority
  over recognition accuracy.
- The 2D editor must support walls **and** openings. Openings are not optional: the
  raster branch never detects a door, so without hand-placed openings every
  image-derived 3D model would be a windowless, doorless box.
- Verification uses generated fixture images plus the two real images already on hand.
  Waiting for the user to collect a corpus would block the work.
- The source image is shown under the canvas so the user can trace it.

## Non-goals

Training ViT or YOLO weights. Arc (curved) walls. Editing room labels. Editing wall
thickness or height from the UI. Room floors in 3D. Mobile layout. Raster door detection.

## Part 1 — Wall and opening tools in the 2D editor

Today `CanvasEditor` has no notion of a selected tool and handles no pointer input for
editing; the toolbar's Wall and Opening buttons are decorative, though they already
advertise the shortcuts "(W)" and "(O)". `geometryStore` exposes `updateWall` and
`addOpening` only.

### Tool state

A new `editorStore` (Zustand) holds the active tool (`select` | `wall` | `opening`), the
selected element, and the opening type and width to place. It stays separate from
`geometryStore`, which remains the geometry data store.

### Store actions

`geometryStore` gains `addWall`, `deleteWall`, `moveWallPoint`, `updateOpening` and
`deleteOpening`. Each marks the store dirty, so the existing local draft persistence,
the unsaved-changes warning and the optimistic-concurrency save all apply unchanged.

### Interaction

A shared `useCanvasPointer` hook converts stage coordinates to project metres (reusing
`canvasTransform`) and applies the existing `SnapEngine`. Each tool is a component
mounted only while its tool is active, so no tool's logic runs or interferes when another
is selected:

- **WallTool** — press, drag, release draws a wall, with a rubber-band preview. A new
  wall takes the backend defaults (0.2 m thick, 2.8 m high). A drag shorter than 0.1 m is
  discarded; Escape cancels the in-progress wall.
- **OpeningTool** — pressing on or near a wall places an opening, projected
  perpendicularly onto the nearest wall within 0.5 m. Beyond that distance nothing
  happens, so a stray click cannot create a floating door.
- **select** — click selects a wall or opening, Delete removes it, dragging an endpoint
  moves it.

Rooms are derived from the wall graph, so they refresh from the edited walls rather than
being edited directly. The 3D view already reads the same store and follows.

### Backend validation

The geometry API does not currently reject a wall with thickness or height <= 0 (a known
deferred item). Hand-drawn walls make that reachable from the UI, so the check belongs in
this work: reject non-positive thickness or height with the existing 422 validation path.

## Part 2 — Adaptive thick-stroke filtering

In these drawings walls are solid, thick strokes and furniture is thin outline. A
morphological opening therefore separates them. Measured on the furnished plan above, a
fixed 7x7 opening cut 801 walls to 31 and left a clean wall skeleton with all furniture,
text and tile hatching gone.

A fixed kernel is wrong in general: a plan whose walls are two thin face lines would be
erased. The filter therefore sizes its own kernel per image, from the stroke-width
distribution obtained by a distance transform of the mask, and **falls back to the
unfiltered mask when filtering removes too much** — the guard that protects thin-line
drawings.

The step goes in `vectorize.py` immediately before `_drop_small_components`. Dimension
OCR runs on the original image in `tasks.py`, separately from `vectorize_raster`, so the
filter cannot cost the drawing its scale. The DXF branch and `_merge_collinear` are
untouched.

This does not produce openings, and it does not fully recover rooms: filled-slab walls
still leave door-sized gaps the room finder cannot always close. Those are what the
editor is for.

## Part 3 — Trimming the co-pilot's payload

`InterpretCopilotMessageCommand` sends the whole plan to the model with every chat
message. Measured: 16,841 characters (~4,200 tokens) for the 75-wall DXF plan, and an
estimated ~62,000 tokens for a 1107-wall image import. Ten messages on an image-derived
plan would cost roughly 620,000 tokens and can exceed a free-tier per-minute allowance.

The trimming happens in `copilot_intent.py`, where the prompt is built, so the service
contract does not change. It drops the fields the prompt never mentions (thickness,
height, sill height) and rounds coordinates to centimetres. If the compacted geometry is
still over the limit, the co-pilot returns its existing `unknown` result with a readable
reason. It must **not** truncate silently: a truncated plan makes the model pick the
wrong wall while the user sees a confident answer.

Part 2 also reduces this cost directly, since fewer junk walls means a smaller payload.

## Part 4 — The source image under the canvas

`FilesController` has an upload endpoint and no download endpoint, so the frontend cannot
retrieve the uploaded image. Without it the user corrects walls against an empty
background and cannot tell which walls are missing and which are junk — which would make
the hand-editing strategy unworkable.

This adds an authorised download endpoint for a project file, and a dimmed image layer
beneath the canvas, positioned using the metres-per-pixel scale the pipeline already
computed, with a visibility toggle and an opacity control.

## Testing

- **Python** — generated fixture images (thick walls, thin furniture, text, tile
  hatching) drive tests for the adaptive kernel and for the thin-line fallback guard;
  further tests cover payload compaction and the over-limit refusal. The two real images
  are used for manual measurement and are not committed: one is the user's own drawing.
- **Web** — vitest covers the five new store actions and the two tools' logic.
- **.NET** — a test for the non-positive thickness and height rejection.
- The whole-stack smoke test and the existing DXF fixtures must keep their current
  results: `sample_house_plan.dxf` stays at 6 walls and 3 rooms.

## Risks

- The adaptive kernel is tuned against a small number of images. The fallback guard
  bounds the damage to "no better than today", not to "always better".
- Image-derived rooms remain partial. The editor is the remedy, and the room count from
  an image should not be treated as a quality target.
- Hand-drawn walls reach code paths that until now only saw pipeline output. The backend
  validation in Part 1 is the reason that is acceptable.
