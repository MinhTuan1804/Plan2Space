# Scale Calibration and Walk-Through — Design

**Date:** 2026-09-24
**Status:** Approved for planning
**Builds on:** `2026-09-24-image-import-and-manual-editing-design.md` (branch `feature/image-import-editing`, not yet merged; this work branches from it).

## Why

The 3D view today extrudes grey walls over a grid and nothing else: no floor, no ceiling, no materials.
Users judge the product by that view, and it reads as a wireframe, not a home. The next product goal is
furnishing a plan and walking through it like a PC game; this design is the first half of that road:
make the house the right size, make it look like a place, and let the user step inside.

Scale comes first because everything after it depends on it. An image import currently comes out at the
wrong size — the furnished sample plan (7.0 m wide) is built 34 m wide, because OCR reads "11725" as "725"
and dimension labels are matched to whatever segment is nearest. A 2 m bed in a house five times too big
looks like a toy, and walking through it feels like being an ant.

## Intended outcome

A person imports a plan, fixes its scale with one measured line, and walks through a house that has
floors, ceilings, painted walls, glazed windows and soft light — at the right size.

Decisions taken with the user:

- Walk-through is **desktop only**: WASD + mouse, like a PC game.
- Scale is fixed by **picking two points on the plan and typing their real length** in metres.
- The house gets **good default materials**; choosing materials is left to the furnishing step.
- The walk-through is **full screen, reusing the same scene** as the 3D pane (approach B).
- Collision is a **hand-written 2D check**, not a physics engine.
- Wood and tile textures are **drawn in code** (canvas), not loaded from asset files.

Assumptions stated to the user and not contested:

- Calibration scales **positions** only. Wall thickness (0.2 m), wall height (2.8 m) and opening widths are
  real-world sizes, not measurements from the image, so they are kept.
- Door openings can be walked through; windows and walls cannot.
- One storey only: no stairs.

## Non-goals

Choosing materials. Furniture. Door leaves that swing. Stairs and multi-storey houses. Phones and touch.
Shareable walk-through links. Guessing room types (pipeline rooms are labelled "Room N").

## Part 1 — Scale calibration

### Measure tool

A fourth editor tool, **Measure (M)**, alongside Select (V), Wall (W) and Opening (O). The user clicks point
A, then point B; between the clicks a preview line follows the cursor with its current length in metres.
After B, a small input asks for the real length in metres. Escape or an empty/invalid entry cancels.
The points are not snapped: dimension lines drawn beside a plan are not walls.

### Applying it

The factor is `k = real length ÷ measured length`. Every position is multiplied by `k` about the plan
origin `(0, 0)`: wall points, opening positions and room points. Thickness, height, opening width and sill
height are unchanged. A factor that is not finite and positive, or a measured length under 0.05 m, is
refused with a message.

Calibration is a deliberate, one-off action, so it **saves immediately** through the existing save path.

### The underlay follows

The underlay is anchored with the image's bottom-left pixel at plan `(0, 0)` (the worker maps pixel
`(px, py)` to `(px·mpp, (H − py)·mpp)`). Scaling about the origin therefore keeps it aligned if its
metres-per-pixel is multiplied by the same `k`.

The corrected value is written back into the **result of the import it belongs to**:
`PUT /api/projects/{projectId}/underlay` with `{ metresPerPixel }` updates the `underlay.metresPerPixel`
of the latest completed job's `ResultJson`. Tying the correction to that import means a later import of a
different image is never given an old image's scale. No database migration is needed.

The PUT is sent only **after** the geometry save succeeds. If the save fails or conflicts, neither changes,
so the plan and its underlay can never disagree. The endpoint checks project ownership, requires a finite
positive value, and returns 404 when the project has no underlay.

## Part 2 — A house that looks like a place

The house is extracted into a `HouseModel` component rendered by both the 3D pane and the walk-through, so
the two views cannot drift apart.

- **Floors** from room polygons. A room under 6 m² — in these plans almost always a WC — gets tile; every
  other room gets wood. With no rooms at all, one wood floor spans the walls' bounding box.
- **Ceilings** from the same polygons at wall height, white. They are shown **only in the walk-through**,
  so the orbiting 3D pane can still look down into the rooms.
- **Walls** in a warm off-white paint instead of grey.
- **Windows** get a translucent glass pane filling the cut-out (1.2 m high above the sill, matching the
  existing CSG cut). Doors stay open holes (2.1 m high).
- **Light:** a hemisphere light (sky and ground) plus one shadow-casting directional light.
- **Textures:** wood planks and floor tiles are painted onto canvases in code and repeated per metre. No
  asset files, no licensing, no download weight.

## Part 3 — Walk-through mode

- A **Walk** button on the 3D pane opens the scene full screen. Clicking the scene locks the pointer.
- **Controls:** W/A/S/D move at 1.4 m/s, Shift runs at 3 m/s, the mouse looks around.
- **Escape** releases the pointer (the browser does this itself) and shows an overlay with *Continue* and
  *Exit*.
- **Spawn:** the centroid of the largest room, eyes at 1.6 m. With no rooms, the centre of the walls'
  bounding box.
- **HUD:** a centre crosshair and a one-line key hint.

### Collision

The player is a circle of radius 0.25 m on the floor plane. Each frame, a pure function
`stepPlayer(position, move, walls, openings)` moves the player and resolves collisions against every wall
segment, treating the wall as a band of its own half-thickness plus the player radius. Resolution pushes
the player out along the wall's normal, so movement slides along walls instead of stopping dead, and it
repeats a few times so corners resolve cleanly.

A **door** opening leaves its span (position ± half its width) out of its wall, so the player passes
through. A **window** does not.

## Testing

- **Pure functions** (vitest): the calibration factor and its refusal cases; scaling a plan (positions
  scaled, sizes untouched); `stepPlayer` — hitting a wall, sliding along it, passing through a door,
  being stopped by a window, pushing out of a corner; the spawn point; the floor material choice.
- **Store** (vitest): calibration saves, then sends the underlay scale; a conflicting save sends nothing.
- **Backend** (xUnit): the underlay scale PUT — updates the latest import's value, is ownership-checked,
  rejects non-positive and non-finite values, and returns 404 without an underlay.
- **Rendering** cannot be exercised in jsdom beyond mounting; the visual check is done by the user in a
  browser, as for the previous branch.

## Risks

- **Pointer lock** needs a user gesture and behaves slightly differently between browsers; the overlay must
  always offer a way back to the editor.
- **Performance:** a floor and a ceiling per room plus CSG-cut walls is light for a house, but a noisy image
  import with hundreds of walls could drop frames. Worth measuring, not solving in advance.
- **Room-dependent features** (floors by room, spawn in the largest room) inherit whatever rooms the plan
  has. A plan without rooms still works, with one floor and a centre spawn, but looks plainer.
