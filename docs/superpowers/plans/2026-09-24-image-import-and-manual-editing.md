# Image Import and Manual Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an imported floor-plan image a usable draft: cut the furniture noise out of raster recognition, let a non-architect draw and fix walls, doors and windows by hand over the source image, and stop the co-pilot from sending oversized plans to the LLM.

**Architecture:** The raster branch gains an adaptive thick-stroke filter in front of its existing skeletonizer. The 2D editor gains an `editorStore` (active tool, selection, underlay settings), five geometry edit actions, and one hook per tool, routed by `CanvasEditor`. Rooms stay derived by the one Python implementation (`rooms_from_walls`), now also reachable through `POST /api/rooms/derive` so a hand-edited plan refreshes its rooms on save. The worker records each image's pixel-to-metre mapping on its job, and two new read endpoints let the editor draw that image under the plan.

**Tech Stack:** Python 3.11 (FastAPI, Celery, OpenCV, Shapely), ASP.NET Core 8 (MediatR, EF Core, MinIO SDK, xUnit + Testcontainers), React 18 + TypeScript (Zustand, react-konva, vitest, Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-24-image-import-and-manual-editing-design.md`

## Global Constraints

- New walls are 0.2 m thick and 2.8 m high — the defaults already used by the pipeline (`DEFAULT_WALL_THICKNESS_M`, `DEFAULT_WALL_HEIGHT_M`) and the backend.
- A window's sill is 0.9 m, a door's is 0 — as in `serializer.py` (`WINDOW_SILL_HEIGHT_M`) and `InterpretCopilotMessageCommand`.
- DXF results must not change: `sample_house_plan.dxf` stays at 6 walls and 3 rooms; the user's DXF stays at 75 walls, 7 rooms, 16 openings.
- Every ai-service endpoint called by the API checks `X-Internal-Token` against `P2S_INTERNAL_TOKEN` with `hmac.compare_digest`.
- Every new API endpoint that calls the ai-service uses the `RateLimitPolicies.AiTriggering` policy.
- The co-pilot must never truncate a plan silently; an oversize plan is refused with a readable reason.
- No real user image or drawing is committed. Test images are generated in code.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test commands, from the repo root:
  - Python: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`
  - Web: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
  - .NET: `dotnet test backend/Plan2Space.sln` (Docker must be running — the integration tests use Testcontainers)

## Rulings against the spec

These resolve gaps or conflicts found while reading the code. Each is binding for the tasks below.

- **R1** — Invalid wall dimensions return **400**, not 422: `GeometrySaveResults.cs` maps `GeometryValidationException` to `BadRequest`, and `OpeningOnUnknownWall_Returns400` already pins that path.
- **R2** — The tools are **hooks** (`useWallTool`, `useOpeningTool`) that are always mounted, and `CanvasEditor` routes Stage pointer events to the active tool. Konva delivers pointer events on the Stage, and hooks cannot be mounted conditionally; each tool's logic still lives in its own file.
- **R3** — The spec says rooms refresh from edited walls, but rooms are derived only by the Python pipeline. `saveToServer` therefore derives rooms through `POST /api/rooms/derive` → ai-service `POST /rooms/derive` (the same `rooms_from_walls`), and only when walls changed. If derivation fails, the walls still save with the previous rooms and the next save retries.
- **R4** — The underlay exists only for PNG/JPEG uploads. A PDF is rendered to an image inside the worker; the upload itself cannot be drawn.
- **R5** — The underlay is the image of the **latest completed** import, or nothing. An older image must never sit under a plan that came from a later DXF import.

## Review Focus

- **Deleting a wall that carries doors or windows** — the openings go with it and the next save succeeds (the API rejects an opening on a missing wall). Pinned in Task 9.
- **Moving a wall that carries openings** — each opening stays on the wall, at the same distance from the wall's first point, clamped inside the wall. Pinned in Task 9.
- **Placing an opening near a wall's end, or on a wall shorter than the opening** — the centre is clamped so the opening fits; on a too-short wall nothing is placed. Pinned in Task 12.
- **Pressing Delete, Backspace, V, W or O while typing in the co-pilot chat or a number field** — no tool changes and nothing is deleted. Pinned in Tasks 10 and 13.
- **A project whose latest import has no underlay (a DXF or PDF), or that was never imported** — no image and no error. Pinned in Tasks 6 and 15.

## File Structure

**ai-service**
- `pipeline/vectorize.py` — modify: `keep_thick_strokes()`, applied to the threshold mask.
- `pipeline/copilot_intent.py` — modify: `compact_geometry()`, size limit.
- `api/routers/rooms.py` — create: `POST /rooms/derive`.
- `api/main.py` — modify: register the rooms router.
- `workers/tasks.py` — modify: `_raster_to_project_space` returns the underlay mapping; the job reports it.
- `pipeline/api_client.py` — modify: `report_final_state(..., result=None)`.
- `tests/raster_fixtures.py` — create: generated plan images.
- `tests/test_thick_stroke_filter.py`, `tests/test_copilot_payload.py`, `tests/test_rooms_endpoint.py`, `tests/test_underlay_report.py` — create.

**backend**
- `src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs` — modify: reject non-positive thickness/height.
- `src/Plan2Space.API/Controllers/InternalJobsController.cs` — modify: accept and store `Result`.
- `src/Plan2Space.Application/Files/Queries/GetUnderlayQuery.cs` — create.
- `src/Plan2Space.API/Controllers/UnderlayController.cs` — create: `GET /api/projects/{projectId}/underlay`.
- `src/Plan2Space.Application/Files/IFileStorage.cs` + `src/Plan2Space.Infrastructure/Storage/MinioFileStorage.cs` — modify: `GetObjectAsync`.
- `src/Plan2Space.Application/Files/Queries/GetFileContentQuery.cs` — create.
- `src/Plan2Space.API/Controllers/FilesController.cs` — modify: `GET .../files/{fileId}/content`.
- `src/Plan2Space.Application/Geometry/IRoomDerivationClient.cs` — create.
- `src/Plan2Space.Infrastructure/Geometry/RoomDerivationHttpClient.cs` — create.
- `src/Plan2Space.API/Controllers/RoomsController.cs` — create: `POST /api/rooms/derive`.
- `src/Plan2Space.API/Program.cs` — modify: register the rooms client.
- Tests: `GeometryControllerTests.cs` (modify), `UnderlayTests.cs`, `FileContentTests.cs`, `RoomsControllerTests.cs` (create).

**plan2space-web**
- `src/lib/planGeometry.ts` — create: pure plan geometry (ids, nearest point on walls, distance along a wall, wall from a drag, opening placement).
- `src/stores/geometryStore.ts` — modify: five edit actions, `wallsEdited`, `roomsRefreshFailed`, room refresh on save.
- `src/stores/editorStore.ts` — create: tool, selection, opening settings, underlay settings.
- `src/hooks/useEditorShortcuts.ts` — create: V/W/O/Escape/Delete.
- `src/components/studio/Canvas2D/canvasTransform.ts` — modify: `screenToPlan`, `underlayRect`.
- `src/components/studio/Canvas2D/useWallTool.ts`, `useOpeningTool.ts`, `useUnderlay.ts`, `UnderlayLayer.tsx` — create.
- `src/components/studio/Canvas2D/CanvasEditor.tsx`, `WallLayer.tsx`, `OpeningLayer.tsx` — modify.
- `src/components/studio/StudioToolbar.tsx` — modify: tool buttons, opening settings, rooms notice.
- `src/pages/StudioPage.tsx` — modify: mount `useEditorShortcuts`.
- `src/services/geometryService.ts` — modify: `deriveRooms`.
- `src/services/underlayService.ts` — create.
- Tests: `planGeometry.test.ts`, `geometryEditing.test.ts`, `editorShortcuts.test.tsx`, `wallTool.test.ts`, `openingTool.test.ts`, `roomRefresh.test.ts`, `underlay.test.ts` — create.

---

## Phase A — Backend guard

### Task 1: Reject non-positive wall thickness or height

**Files:**
- Modify: `backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs` (wall loop, after the `w.Points.Count < 2` check)
- Test: `backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PUT /api/projects/{id}/geometry` returns 400 `{ message }` for a wall whose `thicknessMeters` or `heightMeters` is ≤ 0 or not a number.

- [ ] **Step 1: Write the failing test** — add to `GeometryControllerTests`:

```csharp
    [Theory]
    [InlineData(0.0, 2.8)]
    [InlineData(-0.2, 2.8)]
    [InlineData(0.2, 0.0)]
    [InlineData(0.2, -1.0)]
    public async Task NonPositiveWallThicknessOrHeight_Returns400(double thickness, double height)
    {
        // Hand-drawn walls reach this path from the editor; a zero-thickness wall breaks the 3D extrusion.
        var (client, project) = await AuthedProjectAsync($"geo-dims-{Guid.NewGuid():N}@plan2space.dev");

        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0,
            walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } },
                                  thicknessMeters = thickness, heightMeters = height } },
            rooms = Array.Empty<object>(),
            openings = Array.Empty<object>()
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~NonPositiveWallThicknessOrHeight_Returns400"`
Expected: 4 failures, `Expected: BadRequest, Actual: OK`.

- [ ] **Step 3: Implement** — in `SaveGeometryHandler.Handle`, directly after `throw new GeometryValidationException("A wall needs at least 2 points");`:

```csharp
            // !(x > 0) also rejects NaN.
            if (!(w.ThicknessMeters > 0) || !(w.HeightMeters > 0))
                throw new GeometryValidationException("A wall's thickness and height must be greater than zero");
```

- [ ] **Step 4: Run the geometry tests**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~GeometryControllerTests"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs
git commit -m "fix: reject walls with non-positive thickness or height

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase B — ai-service

### Task 2: Adaptive thick-stroke filter

**Files:**
- Create: `ai-service/tests/raster_fixtures.py`
- Create: `ai-service/tests/test_thick_stroke_filter.py`
- Modify: `ai-service/pipeline/vectorize.py` (constants block; new function after `_threshold_fallback`; the threshold branch of `vectorize_raster`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `keep_thick_strokes(mask: np.ndarray) -> np.ndarray` in `pipeline.vectorize` — returns a 0/1 `uint8` mask of the same shape.

- [ ] **Step 1: Write the image generator** — `ai-service/tests/raster_fixtures.py`:

```python
# ai-service/tests/raster_fixtures.py
"""Floor-plan images generated in code: the tests need furniture, text and hatching around solid
walls without committing anyone's real drawing."""
import cv2
import numpy as np

WALL_PX = 10
# Regions that contain only hairlines (x0, y0, x1, y1): nothing in them may survive the filter.
FURNITURE_BOX = (45, 55, 156, 206)
HATCH_BOX = (219, 39, 372, 102)


def _blank() -> np.ndarray:
    return np.full((300, 400), 255, np.uint8)


def _draw_walls(img: np.ndarray) -> None:
    cv2.rectangle(img, (20, 20), (380, 280), 0, WALL_PX)
    cv2.line(img, (200, 20), (200, 120), 0, WALL_PX)
    cv2.line(img, (200, 170), (200, 280), 0, WALL_PX)     # 50 px doorway


def walls_only() -> np.ndarray:
    img = _blank()
    _draw_walls(img)
    return img


def furnished_plan() -> np.ndarray:
    """Two rooms of solid 10 px walls, with a bed, a table, a label and tile hatching drawn in 1 px lines."""
    img = walls_only()
    cv2.rectangle(img, (50, 60), (150, 200), 0, 1)       # bed
    cv2.rectangle(img, (60, 70), (140, 110), 0, 1)       # pillows
    cv2.circle(img, (290, 150), 30, 0, 1)                # round table
    cv2.putText(img, "PHONG NGU", (230, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)
    for x in range(220, 371, 12):                        # tile hatching
        cv2.line(img, (x, 40), (x, 100), 0, 1)
    for y in range(40, 101, 12):
        cv2.line(img, (220, y), (370, y), 0, 1)
    return img


def thin_line_plan() -> np.ndarray:
    """Walls drawn as two 1 px face lines 8 px apart: a drawing with nothing thick in it."""
    img = _blank()
    for offset in (0, 8):
        cv2.rectangle(img, (20 + offset, 20 + offset), (380 - offset, 280 - offset), 0, 1)
    return img
```

- [ ] **Step 2: Write the failing tests** — `ai-service/tests/test_thick_stroke_filter.py`:

```python
# ai-service/tests/test_thick_stroke_filter.py
# Without trained weights the raster branch traces every dark pixel; in a furnished plan that turns beds,
# tables, labels and tile hatching into walls. Walls are solid strokes and the rest are hairlines.
import numpy as np
from PIL import Image

from pipeline.vectorize import keep_thick_strokes, vectorize_raster
# tests/ has no __init__.py: pytest puts it on sys.path, and a bare import cannot collide with a
# third-party top-level 'tests' package the way 'tests.raster_fixtures' could.
from raster_fixtures import FURNITURE_BOX, HATCH_BOX, furnished_plan, thin_line_plan, walls_only


def _mask(img: np.ndarray) -> np.ndarray:
    return (img < 128).astype(np.uint8)


def test_furniture_text_and_hatching_are_removed():
    kept = keep_thick_strokes(_mask(furnished_plan()))

    x0, y0, x1, y1 = FURNITURE_BOX
    assert kept[y0:y1, x0:x1].sum() == 0
    x0, y0, x1, y1 = HATCH_BOX
    assert kept[y0:y1, x0:x1].sum() == 0


def test_walls_survive_the_filter():
    walls = _mask(walls_only()).astype(bool)

    kept = keep_thick_strokes(_mask(furnished_plan())).astype(bool)

    assert kept[walls].mean() >= 0.8


def test_a_thin_line_drawing_is_left_untouched():
    # Its walls are two hairlines; opening it would erase every wall.
    mask = _mask(thin_line_plan())

    assert np.array_equal(keep_thick_strokes(mask), mask)


def test_an_empty_mask_stays_empty():
    mask = np.zeros((50, 50), np.uint8)

    assert keep_thick_strokes(mask).sum() == 0


def test_vectorizing_a_furnished_plan_traces_walls_not_furniture(tmp_path):
    path = tmp_path / "furnished.png"
    Image.fromarray(furnished_plan()).save(path)

    walls = vectorize_raster(str(path), use_model=False)["walls"]

    assert len(walls) <= 12   # 4 outer + 2 interior walls, with slack for corner fragments
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_thick_stroke_filter.py -q`
Expected: ImportError `cannot import name 'keep_thick_strokes'`.

- [ ] **Step 4: Implement** — in `pipeline/vectorize.py`, append to the constants block (after `MIN_COMPONENT_FRACTION = 0.02`):

```python
# Walls in a drawn plan are solid strokes several pixels wide; furniture, hatching and text are hairlines.
# An opening sized from the drawing's own stroke widths erases the hairlines and keeps the walls.
MIN_WALL_HALF_WIDTH_PX = 2.5    # below this the drawing has no solid walls to separate (e.g. two-line walls)
STROKE_WIDTH_PERCENTILE = 90    # the widest common strokes are the walls
KERNEL_TO_HALF_WIDTH = 1.5
MIN_KEPT_FRACTION = 0.15        # keeping less than this means the filter ate the walls: undo it
```

Add after `_threshold_fallback`:

```python
def keep_thick_strokes(mask: np.ndarray) -> np.ndarray:
    """Removes hairlines (furniture, hatching, text) and keeps solid wall strokes.

    The kernel comes from the image's own stroke widths, and the unfiltered mask is returned whenever
    filtering would not help: no thick strokes at all, or so little left that the walls went with it.
    """
    mask = mask.astype(np.uint8)
    if not mask.any():
        return mask
    half_widths = cv2.distanceTransform(mask, cv2.DIST_L2, 3)[mask > 0]
    half_width = float(np.percentile(half_widths, STROKE_WIDTH_PERCENTILE))
    if half_width < MIN_WALL_HALF_WIDTH_PX:
        return mask
    size = max(3, int(round(KERNEL_TO_HALF_WIDTH * half_width)) | 1)
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((size, size), np.uint8))
    if opened.sum() < MIN_KEPT_FRACTION * mask.sum():
        return mask
    return opened
```

In `vectorize_raster`, change the fallback line only (a trained segmenter's mask is already walls and is not filtered):

```python
        mask = keep_thick_strokes(_threshold_fallback(gray))
```

- [ ] **Step 5: Run the new tests, then the whole Python suite**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_thick_stroke_filter.py -q`
Expected: 5 passed.
Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`
Expected: all pass. The existing raster tests draw 2 px walls, which fall under `MIN_WALL_HALF_WIDTH_PX` and are left untouched.

- [ ] **Step 6: Commit**

```bash
git add ai-service/pipeline/vectorize.py ai-service/tests/raster_fixtures.py ai-service/tests/test_thick_stroke_filter.py
git commit -m "feat: filter furniture, text and hatching out of raster wall masks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Compact the co-pilot's geometry and refuse oversize plans

**Files:**
- Modify: `ai-service/pipeline/copilot_intent.py`
- Create: `ai-service/tests/test_copilot_payload.py`

**Interfaces:**
- Consumes: the geometry the API posts (camelCase `GeometryDto`: `walls[{id, points[{x,y}], thicknessMeters, heightMeters, version}]`, `rooms[{id, points, label, version}]`, `openings[{id, wallId, type, position{x,y}, widthMeters, sillHeightMeters, version}]`).
- Produces: `compact_geometry(geometry: dict) -> dict` and `MAX_GEOMETRY_CHARS` in `pipeline.copilot_intent`. `_call_llm(message, geometry)` keeps its signature and now receives the compacted dict.

- [ ] **Step 1: Write the failing tests** — `ai-service/tests/test_copilot_payload.py`:

```python
# ai-service/tests/test_copilot_payload.py
# Every chat message used to carry the whole plan: ~4,200 tokens for a 75-wall DXF, ~62,000 for an
# image import. The model only needs ids and centimetre coordinates.
from unittest.mock import patch

from pipeline.copilot_intent import compact_geometry, parse_intent


def _wall(i):
    return {"id": f"w{i}", "points": [{"x": 0.123456, "y": 1.987654}, {"x": 5.0, "y": 1.987654}],
            "thicknessMeters": 0.2, "heightMeters": 2.8, "version": 3}


def test_the_prompt_carries_ids_and_centimetre_points_only():
    geometry = {
        "walls": [_wall(1)],
        "rooms": [{"id": "r1", "label": "Bedroom", "points": [{"x": 0, "y": 0}], "version": 3}],
        "openings": [{"id": "o1", "wallId": "w1", "type": "Door", "position": {"x": 2.004, "y": 1.99},
                      "widthMeters": 0.9, "sillHeightMeters": 0, "version": 3}],
        "version": 3,
    }

    assert compact_geometry(geometry) == {
        "walls": [{"id": "w1", "points": [[0.12, 1.99], [5.0, 1.99]]}],
        "rooms": [{"id": "r1", "label": "Bedroom", "points": [[0.0, 0.0]]}],
        "openings": [{"id": "o1", "wallId": "w1", "type": "Door", "position": [2.0, 1.99]}],
    }


def test_a_wall_without_points_is_kept_by_id():
    assert compact_geometry({"walls": [{"id": "w1"}]}) == {
        "walls": [{"id": "w1", "points": []}], "rooms": [], "openings": []}


@patch("pipeline.copilot_intent._call_llm")
def test_the_model_receives_the_compacted_geometry(mock_llm, monkeypatch):
    monkeypatch.setenv("COPILOT_API_KEY", "test-key")
    mock_llm.return_value = '{"action": "unknown", "params": {}}'

    parse_intent("hi", {"walls": [_wall(1)]})

    assert mock_llm.call_args[0][1] == {
        "walls": [{"id": "w1", "points": [[0.12, 1.99], [5.0, 1.99]]}], "rooms": [], "openings": []}


@patch("pipeline.copilot_intent._call_llm")
def test_a_plan_too_large_for_the_prompt_is_refused_not_truncated(mock_llm, monkeypatch):
    # Truncating would let the model pick the wrong wall while the user sees a confident answer.
    monkeypatch.setenv("COPILOT_API_KEY", "test-key")

    result = parse_intent("move wall w1", {"walls": [_wall(i) for i in range(5000)]})

    mock_llm.assert_not_called()
    assert result["action"] == "unknown"
    assert "too large" in result["reason"]
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_copilot_payload.py -q`
Expected: ImportError `cannot import name 'compact_geometry'`.

- [ ] **Step 3: Implement** — in `pipeline/copilot_intent.py`, after `UNKNOWN = {...}`:

```python
# ~15k tokens. A hand-sized plan compacts to a few thousand characters; beyond this the plan is noise
# (usually an unfiltered image import) and the answer would be unreliable anyway.
MAX_GEOMETRY_CHARS = 60_000


def _point(p) -> list[float]:
    x, y = (p["x"], p["y"]) if isinstance(p, dict) else (p[0], p[1])
    return [round(float(x), 2), round(float(y), 2)]


def compact_geometry(geometry: dict) -> dict:
    """Only what the prompt refers to: ids, labels, types and centimetre coordinates."""
    return {
        "walls": [{"id": w.get("id"), "points": [_point(p) for p in w.get("points", [])]}
                  for w in geometry.get("walls", [])],
        "rooms": [{"id": r.get("id"), "label": r.get("label"), "points": [_point(p) for p in r.get("points", [])]}
                  for r in geometry.get("rooms", [])],
        "openings": [{"id": o.get("id"), "wallId": o.get("wallId"), "type": o.get("type"),
                      "position": _point(o["position"])}
                     for o in geometry.get("openings", []) if o.get("position") is not None],
    }
```

In `_call_llm`, send compact JSON:

```python
            {"role": "user", "content": f"Geometry: {json.dumps(current_geometry, separators=(',', ':'))}\nInstruction: {message}"},
```

In `parse_intent`, replace `raw = _call_llm(message, current_geometry)` and the `try` around it with:

```python
    compact = compact_geometry(current_geometry)
    if len(json.dumps(compact, separators=(",", ":"))) > MAX_GEOMETRY_CHARS:
        return {**UNKNOWN, "reason": f"This plan is too large for the co-pilot ({len(compact['walls'])} walls). "
                                     "Remove stray walls or edit it by hand."}
    try:
        raw = _call_llm(message, compact)
    except OpenAIError as exc:   # quota, auth, network, provider outage
        return {**UNKNOWN, "reason": f"The co-pilot's language model is unavailable right now ({type(exc).__name__}). Try again later."}
```

- [ ] **Step 4: Run the co-pilot tests**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_copilot_payload.py tests/test_copilot_intent.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add ai-service/pipeline/copilot_intent.py ai-service/tests/test_copilot_payload.py
git commit -m "feat: send the co-pilot a compact plan and refuse plans too large to prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Rooms derivation endpoint

**Files:**
- Create: `ai-service/api/routers/rooms.py`
- Modify: `ai-service/api/main.py`
- Create: `ai-service/tests/test_rooms_endpoint.py`

**Interfaces:**
- Consumes: `rooms_from_walls(walls: list[dict]) -> list[dict]` from `pipeline.rooms` (reads only `w["points"]`).
- Produces: `POST /rooms/derive`, body `{"walls": [{"points": [[x, y], ...]}]}`, response `{"rooms": [{"points": [[x, y], ...], "label": "Room N"}]}`; 401 without the token.

- [ ] **Step 1: Write the failing tests** — `ai-service/tests/test_rooms_endpoint.py`:

```python
# ai-service/tests/test_rooms_endpoint.py
# A hand-edited plan needs its rooms re-derived by the same code the import uses.
from fastapi.testclient import TestClient

from api.main import app

SQUARE = [[[0, 0], [4, 0]], [[4, 0], [4, 3]], [[4, 3], [0, 3]], [[0, 3], [0, 0]]]


def test_rooms_are_derived_from_the_posted_walls(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")

    res = TestClient(app).post("/rooms/derive", json={"walls": [{"points": p} for p in SQUARE]},
                               headers={"X-Internal-Token": "t"})

    assert res.status_code == 200
    rooms = res.json()["rooms"]
    assert len(rooms) == 1 and rooms[0]["label"] == "Room 1"


def test_a_doorway_gap_still_closes_the_room(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")
    walls = [[[0, 0], [1.5, 0]], [[2.4, 0], [4, 0]]] + SQUARE[1:]   # 0.9 m doorway in the bottom wall

    res = TestClient(app).post("/rooms/derive", json={"walls": [{"points": p} for p in walls]},
                               headers={"X-Internal-Token": "t"})

    assert len(res.json()["rooms"]) == 1


def test_the_endpoint_requires_the_service_token(monkeypatch):
    monkeypatch.setenv("P2S_INTERNAL_TOKEN", "t")

    res = TestClient(app).post("/rooms/derive", json={"walls": []})

    assert res.status_code == 401
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_rooms_endpoint.py -q`
Expected: 404 instead of 200/401 (no such route).

- [ ] **Step 3: Implement** — `ai-service/api/routers/rooms.py`:

```python
import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from pipeline.rooms import rooms_from_walls

router = APIRouter()


class WallIn(BaseModel):
    points: list[list[float]]


class DeriveRequest(BaseModel):
    walls: list[WallIn]


@router.post("/rooms/derive")
def derive(req: DeriveRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    walls = [{"points": w.points} for w in req.walls if len(w.points) >= 2]
    return {"rooms": rooms_from_walls(walls)}
```

In `ai-service/api/main.py`, add `rooms` to the router import and register it after `export`:

```python
from api.routers import copilot, export, health, rooms, staging
```
```python
app.include_router(rooms.router)
```

- [ ] **Step 4: Run the tests**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_rooms_endpoint.py -q`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add ai-service/api/routers/rooms.py ai-service/api/main.py ai-service/tests/test_rooms_endpoint.py
git commit -m "feat: expose room derivation to the API for hand-edited plans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The worker reports how an image maps to metres

**Files:**
- Modify: `ai-service/workers/tasks.py` (`_raster_to_project_space`, `vectorize_job`)
- Modify: `ai-service/pipeline/api_client.py` (`report_final_state`)
- Create: `ai-service/tests/test_underlay_report.py`

**Interfaces:**
- Consumes: `to_project_space` (pixel `(px, py)` → metres `(px·mpp, (H − py)·mpp)`).
- Produces: `report_final_state(job_id, status, percent, error=None, result: dict | None = None)`. When `result` is given the PUT body gains `"result": "<json string>"`; otherwise the body is unchanged. A completed PNG/JPEG job reports `result={"underlay": {"metresPerPixel": float, "widthPx": int, "heightPx": int}}`.

- [ ] **Step 1: Write the failing tests** — `ai-service/tests/test_underlay_report.py`:

```python
# ai-service/tests/test_underlay_report.py
# The editor draws the uploaded image under the plan, so it needs the mapping the worker used.
from unittest.mock import patch

import numpy as np
from PIL import Image

from workers.celery_app import celery_app
from workers.tasks import vectorize_job


def test_an_image_job_reports_how_its_pixels_map_to_metres(tmp_path):
    img = np.full((200, 300), 255, dtype=np.uint8)
    img[40:42, 40:260] = 0
    path = tmp_path / "plan.png"
    Image.fromarray(img).save(path)
    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value=str(path)), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.extract_dimensions", return_value=[]), \
         patch("workers.tasks.push_geometry_to_api"), \
         patch("workers.tasks.report_final_state") as final:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.png").get()

    assert final.call_args.kwargs["result"] == {
        "underlay": {"metresPerPixel": 0.02, "widthPx": 300, "heightPx": 200}}


def test_a_dxf_job_reports_no_underlay():
    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value="tests/fixtures/sample_house_plan.dxf"), \
         patch("workers.tasks.report_progress"), \
         patch("workers.tasks.push_geometry_to_api"), \
         patch("workers.tasks.report_final_state") as final:
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.dxf").get()

    final.assert_called_once_with("j", "Completed", 100)


def test_the_result_travels_as_a_json_string(monkeypatch):
    from pipeline import api_client
    seen = {}

    class FakeClient:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def put(self, url, headers, json):
            seen["body"] = json
            class R:
                def raise_for_status(self): pass
            return R()

    monkeypatch.setattr(api_client, "_http", lambda: FakeClient())

    api_client.report_final_state("j", "Completed", 100, result={"underlay": {"metresPerPixel": 0.02}})

    assert seen["body"]["result"] == '{"underlay": {"metresPerPixel": 0.02}}'
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_underlay_report.py -q`
Expected: first test fails with `KeyError: 'result'`; third with `TypeError: report_final_state() got an unexpected keyword argument 'result'`.

- [ ] **Step 3: Implement `report_final_state`** — in `pipeline/api_client.py` (add `import json` at the top if absent):

```python
def report_final_state(job_id: str, status: str, percent: int, error: str | None = None,
                       result: dict | None = None) -> None:
    """Persists the job's final state in the API database (AiJobs row), so it survives a Redis restart.
    Best effort: a reporting failure is logged and never fails the job itself."""
    body = {"status": status, "progressPercent": percent, "error": error}
    if result is not None:
        body["result"] = json.dumps(result)
    try:
        with _http() as client:
            client.put(f"/internal/ai/jobs/{job_id}/state", headers={"X-Internal-Token": INTERNAL_TOKEN},
                       json=body).raise_for_status()
    except httpx.HTTPError:
        logger.exception("Could not persist final state of job %s", job_id)
```

- [ ] **Step 4: Implement the worker side** — in `workers/tasks.py`, below `DXF_EXTENSIONS = (".dxf",)`:

```python
# Only a PNG/JPEG upload is itself the image the editor can draw under the plan (a PDF is rendered).
UNDERLAY_EXTENSIONS = (".png", ".jpg", ".jpeg")
```

Replace `_raster_to_project_space`:

```python
def _raster_to_project_space(local_path: str) -> tuple[list[dict], list[dict], dict | None]:
    image_path = load_page_image(local_path, out_dir=os.path.dirname(local_path) or ".")
    parsed = vectorize_raster(image_path)
    symbols = detect_symbols(image_path)
    metres_per_pixel = estimate_metres_per_pixel(parsed["walls"], extract_dimensions(image_path))
    if metres_per_pixel is None:
        logger.warning("No dimension label calibrated the scale; assuming %s m/px", DEFAULT_METRES_PER_PIXEL)
        metres_per_pixel = DEFAULT_METRES_PER_PIXEL
    with Image.open(image_path) as img:
        width, height = img.width, img.height
    walls, symbols = to_project_space(parsed["walls"], symbols, metres_per_pixel, height)
    underlay = ({"metresPerPixel": metres_per_pixel, "widthPx": width, "heightPx": height}
                if local_path.lower().endswith(UNDERLAY_EXTENSIONS) else None)
    return walls, symbols, underlay
```

In `vectorize_job`, initialise `underlay = None` before `if is_dxf:`, change the raster branch to `walls, symbols, underlay = _raster_to_project_space(local_path)`, and replace `report_final_state(job_id, "Completed", 100)` with:

```python
        if underlay:
            report_final_state(job_id, "Completed", 100, result={"underlay": underlay})
        else:
            report_final_state(job_id, "Completed", 100)
```

- [ ] **Step 5: Run the new tests and the suite**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`
Expected: all pass, including `test_api_client.py` (its body assertion has no `result` key and none is added).

- [ ] **Step 6: Commit**

```bash
git add ai-service/workers/tasks.py ai-service/pipeline/api_client.py ai-service/tests/test_underlay_report.py
git commit -m "feat: record how an imported image maps to plan metres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase C — Backend endpoints

### Task 6: Store the job result and serve the underlay mapping

**Files:**
- Modify: `backend/src/Plan2Space.API/Controllers/InternalJobsController.cs`
- Create: `backend/src/Plan2Space.Application/Files/Queries/GetUnderlayQuery.cs`
- Create: `backend/src/Plan2Space.API/Controllers/UnderlayController.cs`
- Create: `backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs`

**Interfaces:**
- Consumes: the worker's PUT body from Task 5 (`result` is a JSON string).
- Produces: `GET /api/projects/{projectId}/underlay` → 200 `{ fileId, metresPerPixel, widthPx, heightPx }`, 204 when the latest completed job has no underlay or there is none, 404 for a project the caller does not own. `UnderlayDto(Guid FileId, double MetresPerPixel, int WidthPx, int HeightPx)`.

- [ ] **Step 1: Write the failing tests** — `UnderlayTests.cs`:

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

// The editor draws the imported image under the plan; it needs the worker's pixel-to-metre mapping.
public class UnderlayTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public UnderlayTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private const string ImageResult = "{\"underlay\":{\"metresPerPixel\":0.02,\"widthPx\":300,\"heightPx\":200}}";

    private HttpClient Service()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Internal-Token", Plan2SpaceWebApplicationFactory.InternalToken);
        return client;
    }

    private async Task<(HttpClient Client, Guid ProjectId)> OwnerAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return (client, (await _factory.CreateProjectAsync(client, "Underlay")).Id);
    }

    private async Task<(Guid FileId, Guid JobId)> ImportAsync(HttpClient client, Guid projectId)
    {
        var fileId = await _factory.UploadFixtureFileAsync(client, projectId, "fixtures/blank.png");
        var res = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId, fileId });
        return (fileId, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid());
    }

    [Fact]
    public async Task AnImageImport_ExposesItsPixelToMetreMapping()
    {
        var (client, projectId) = await OwnerAsync("underlay-png@plan2space.dev");
        var (fileId, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var res = await client.GetAsync($"/api/projects/{projectId}/underlay");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(fileId, body.GetProperty("fileId").GetGuid());
        Assert.Equal(0.02, body.GetProperty("metresPerPixel").GetDouble());
        Assert.Equal(300, body.GetProperty("widthPx").GetInt32());
        Assert.Equal(200, body.GetProperty("heightPx").GetInt32());
    }

    [Fact]
    public async Task WhenTheLatestImportHadNoUnderlay_NoOlderImageIsServed()
    {
        // An image import, then a DXF import (which reports no underlay): the old image must not sit under the DXF plan.
        var (client, projectId) = await OwnerAsync("underlay-then-dxf@plan2space.dev");
        var (_, imageJob) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{imageJob}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });
        var (_, dxfJob) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{dxfJob}/state", new { status = "Completed", progressPercent = 100 });

        var res = await client.GetAsync($"/api/projects/{projectId}/underlay");

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    [Fact]
    public async Task AProjectNeverImported_HasNoUnderlay()
    {
        var (client, projectId) = await OwnerAsync("underlay-none@plan2space.dev");

        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync($"/api/projects/{projectId}/underlay")).StatusCode);
    }

    [Fact]
    public async Task SomeoneElsesProject_Returns404()
    {
        var (_, projectId) = await OwnerAsync("underlay-owner@plan2space.dev");
        var (stranger, _) = await OwnerAsync("underlay-stranger@plan2space.dev");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{projectId}/underlay")).StatusCode);
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~UnderlayTests"`
Expected: failures with `NotFound` (no route) where `OK`/`NoContent` is expected.

- [ ] **Step 3: Store the result** — in `InternalJobsController`:

```csharp
    private const int MaxResultChars = 4000;

    public record JobStateRequest(string Status, int ProgressPercent, string? Error, string? Result);
```

and before `await _db.SaveChangesAsync(ct);`:

```csharp
        if (req.Result is { Length: > 0 and <= MaxResultChars })
            job.ResultJson = req.Result;
```

- [ ] **Step 4: Add the query** — `GetUnderlayQuery.cs`:

```csharp
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Queries;

public record UnderlayDto(Guid FileId, double MetresPerPixel, int WidthPx, int HeightPx);

public record GetUnderlayQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<UnderlayDto?>;

public class GetUnderlayHandler : IRequestHandler<GetUnderlayQuery, UnderlayDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    public GetUnderlayHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<UnderlayDto?> Handle(GetUnderlayQuery q, CancellationToken ct)
    {
        if (!await _db.Projects.AnyAsync(p => p.Id == q.ProjectId && p.OwnerId == q.RequestingUserId, ct))
            throw new KeyNotFoundException();

        // Only the latest import can lie under the plan: after a DXF import an older image would mislead.
        var job = await _db.AiJobs.AsNoTracking()
            .Where(j => j.ProjectId == q.ProjectId && j.Status == AiJobStatus.Completed)
            .OrderByDescending(j => j.CompletedAt)
            .FirstOrDefaultAsync(ct);
        if (job?.ResultJson is null)
            return null;

        try
        {
            using var doc = JsonDocument.Parse(job.ResultJson);
            if (!doc.RootElement.TryGetProperty("underlay", out var u))
                return null;
            return new UnderlayDto(job.SourceFileId, u.GetProperty("metresPerPixel").GetDouble(),
                u.GetProperty("widthPx").GetInt32(), u.GetProperty("heightPx").GetInt32());
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            return null;   // a malformed worker result means no underlay, never an error for the user
        }
    }
}
```

- [ ] **Step 5: Add the controller** — `UnderlayController.cs`:

```csharp
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Files.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/underlay")]
public class UnderlayController : ControllerBase
{
    private readonly IMediator _mediator;
    public UnderlayController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpGet]
    public async Task<IActionResult> Get(Guid projectId, CancellationToken ct)
    {
        try
        {
            var underlay = await _mediator.Send(new GetUnderlayQuery(projectId, CurrentUserId), ct);
            return underlay is null ? NoContent() : Ok(underlay);
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }
}
```

- [ ] **Step 6: Run the tests**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~UnderlayTests|FullyQualifiedName~JobLifecycleTests"`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/Plan2Space.API/Controllers/InternalJobsController.cs backend/src/Plan2Space.Application/Files/Queries/GetUnderlayQuery.cs backend/src/Plan2Space.API/Controllers/UnderlayController.cs backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs
git commit -m "feat: keep each import's image mapping and serve the latest one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Serve an uploaded image back to its owner

**Files:**
- Modify: `backend/src/Plan2Space.Application/Files/IFileStorage.cs`
- Modify: `backend/src/Plan2Space.Infrastructure/Storage/MinioFileStorage.cs`
- Create: `backend/src/Plan2Space.Application/Files/Queries/GetFileContentQuery.cs`
- Modify: `backend/src/Plan2Space.API/Controllers/FilesController.cs`
- Create: `backend/tests/Plan2Space.API.IntegrationTests/FileContentTests.cs`

**Interfaces:**
- Produces: `IFileStorage.GetObjectAsync(string objectKey, CancellationToken ct) -> Task<Stream>`; `GET /api/projects/{projectId}/files/{fileId}/content` → the image bytes with `image/png` or `image/jpeg`; 404 for a non-owner, a file of another project, or a non-image file.

- [ ] **Step 1: Write the failing tests** — `FileContentTests.cs`:

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/FileContentTests.cs
using System.Net;
using System.Net.Http.Headers;
using Xunit;

public class FileContentTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public FileContentTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<HttpClient> UserAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return client;
    }

    [Fact]
    public async Task UploadedImage_IsServedBackToItsOwner()
    {
        var client = await UserAsync("content-owner@plan2space.dev");
        var project = await _factory.CreateProjectAsync(client, "Content");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        var res = await client.GetAsync($"/api/projects/{project.Id}/files/{fileId}/content");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("image/png", res.Content.Headers.ContentType?.MediaType);
        var expected = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "fixtures/blank.png"));
        Assert.Equal(expected, await res.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task AnotherUser_CannotReadTheImage()
    {
        var owner = await UserAsync("content-private@plan2space.dev");
        var project = await _factory.CreateProjectAsync(owner, "Private");
        var fileId = await _factory.UploadFixtureFileAsync(owner, project.Id, "fixtures/blank.png");
        var stranger = await UserAsync("content-stranger@plan2space.dev");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{project.Id}/files/{fileId}/content")).StatusCode);
    }

    [Fact]
    public async Task AFileOfAnotherProject_IsNotServedUnderThisOne()
    {
        var client = await UserAsync("content-two-projects@plan2space.dev");
        var a = await _factory.CreateProjectAsync(client, "A");
        var b = await _factory.CreateProjectAsync(client, "B");
        var fileOfA = await _factory.UploadFixtureFileAsync(client, a.Id, "fixtures/blank.png");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{b.Id}/files/{fileOfA}/content")).StatusCode);
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~FileContentTests"`
Expected: the first test fails with `Expected: OK, Actual: NotFound` (no GET route; the other two pass trivially for now).

- [ ] **Step 3: Extend storage** — `IFileStorage.cs`:

```csharp
public interface IFileStorage
{
    Task PutObjectAsync(string objectKey, Stream data, long size, string contentType, CancellationToken ct);
    Task<Stream> GetObjectAsync(string objectKey, CancellationToken ct);
}
```

`MinioFileStorage.cs`, after `PutObjectAsync`:

```csharp
    public async Task<Stream> GetObjectAsync(string objectKey, CancellationToken ct)
    {
        var buffer = new MemoryStream();
        await _client.GetObjectAsync(new GetObjectArgs()
            .WithBucket(Bucket)
            .WithObject(objectKey)
            .WithCallbackStream(s => s.CopyTo(buffer)), ct);
        buffer.Position = 0;
        return buffer;
    }
```

- [ ] **Step 4: Add the query** — `GetFileContentQuery.cs`:

```csharp
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Queries;

public record FileContent(Stream Content, string ContentType);

public record GetFileContentQuery(Guid ProjectId, Guid RequestingUserId, Guid FileId) : IRequest<FileContent>;

public class GetFileContentHandler : IRequestHandler<GetFileContentQuery, FileContent>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IFileStorage _storage;
    public GetFileContentHandler(IPlan2SpaceDbContext db, IFileStorage storage) { _db = db; _storage = storage; }

    public async Task<FileContent> Handle(GetFileContentQuery q, CancellationToken ct)
    {
        // Only images are served: the editor draws them under the plan; nothing else needs a download.
        var file = await _db.ProjectFiles.AsNoTracking()
            .Where(f => f.Id == q.FileId && f.ProjectId == q.ProjectId && f.Kind == FileKind.RasterImage
                        && f.Project.OwnerId == q.RequestingUserId)
            .FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException();

        var contentType = file.MinioObjectKey.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
        return new FileContent(await _storage.GetObjectAsync(file.MinioObjectKey, ct), contentType);
    }
}
```

`IPlan2SpaceDbContext.ProjectFiles` already exists (the upload handler calls `_db.ProjectFiles.Add`), and `ProjectFile.Project` is its navigation to the owner.

- [ ] **Step 5: Add the action** — in `FilesController` (add `using Plan2Space.Application.Files.Queries;`):

```csharp
    // Named GetContent: ControllerBase already has a Content(...) helper.
    [HttpGet("{fileId:guid}/content")]
    public async Task<IActionResult> GetContent(Guid projectId, Guid fileId, CancellationToken ct)
    {
        try
        {
            var file = await _mediator.Send(new GetFileContentQuery(projectId, CurrentUserId, fileId), ct);
            return File(file.Content, file.ContentType);
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }
```

- [ ] **Step 6: Run the tests**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~FileContentTests|FullyQualifiedName~AiJobFlowTests"`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/Plan2Space.Application/Files backend/src/Plan2Space.Infrastructure/Storage/MinioFileStorage.cs backend/src/Plan2Space.API/Controllers/FilesController.cs backend/tests/Plan2Space.API.IntegrationTests/FileContentTests.cs
git commit -m "feat: serve an uploaded plan image back to its owner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Room derivation through the API

**Files:**
- Create: `backend/src/Plan2Space.Application/Geometry/IRoomDerivationClient.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Geometry/RoomDerivationHttpClient.cs`
- Create: `backend/src/Plan2Space.API/Controllers/RoomsController.cs`
- Modify: `backend/src/Plan2Space.API/Program.cs` (next to the other `AddHttpClient<..., ...>(ConfigureAiClient)` lines)
- Create: `backend/tests/Plan2Space.API.IntegrationTests/RoomsControllerTests.cs`

**Interfaces:**
- Consumes: ai-service `POST /rooms/derive` from Task 4.
- Produces: `POST /api/rooms/derive`, body `{ walls: [{ points: [{x, y}] }] }`, response `{ rooms: [{ points: [{x, y}], label }] }`; 400 for more than 5000 walls or a wall with fewer than 2 finite points; 503 when the ai-service is unreachable. `DerivedRoom(List<double[]> Points, string Label)`.

- [ ] **Step 1: Write the failing tests** — `RoomsControllerTests.cs`:

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/RoomsControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Geometry;
using Xunit;

public class RoomsControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public RoomsControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    // Stands in for the ai-service's /rooms/derive (contract pinned by test_rooms_endpoint.py).
    private class FakeRooms : IRoomDerivationClient
    {
        public List<List<double[]>>? Seen;
        public Exception? Fail;
        public Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct)
        {
            Seen = walls;
            if (Fail is not null) throw Fail;
            return Task.FromResult(new List<DerivedRoom>
            {
                new(new List<double[]> { new[] { 0.0, 0.0 }, new[] { 4.0, 0.0 }, new[] { 4.0, 3.0 }, new[] { 0.0, 0.0 } }, "Room 1")
            });
        }
    }

    private async Task<HttpClient> ClientAsync(string email, FakeRooms fake)
    {
        var client = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IRoomDerivationClient>(fake))).CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return client;
    }

    private static object Wall(double x1, double y1, double x2, double y2) =>
        new { points = new[] { new { x = x1, y = y1 }, new { x = x2, y = y2 } } };

    [Fact]
    public async Task Derive_ReturnsTheRoomsForThePostedWalls()
    {
        var fake = new FakeRooms();
        var client = await ClientAsync("rooms-user@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive", new { walls = new[] { Wall(0, 0, 4, 0), Wall(4, 0, 4, 3) } });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var room = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rooms")[0];
        Assert.Equal("Room 1", room.GetProperty("label").GetString());
        Assert.Equal(4.0, room.GetProperty("points")[1].GetProperty("x").GetDouble());
        Assert.Equal(new[] { 4.0, 0.0 }, fake.Seen![0][1]);
    }

    [Fact]
    public async Task AWallWithOnePoint_Returns400WithoutCallingTheAiService()
    {
        var fake = new FakeRooms();
        var client = await ClientAsync("rooms-bad@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive",
            new { walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 } } } } });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Null(fake.Seen);
    }

    [Fact]
    public async Task AnUnreachableAiService_Returns503()
    {
        var fake = new FakeRooms { Fail = new RoomDerivationUnavailableException("down") };
        var client = await ClientAsync("rooms-down@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive", new { walls = new[] { Wall(0, 0, 4, 0) } });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~RoomsControllerTests"`
Expected: compile error — `IRoomDerivationClient` does not exist.

- [ ] **Step 3: Add the interface** — `IRoomDerivationClient.cs`:

```csharp
namespace Plan2Space.Application.Geometry;

// Points are [x, y] in project-space metres; the polygon is closed.
public record DerivedRoom(List<double[]> Points, string Label);

// Wraps the ai-service's internal POST /rooms/derive: the same room finder the import uses.
public interface IRoomDerivationClient
{
    Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct);
}

public class RoomDerivationUnavailableException : Exception
{
    public RoomDerivationUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}
```

- [ ] **Step 4: Add the HTTP client** — `RoomDerivationHttpClient.cs`:

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Plan2Space.Application.Geometry;

namespace Plan2Space.Infrastructure.Geometry;

// Calls the ai-service's internal POST /rooms/derive; BaseAddress and X-Internal-Token are set at registration.
public class RoomDerivationHttpClient : IRoomDerivationClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    public RoomDerivationHttpClient(HttpClient http) => _http = http;

    private record AiRoom([property: JsonPropertyName("points")] List<double[]> Points,
                          [property: JsonPropertyName("label")] string Label);
    private record AiResponse([property: JsonPropertyName("rooms")] List<AiRoom> Rooms);

    public async Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("rooms/derive", new { walls = walls.Select(points => new { points }) }, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new RoomDerivationUnavailableException("The AI service could not be reached.", ex);
        }
        if (!response.IsSuccessStatusCode)
            throw new RoomDerivationUnavailableException($"The AI service returned {(int)response.StatusCode}.");

        var body = await response.Content.ReadFromJsonAsync<AiResponse>(Json, ct);
        return body?.Rooms.Select(r => new DerivedRoom(r.Points, r.Label)).ToList() ?? new();
    }
}
```

In `Program.cs`, add the usings `Plan2Space.Application.Geometry` and `Plan2Space.Infrastructure.Geometry`, and:

```csharp
builder.Services.AddHttpClient<IRoomDerivationClient, RoomDerivationHttpClient>(ConfigureAiClient);
```

- [ ] **Step 5: Add the controller** — `RoomsController.cs`:

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Plan2Space.API.Middleware;
using Plan2Space.Application.Geometry;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/rooms")]
public class RoomsController : ControllerBase
{
    public const int MaxWalls = 5000;
    private readonly IRoomDerivationClient _rooms;
    public RoomsController(IRoomDerivationClient rooms) => _rooms = rooms;

    public record PointIn(double X, double Y);
    public record WallIn(List<PointIn> Points);
    public record DeriveRequest(List<WallIn> Walls);

    [HttpPost("derive")]
    [EnableRateLimiting(RateLimitPolicies.AiTriggering)]
    public async Task<IActionResult> Derive(DeriveRequest req, CancellationToken ct)
    {
        if (req.Walls is null || req.Walls.Count > MaxWalls || req.Walls.Any(w =>
                w?.Points is null || w.Points.Count < 2 || w.Points.Any(p => p is null || !double.IsFinite(p.X) || !double.IsFinite(p.Y))))
            return BadRequest(new { message = $"walls must be at most {MaxWalls} walls of at least 2 finite points." });
        try
        {
            var rooms = await _rooms.DeriveAsync(
                req.Walls.Select(w => w.Points.Select(p => new[] { p.X, p.Y }).ToList()).ToList(), ct);
            return Ok(new
            {
                rooms = rooms.Select(r => new { points = r.Points.Select(p => new { x = p[0], y = p[1] }), label = r.Label })
            });
        }
        catch (RoomDerivationUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }
}
```

- [ ] **Step 6: Run the tests**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~RoomsControllerTests"`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/src/Plan2Space.Application/Geometry/IRoomDerivationClient.cs backend/src/Plan2Space.Infrastructure/Geometry backend/src/Plan2Space.API/Controllers/RoomsController.cs backend/src/Plan2Space.API/Program.cs backend/tests/Plan2Space.API.IntegrationTests/RoomsControllerTests.cs
git commit -m "feat: derive rooms for a hand-edited plan through the API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase D — Editor

### Task 9: Plan geometry helpers and the store's edit actions

**Files:**
- Create: `plan2space-web/src/lib/planGeometry.ts`
- Modify: `plan2space-web/src/stores/geometryStore.ts`
- Create: `plan2space-web/tests/planGeometry.test.ts`
- Create: `plan2space-web/tests/geometryEditing.test.ts`

**Interfaces:**
- Produces (`src/lib/planGeometry.ts`):
  - `DEFAULT_WALL_THICKNESS_M = 0.2`, `DEFAULT_WALL_HEIGHT_M = 2.8`, `WINDOW_SILL_HEIGHT_M = 0.9`
  - `newId(): string` (a GUID the API accepts as a client id)
  - `polylineLength(points: Point[]): number`
  - `nearestOnWalls(p: Point, walls: Wall[]): { wallId: string; point: Point; distance: number } | null`
  - `distanceAlong(points: Point[], p: Point): number` — metres from the first point to the closest point on the polyline
  - `pointAlong(points: Point[], along: number): Point` — clamped to the polyline
  - `alongClamped(points: Point[], along: number, widthM: number): Point` — the point `along` metres in, pulled inward so an opening of `widthM` fits
- Produces (`GeometryState`): `addWall(points: Point[]): string`, `deleteWall(wallId: string): void`, `moveWallPoint(wallId: string, index: number, point: Point): void`, `updateOpening(openingId: string, patch: Partial<Pick<Opening, 'position' | 'widthMeters' | 'type'>>): void`, `deleteOpening(openingId: string): void`, `wallsEdited: boolean`, `roomsRefreshFailed: boolean`. `updateWall` now also carries the wall's openings and sets `wallsEdited`.

- [ ] **Step 1: Write the failing helper tests** — `tests/planGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { distanceAlong, nearestOnWalls, newId, pointAlong, polylineLength } from '../src/lib/planGeometry'
import { Wall } from '../src/services/geometryService'

const wall = (id: string, pts: [number, number][]): Wall =>
  ({ id, points: pts.map(([x, y]) => ({ x, y })), thicknessMeters: 0.2, heightMeters: 2.8, version: 0 })

describe('planGeometry', () => {
  it('measures and walks an L-shaped wall', () => {
    const l = wall('l', [[0, 0], [4, 0], [4, 3]]).points
    expect(polylineLength(l)).toBe(7)
    expect(pointAlong(l, 5)).toEqual({ x: 4, y: 1 })
    expect(pointAlong(l, 99)).toEqual({ x: 4, y: 3 })
    expect(distanceAlong(l, { x: 4.2, y: 1 })).toBeCloseTo(5)
  })

  it('finds the closest point on the nearest wall', () => {
    const hit = nearestOnWalls({ x: 2, y: 0.3 }, [wall('a', [[0, 0], [4, 0]]), wall('b', [[0, 5], [4, 5]])])
    expect(hit?.wallId).toBe('a')
    expect(hit?.point).toEqual({ x: 2, y: 0 })
    expect(hit?.distance).toBeCloseTo(0.3)
  })

  it('makes GUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
```

- [ ] **Step 2: Write the failing store tests** — `tests/geometryEditing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import { Opening, Wall } from '../src/services/geometryService'

const wall = (id: string, a: [number, number], b: [number, number]): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 })
const door = (id: string, wallId: string, x: number, y: number): Opening =>
  ({ id, wallId, type: 'Door', position: { x, y }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 })

describe('geometry edit actions', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', walls: [wall('w1', [0, 0], [4, 0])], rooms: [], openings: [door('d1', 'w1', 1, 0)],
    version: 1, dirty: false, wallsEdited: false,
  }))

  it('addWall appends a default-sized wall and returns its id', () => {
    const id = useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    const added = useGeometryStore.getState().walls.find((w) => w.id === id)!
    expect(added.thicknessMeters).toBe(0.2)
    expect(added.heightMeters).toBe(2.8)
    expect(useGeometryStore.getState().dirty).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('deleteWall takes the wall's doors and windows with it', () => {
    // The API rejects a save whose opening points at a missing wall.
    useGeometryStore.getState().deleteWall('w1')
    expect(useGeometryStore.getState().walls).toHaveLength(0)
    expect(useGeometryStore.getState().openings).toHaveLength(0)
  })

  it('a moved wall carries its doors at the same distance from its start', () => {
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 2 }, { x: 4, y: 2 }])
    expect(useGeometryStore.getState().openings[0].position).toEqual({ x: 1, y: 2 })
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('stretching a wall leaves its doors where they are', () => {
    useGeometryStore.getState().moveWallPoint('w1', 1, { x: 8, y: 0 })
    expect(useGeometryStore.getState().walls[0].points[1]).toEqual({ x: 8, y: 0 })
    expect(useGeometryStore.getState().openings[0].position).toEqual({ x: 1, y: 0 })
  })

  it('shortening a wall keeps its doors inside it', () => {
    useGeometryStore.getState().moveWallPoint('w1', 1, { x: 1, y: 0 })
    const { position } = useGeometryStore.getState().openings[0]   // 1 m wall, 0.9 m door
    expect(position.x).toBeCloseTo(0.55)
    expect(position.y).toBe(0)
  })

  it('updateOpening and deleteOpening edit only that opening and leave walls unedited', () => {
    useGeometryStore.getState().updateOpening('d1', { widthMeters: 1.2 })
    expect(useGeometryStore.getState().openings[0].widthMeters).toBe(1.2)
    useGeometryStore.getState().deleteOpening('d1')
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
    expect(useGeometryStore.getState().dirty).toBe(true)
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/planGeometry.test.ts tests/geometryEditing.test.ts`
Expected: failures — module `../src/lib/planGeometry` not found; `addWall is not a function`.

- [ ] **Step 4: Implement the helpers** — `src/lib/planGeometry.ts`:

```ts
import { Point, Wall } from '../services/geometryService'

export const DEFAULT_WALL_THICKNESS_M = 0.2
export const DEFAULT_WALL_HEIGHT_M = 2.8
export const WINDOW_SILL_HEIGHT_M = 0.9

// The API honours a client-supplied GUID if it is unused, so openings can reference a wall drawn in the same save.
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function closestOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  const point = { x: a.x + t * dx, y: a.y + t * dy }
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y) }
}

export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  return total
}

export function distanceAlong(points: Point[], p: Point): number {
  let best = { distance: Infinity, along: 0 }
  let walked = 0
  for (let i = 0; i < points.length - 1; i++) {
    const segment = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    const hit = closestOnSegment(p, points[i], points[i + 1])
    if (hit.distance < best.distance) best = { distance: hit.distance, along: walked + hit.t * segment }
    walked += segment
  }
  return best.along
}

export function pointAlong(points: Point[], along: number): Point {
  let remaining = Math.max(0, along)
  for (let i = 0; i < points.length - 1; i++) {
    const segment = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (remaining <= segment && segment > 0) {
      const t = remaining / segment
      return { x: points[i].x + t * (points[i + 1].x - points[i].x), y: points[i].y + t * (points[i + 1].y - points[i].y) }
    }
    remaining -= segment
  }
  return { ...points[points.length - 1] }
}

export function nearestOnWalls(p: Point, walls: Wall[]): { wallId: string; point: Point; distance: number } | null {
  let best: { wallId: string; point: Point; distance: number } | null = null
  for (const wall of walls) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const hit = closestOnSegment(p, wall.points[i], wall.points[i + 1])
      if (!best || hit.distance < best.distance) best = { wallId: wall.id, point: hit.point, distance: hit.distance }
    }
  }
  return best
}

// An opening keeps its distance from the wall's first point, clamped so it stays inside the wall.
export function alongClamped(points: Point[], along: number, widthM: number): Point {
  const length = polylineLength(points)
  const half = Math.min(widthM / 2, length / 2)
  return pointAlong(points, Math.min(Math.max(along, half), length - half))
}
```

- [ ] **Step 5: Implement the store actions** — in `src/stores/geometryStore.ts`:

Add imports:

```ts
import { alongClamped, DEFAULT_WALL_HEIGHT_M, DEFAULT_WALL_THICKNESS_M, distanceAlong, newId } from '../lib/planGeometry'
```

Add to `GeometryState` (after `addOpening`):

```ts
  addWall: (points: Point[]) => string
  deleteWall: (wallId: string) => void
  moveWallPoint: (wallId: string, index: number, point: Point) => void
  updateOpening: (openingId: string, patch: Partial<Pick<Opening, 'position' | 'widthMeters' | 'type'>>) => void
  deleteOpening: (openingId: string) => void
  // Walls changed since the last save, so the rooms must be derived again before saving.
  wallsEdited: boolean
  // The last save could not re-derive rooms and kept the previous ones.
  roomsRefreshFailed: boolean
```

Add above `export const useGeometryStore`:

```ts
// A wall that moves or changes length keeps its openings on it, each at the same distance from its start.
function carryOpenings(openings: Opening[], before: Wall | undefined, after: Wall): Opening[] {
  if (!before) return openings
  return openings.map((o) => o.wallId !== after.id ? o : {
    ...o, position: alongClamped(after.points, distanceAlong(before.points, o.position), o.widthMeters),
  })
}
```

Initial state: add `wallsEdited: false, roomsRefreshFailed: false,`. In both `set(...)` calls of `loadFromServer`, add `wallsEdited: false, roomsRefreshFailed: false`.

Replace `updateWall` and add the new actions after `addOpening`:

```ts
    updateWall: (wallId, points) => {
      set((state) => {
        const before = state.walls.find((w) => w.id === wallId)
        if (!before) return {}
        const after = { ...before, points }
        return {
          walls: state.walls.map((w) => (w.id === wallId ? after : w)),
          openings: carryOpenings(state.openings, before, after),
          wallsEdited: true,
        }
      })
      markEdited()
    },

    addWall: (points) => {
      const id = newId()
      set((state) => ({
        walls: [...state.walls, { id, points, thicknessMeters: DEFAULT_WALL_THICKNESS_M, heightMeters: DEFAULT_WALL_HEIGHT_M, version: 0 }],
        wallsEdited: true,
      }))
      markEdited()
      return id
    },

    deleteWall: (wallId) => {
      // An opening cannot outlive its wall: the API rejects a save that references a missing wall.
      set((state) => ({
        walls: state.walls.filter((w) => w.id !== wallId),
        openings: state.openings.filter((o) => o.wallId !== wallId),
        wallsEdited: true,
      }))
      markEdited()
    },

    moveWallPoint: (wallId, index, point) => {
      const wall = get().walls.find((w) => w.id === wallId)
      if (!wall) return
      get().updateWall(wallId, wall.points.map((p, i) => (i === index ? point : p)))
    },

    updateOpening: (openingId, patch) => {
      set((state) => ({ openings: state.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)) }))
      markEdited()
    },

    deleteOpening: (openingId) => {
      set((state) => ({ openings: state.openings.filter((o) => o.id !== openingId) }))
      markEdited()
    },
```

- [ ] **Step 6: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass. (`shortening` expects x ≈ 0.55: on the 1 m wall a 0.9 m door's centre must stay within 0.45–0.55 m, and its old distance of 1 m clamps to 0.55.)

- [ ] **Step 7: Commit**

```bash
git add plan2space-web/src/lib/planGeometry.ts plan2space-web/src/stores/geometryStore.ts plan2space-web/tests/planGeometry.test.ts plan2space-web/tests/geometryEditing.test.ts
git commit -m "feat: add, delete and move walls and openings in the geometry store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Tool state, tool buttons and keyboard shortcuts

**Files:**
- Create: `plan2space-web/src/stores/editorStore.ts`
- Create: `plan2space-web/src/hooks/useEditorShortcuts.ts`
- Modify: `plan2space-web/src/pages/StudioPage.tsx` (call the hook)
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` (the Select / Wall / Opening buttons)
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (`draggable`)
- Create: `plan2space-web/tests/editorShortcuts.test.tsx`

**Interfaces:**
- Produces (`src/stores/editorStore.ts`):
  - `type Tool = 'select' | 'wall' | 'opening'`
  - `type Selection = { kind: 'wall' | 'opening'; id: string } | null`
  - `useEditorStore` with `tool`, `selection`, `openingType: 'Door' | 'Window'`, `openingWidthM: number` (default 0.9), `underlayVisible: boolean` (default true), `underlayOpacity: number` (default 0.35), and `setTool(tool)` (clears the selection), `select(selection)`, `setOpeningType(type)`, `setOpeningWidth(m)` (clamped to 0.4–3.0), `setUnderlayVisible(v)`, `setUnderlayOpacity(o)` (clamped to 0.1–1).
  - `isTypingTarget(target: EventTarget | null): boolean` exported from `src/hooks/useEditorShortcuts.ts`.

- [ ] **Step 1: Write the failing tests** — `tests/editorShortcuts.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

function Harness() {
  useEditorShortcuts()
  return <textarea aria-label="chat" />
}

describe('editor shortcuts', () => {
  beforeEach(() => useEditorStore.setState({ tool: 'select', selection: null }))

  it('W, O and V choose the tool; Escape returns to select', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'w' })
    expect(useEditorStore.getState().tool).toBe('wall')
    fireEvent.keyDown(window, { key: 'o' })
    expect(useEditorStore.getState().tool).toBe('opening')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('typing in a text field does not switch tools', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('chat'), { key: 'w' })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('choosing a tool clears the selection', () => {
    useEditorStore.setState({ selection: { kind: 'wall', id: 'w1' } })
    useEditorStore.getState().setTool('wall')
    expect(useEditorStore.getState().selection).toBeNull()
  })

  it('keeps the opening width within real door sizes', () => {
    useEditorStore.getState().setOpeningWidth(10)
    expect(useEditorStore.getState().openingWidthM).toBe(3)
    useEditorStore.getState().setOpeningWidth(0)
    expect(useEditorStore.getState().openingWidthM).toBe(0.4)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/editorShortcuts.test.tsx`
Expected: module `../src/stores/editorStore` not found.

- [ ] **Step 3: Implement the store** — `src/stores/editorStore.ts`:

```ts
import { create } from 'zustand'

export type Tool = 'select' | 'wall' | 'opening'
export type Selection = { kind: 'wall' | 'opening'; id: string } | null

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface EditorState {
  tool: Tool
  selection: Selection
  openingType: 'Door' | 'Window'
  openingWidthM: number
  underlayVisible: boolean
  underlayOpacity: number
  setTool: (tool: Tool) => void
  select: (selection: Selection) => void
  setOpeningType: (type: 'Door' | 'Window') => void
  setOpeningWidth: (widthM: number) => void
  setUnderlayVisible: (visible: boolean) => void
  setUnderlayOpacity: (opacity: number) => void
}

// How the user is editing, as opposed to what the plan contains (geometryStore).
export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selection: null,
  openingType: 'Door',
  openingWidthM: 0.9,
  underlayVisible: true,
  underlayOpacity: 0.35,
  setTool: (tool) => set({ tool, selection: null }),
  select: (selection) => set({ selection }),
  setOpeningType: (openingType) => set({ openingType }),
  setOpeningWidth: (widthM) => set({ openingWidthM: clamp(Number.isFinite(widthM) ? widthM : 0.9, 0.4, 3) }),
  setUnderlayVisible: (underlayVisible) => set({ underlayVisible }),
  setUnderlayOpacity: (opacity) => set({ underlayOpacity: clamp(opacity, 0.1, 1) }),
}))
```

- [ ] **Step 4: Implement the shortcuts** — `src/hooks/useEditorShortcuts.ts`:

```ts
import { useEffect } from 'react'
import { Tool, useEditorStore } from '../stores/editorStore'

const TOOL_KEYS: Record<string, Tool> = { v: 'select', w: 'wall', o: 'opening' }

// Keys typed into the co-pilot chat or a number field belong to that field, not to the editor.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function useEditorShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        useEditorStore.getState().setTool('select')
        return
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()]
      if (tool) useEditorStore.getState().setTool(tool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
```

- [ ] **Step 5: Wire the page, the toolbar and the Stage**

`src/pages/StudioPage.tsx`: `import { useEditorShortcuts } from '../hooks/useEditorShortcuts'` and call `useEditorShortcuts()` at the top of the component body.

`StudioToolbar.tsx`: `import { Tool, useEditorStore } from '../../stores/editorStore'`; inside the component:

```tsx
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const toolClass = (t: Tool) =>
    `flex items-center gap-1 px-2.5 py-1 rounded font-medium ${tool === t ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`
```

On the three existing tool buttons (titles "Select & Move (V)", "Wall Tool (W)", "Opening Tool (O)") replace each `className="..."` with `className={toolClass('select')}` / `toolClass('wall')` / `toolClass('opening')`, and add `onClick={() => setTool('select')}` / `'wall'` / `'opening'` plus `aria-pressed={tool === '<tool>'}`.

`CanvasEditor.tsx`: `import { useEditorStore } from '../../../stores/editorStore'`; `const tool = useEditorStore((s) => s.tool)`; on `<Stage>` change `draggable` to `draggable={tool === 'select'}` (a drag with the wall tool draws, it must not pan).

- [ ] **Step 6: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plan2space-web/src/stores/editorStore.ts plan2space-web/src/hooks/useEditorShortcuts.ts plan2space-web/src/pages/StudioPage.tsx plan2space-web/src/components/studio/StudioToolbar.tsx plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx plan2space-web/tests/editorShortcuts.test.tsx
git commit -m "feat: selectable editor tools with toolbar buttons and V/W/O shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Wall tool

**Files:**
- Modify: `plan2space-web/src/components/studio/Canvas2D/canvasTransform.ts` (`screenToPlan`)
- Modify: `plan2space-web/src/lib/planGeometry.ts` (`MIN_WALL_LENGTH_M`, `wallFromDrag`)
- Create: `plan2space-web/src/components/studio/Canvas2D/useWallTool.ts`
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (pointer routing, preview line)
- Create: `plan2space-web/tests/wallTool.test.ts`

**Interfaces:**
- Consumes: `addWall` (Task 9), `useEditorStore.tool` (Task 10), `snapPoint` (`SnapEngine.ts`).
- Produces: `screenToPlan(p: Point): Point`; `MIN_WALL_LENGTH_M = 0.1`; `wallFromDrag(start: Point, end: Point): Point[] | null`; `WALL_SNAP_M = 0.2`; `useWallTool(): { preview: Point[] | null; onPointerDown(p): void; onPointerMove(p): void; onPointerUp(p): void; cancel(): void }` — all points in plan metres.

- [ ] **Step 1: Write the failing tests** — `tests/wallTool.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWallTool } from '../src/components/studio/Canvas2D/useWallTool'
import { screenToPlan, toScreen } from '../src/components/studio/Canvas2D/canvasTransform'
import { wallFromDrag } from '../src/lib/planGeometry'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('wall tool', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false,
    walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
  }))

  it('screenToPlan undoes toScreen', () => {
    expect(screenToPlan(toScreen({ x: 1.5, y: -2 }))).toEqual({ x: 1.5, y: -2 })
  })

  it('a drag shorter than 10 cm is not a wall', () => {
    expect(wallFromDrag({ x: 0, y: 0 }, { x: 0.05, y: 0 })).toBeNull()
    expect(wallFromDrag({ x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }])
  })

  it('a drag becomes a wall whose start snaps onto a nearby wall end', () => {
    // Snapping is what lets hand-drawn walls meet, so the rooms between them close.
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 4.1, y: 0.05 }))
    act(() => result.current.onPointerMove({ x: 4, y: 3 }))
    expect(result.current.preview).toEqual([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    act(() => result.current.onPointerUp({ x: 4, y: 3 }))

    const walls = useGeometryStore.getState().walls
    expect(walls).toHaveLength(2)
    expect(walls[1].points).toEqual([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    expect(result.current.preview).toBeNull()
  })

  it('a click without a drag creates nothing', () => {
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 2, y: 2 }))
    act(() => result.current.onPointerUp({ x: 2, y: 2 }))
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })

  it('cancel drops the wall in progress', () => {
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 2, y: 2 }))
    act(() => result.current.cancel())
    act(() => result.current.onPointerUp({ x: 6, y: 2 }))
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/wallTool.test.ts`
Expected: module `useWallTool` not found; `screenToPlan` / `wallFromDrag` not exported.

- [ ] **Step 3: Implement the helpers** — in `canvasTransform.ts`, after `toScreen`:

```ts
export function screenToPlan(p: Point): Point {
  return { x: p.x / PIXELS_PER_METER, y: -p.y / PIXELS_PER_METER }
}
```

In `src/lib/planGeometry.ts`:

```ts
export const MIN_WALL_LENGTH_M = 0.1

// A press and release closer than this is a click, not a wall.
export function wallFromDrag(start: Point, end: Point): Point[] | null {
  return Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH_M ? null : [start, end]
}
```

- [ ] **Step 4: Implement the hook** — `src/components/studio/Canvas2D/useWallTool.ts`:

```ts
import { useState } from 'react'
import { Point } from '../../../services/geometryService'
import { useGeometryStore } from '../../../stores/geometryStore'
import { wallFromDrag } from '../../../lib/planGeometry'
import { snapPoint } from './SnapEngine'

// Loose enough for a mouse: a wall drawn near another wall's end joins it, so rooms can close.
export const WALL_SNAP_M = 0.2

export function useWallTool() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const addWall = useGeometryStore((s) => s.addWall)

  const snap = (p: Point) => snapPoint(p, useGeometryStore.getState().walls, '', { endpointToleranceM: WALL_SNAP_M })
  const cancel = () => { setStart(null); setEnd(null) }

  return {
    preview: start && end ? [start, end] : null,
    onPointerDown(p: Point) {
      const s = snap(p)
      setStart(s)
      setEnd(s)
    },
    onPointerMove(p: Point) {
      if (start) setEnd(snap(p))
    },
    onPointerUp(p: Point) {
      if (!start) return
      const points = wallFromDrag(start, snap(p))
      if (points) addWall(points)
      cancel()
    },
    cancel,
  }
}
```

- [ ] **Step 5: Route pointer events in `CanvasEditor.tsx`**

Add imports: `Line` is already imported from `react-konva`; add `import { screenToPlan, toScreen } from './canvasTransform'` (merge with the existing `fitView` import) and `import { useWallTool } from './useWallTool'`.

In the component body:

```tsx
  const wallTool = useWallTool()
  // A tool change (including Escape) abandons a wall in progress.
  useEffect(() => { wallTool.cancel() }, [tool])   // eslint-disable-line react-hooks/exhaustive-deps

  function planPointer(e: any) {
    const pos = e.target.getStage()?.getRelativePointerPosition()
    return pos ? screenToPlan(pos) : null
  }
```

On `<Stage>` add:

```tsx
        onMouseDown={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerDown(p)
        }}
        onMouseMove={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerMove(p)
        }}
        onMouseUp={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerUp(p)
        }}
```

Inside `<Layer>`, after `<OpeningLayer />`:

```tsx
          {wallTool.preview && (
            <Line
              points={wallTool.preview.flatMap((p) => { const s = toScreen(p); return [s.x, s.y] })}
              stroke="#60a5fa"
              strokeWidth={0.2 * 50}
              dash={[12, 6]}
              opacity={0.7}
              listening={false}
            />
          )}
```

Replace the hint text `Drag walls to move` with `{tool === 'wall' ? 'Drag to draw a wall · Esc to cancel' : tool === 'opening' ? 'Click a wall to place an opening' : 'Drag walls to move'}`.

- [ ] **Step 6: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plan2space-web/src/components/studio/Canvas2D plan2space-web/src/lib/planGeometry.ts plan2space-web/tests/wallTool.test.ts
git commit -m "feat: draw walls by dragging on the 2D canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Opening tool

**Files:**
- Modify: `plan2space-web/src/lib/planGeometry.ts` (`OPENING_PICK_DISTANCE_M`, `placeOpening`)
- Create: `plan2space-web/src/components/studio/Canvas2D/useOpeningTool.ts`
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (route the opening tool)
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` (door/window choice and width while the tool is active)
- Create: `plan2space-web/tests/openingTool.test.ts`

**Interfaces:**
- Consumes: `addOpening` (existing), `useEditorStore.openingType/openingWidthM` (Task 10), `nearestOnWalls`, `distanceAlong`, `alongClamped`, `polylineLength`, `newId`, `WINDOW_SILL_HEIGHT_M` (Task 9).
- Produces: `OPENING_PICK_DISTANCE_M = 0.5`; `placeOpening(p: Point, walls: Wall[], widthM: number): { wallId: string; position: Point } | null`; `useOpeningTool(): { onPointerDown(p: Point): void }`.

- [ ] **Step 1: Write the failing tests** — `tests/openingTool.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { placeOpening } from '../src/lib/planGeometry'
import { useOpeningTool } from '../src/components/studio/Canvas2D/useOpeningTool'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorStore } from '../src/stores/editorStore'
import { Wall } from '../src/services/geometryService'

const walls: Wall[] = [
  { id: 'long', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
  { id: 'stub', points: [{ x: 0, y: 5 }, { x: 0.5, y: 5 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
]

describe('opening placement', () => {
  it('lands on the wall under the click', () => {
    expect(placeOpening({ x: 2, y: 0.2 }, walls, 0.9)).toEqual({ wallId: 'long', position: { x: 2, y: 0 } })
  })

  it('a click far from every wall places nothing', () => {
    expect(placeOpening({ x: 2, y: 2 }, walls, 0.9)).toBeNull()
  })

  it('near a wall end the opening is pulled inward so it fits', () => {
    const placed = placeOpening({ x: 0.1, y: 0 }, walls, 0.9)!
    expect(placed.position.x).toBeCloseTo(0.45)
    expect(placed.position.y).toBe(0)
  })

  it('a wall shorter than the opening gets nothing', () => {
    expect(placeOpening({ x: 0.25, y: 5 }, walls, 0.9)).toBeNull()
  })
})

describe('opening tool', () => {
  beforeEach(() => {
    useGeometryStore.setState({ projectId: 'p', walls, rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false })
    useEditorStore.setState({ openingType: 'Door', openingWidthM: 0.9 })
  })

  it('places a door at floor level', () => {
    const { result } = renderHook(() => useOpeningTool())
    act(() => result.current.onPointerDown({ x: 2, y: 0.1 }))
    const [door] = useGeometryStore.getState().openings
    expect(door).toMatchObject({ wallId: 'long', type: 'Door', widthMeters: 0.9, sillHeightMeters: 0 })
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
  })

  it('places a window on a 0.9 m sill', () => {
    useEditorStore.setState({ openingType: 'Window', openingWidthM: 1.2 })
    const { result } = renderHook(() => useOpeningTool())
    act(() => result.current.onPointerDown({ x: 2, y: 0.1 }))
    expect(useGeometryStore.getState().openings[0]).toMatchObject({ type: 'Window', widthMeters: 1.2, sillHeightMeters: 0.9 })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/openingTool.test.ts`
Expected: `placeOpening` not exported; `useOpeningTool` module not found.

- [ ] **Step 3: Implement placement** — in `src/lib/planGeometry.ts`:

```ts
// Further than this from any wall, a click is not meant for a wall: nothing is placed.
export const OPENING_PICK_DISTANCE_M = 0.5

export function placeOpening(p: Point, walls: Wall[], widthM: number): { wallId: string; position: Point } | null {
  const hit = nearestOnWalls(p, walls)
  if (!hit || hit.distance > OPENING_PICK_DISTANCE_M) return null
  const wall = walls.find((w) => w.id === hit.wallId)!
  if (polylineLength(wall.points) < widthM) return null
  return { wallId: wall.id, position: alongClamped(wall.points, distanceAlong(wall.points, hit.point), widthM) }
}
```

- [ ] **Step 4: Implement the hook** — `src/components/studio/Canvas2D/useOpeningTool.ts`:

```ts
import { Point } from '../../../services/geometryService'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { newId, placeOpening, WINDOW_SILL_HEIGHT_M } from '../../../lib/planGeometry'

export function useOpeningTool() {
  const addOpening = useGeometryStore((s) => s.addOpening)
  return {
    onPointerDown(p: Point) {
      const { openingType, openingWidthM } = useEditorStore.getState()
      const placed = placeOpening(p, useGeometryStore.getState().walls, openingWidthM)
      if (!placed) return
      addOpening({
        id: newId(), wallId: placed.wallId, type: openingType, position: placed.position, widthMeters: openingWidthM,
        sillHeightMeters: openingType === 'Window' ? WINDOW_SILL_HEIGHT_M : 0, version: 0,
      })
    },
  }
}
```

- [ ] **Step 5: Route it and add the toolbar settings**

`CanvasEditor.tsx`: `import { useOpeningTool } from './useOpeningTool'`; `const openingTool = useOpeningTool()`; in the Stage's `onMouseDown` add `else if (p && tool === 'opening') openingTool.onPointerDown(p)` after the wall branch.

`StudioToolbar.tsx`, directly after the tool-button group's closing `</div>`:

```tsx
      {tool === 'opening' && (
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-300">
          <select
            aria-label="Opening type"
            value={openingType}
            onChange={(e) => setOpeningType(e.target.value as 'Door' | 'Window')}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1"
          >
            <option value="Door">Door</option>
            <option value="Window">Window</option>
          </select>
          <label className="flex items-center gap-1">
            <span>Width</span>
            <input
              aria-label="Opening width in metres"
              type="number" min={0.4} max={3} step={0.1}
              value={openingWidthM}
              onChange={(e) => setOpeningWidth(parseFloat(e.target.value))}
              className="w-16 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1"
            />
            <span>m</span>
          </label>
        </div>
      )}
```

with, in the component body:

```tsx
  const openingType = useEditorStore((s) => s.openingType)
  const openingWidthM = useEditorStore((s) => s.openingWidthM)
  const setOpeningType = useEditorStore((s) => s.setOpeningType)
  const setOpeningWidth = useEditorStore((s) => s.setOpeningWidth)
```

- [ ] **Step 6: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plan2space-web/src/lib/planGeometry.ts plan2space-web/src/components/studio plan2space-web/tests/openingTool.test.ts
git commit -m "feat: place doors and windows on walls from the 2D canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Select, delete and reshape

**Files:**
- Modify: `plan2space-web/src/hooks/useEditorShortcuts.ts` (Delete / Backspace)
- Modify: `plan2space-web/src/components/studio/Canvas2D/WallLayer.tsx` (select, highlight, endpoint handles, drag only with the select tool)
- Modify: `plan2space-web/src/components/studio/Canvas2D/OpeningLayer.tsx` (select, highlight)
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (a click on empty canvas clears the selection)
- Modify: `plan2space-web/tests/editorShortcuts.test.tsx`

**Interfaces:**
- Consumes: `deleteWall`, `deleteOpening`, `moveWallPoint` (Task 9); `useEditorStore.selection/select/tool` (Task 10); `screenToPlan` (Task 11); `WALL_SNAP_M` (Task 11).
- Produces: Delete/Backspace removes the selected wall (with its openings) or opening and clears the selection.

- [ ] **Step 1: Write the failing tests** — append to `tests/editorShortcuts.test.tsx` (add `import { useGeometryStore } from '../src/stores/geometryStore'` at the top):

```tsx
describe('deleting the selection', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      projectId: 'p', rooms: [], version: 1, dirty: false, wallsEdited: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      openings: [{ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 1, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
    })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'wall', id: 'w1' } })
  })

  it('Delete removes the selected wall and its door, then clears the selection', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().walls).toHaveLength(0)
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useEditorStore.getState().selection).toBeNull()
  })

  it('Backspace removes a selected opening only', () => {
    useEditorStore.setState({ selection: { kind: 'opening', id: 'd1' } })
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })

  it('Backspace while typing in the chat deletes nothing', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('chat'), { key: 'Backspace' })
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/editorShortcuts.test.tsx`
Expected: the first two new tests fail (nothing is deleted); the third passes.

- [ ] **Step 3: Implement deletion** — in `useEditorShortcuts.ts` add `import { useGeometryStore } from '../stores/geometryStore'` and, inside `onKeyDown` after the `Escape` branch:

```ts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection, select } = useEditorStore.getState()
        if (!selection) return
        e.preventDefault()
        if (selection.kind === 'wall') useGeometryStore.getState().deleteWall(selection.id)
        else useGeometryStore.getState().deleteOpening(selection.id)
        select(null)
        return
      }
```

- [ ] **Step 4: Selection and handles on the canvas**

`WallLayer.tsx` — replace the component with:

```tsx
import React from 'react'
import { Circle, Line } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { snapPoint } from './SnapEngine'
import { PIXELS_PER_METER, screenDeltaToPlan, screenToPlan, toScreen } from './canvasTransform'
import { WALL_SNAP_M } from './useWallTool'

export { PIXELS_PER_METER }

const HANDLE_RADIUS_PX = 7

export function WallLayer() {
  const walls = useGeometryStore((s) => s.walls)
  const updateWall = useGeometryStore((s) => s.updateWall)
  const moveWallPoint = useGeometryStore((s) => s.moveWallPoint)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const editable = tool === 'select'

  return (
    <>
      {walls.map((wall) => {
        const selected = selection?.kind === 'wall' && selection.id === wall.id
        return (
          <React.Fragment key={wall.id}>
            <Line
              wallId={wall.id}
              points={wall.points.flatMap((p) => { const s = toScreen(p); return [s.x, s.y] })}
              stroke={selected ? '#60a5fa' : '#e2e8f0'}
              strokeWidth={wall.thicknessMeters * PIXELS_PER_METER}
              lineCap="square"
              lineJoin="miter"
              listening={editable}
              draggable={editable}
              onClick={() => select({ kind: 'wall', id: wall.id })}
              onTap={() => select({ kind: 'wall', id: wall.id })}
              onDragEnd={(e) => {
                const delta = screenDeltaToPlan(e.target.x(), e.target.y())
                const rawPoints = wall.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
                const snapped = rawPoints.map((p) => snapPoint(p, useGeometryStore.getState().walls, wall.id))
                updateWall(wall.id, snapped)
                e.target.position({ x: 0, y: 0 })
              }}
            />
            {selected && editable && wall.points.map((p, index) => {
              const s = toScreen(p)
              return (
                <Circle
                  key={index}
                  x={s.x}
                  y={s.y}
                  radius={HANDLE_RADIUS_PX}
                  fill="#0d0d10"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e) => {
                    const target = snapPoint(screenToPlan({ x: e.target.x(), y: e.target.y() }),
                      useGeometryStore.getState().walls, wall.id, { endpointToleranceM: WALL_SNAP_M })
                    moveWallPoint(wall.id, index, target)
                  }}
                />
              )
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}
```

`OpeningLayer.tsx` — add `import { useEditorStore } from '../../../stores/editorStore'`, read `tool`, `selection`, `select`, and on the `<Rect>` add:

```tsx
            listening={tool === 'select'}
            onClick={() => select({ kind: 'opening', id: o.id })}
            onTap={() => select({ kind: 'opening', id: o.id })}
            stroke={selection?.kind === 'opening' && selection.id === o.id ? '#ffffff' : undefined}
            strokeWidth={2}
```

`CanvasEditor.tsx` — in the Stage's `onMouseDown`, add a final branch: `else if (tool === 'select' && e.target === e.target.getStage()) useEditorStore.getState().select(null)`.

- [ ] **Step 5: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass (the existing `WallLayer.test.tsx` still renders one Line per wall).

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src plan2space-web/tests/editorShortcuts.test.tsx
git commit -m "feat: select, delete and reshape walls and openings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Rooms follow the edited walls on save

**Files:**
- Modify: `plan2space-web/src/services/geometryService.ts` (`deriveRooms`)
- Modify: `plan2space-web/src/stores/geometryStore.ts` (`saveToServer`)
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` (notice)
- Create: `plan2space-web/tests/roomRefresh.test.ts`

**Interfaces:**
- Consumes: `POST /api/rooms/derive` (Task 8); `wallsEdited`, `roomsRefreshFailed` (Task 9).
- Produces: `deriveRooms(walls: Wall[]): Promise<{ points: Point[]; label: string }[]>`. `saveToServer` derives rooms first whenever `wallsEdited` is true.

- [ ] **Step 1: Write the failing tests** — `tests/roomRefresh.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }]
const oldRoom = { id: 'r-old', points: square, label: 'Room 1', version: 1 }

describe('rooms on save', () => {
  beforeEach(() => {
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({
      projectId: 'p', rooms: [oldRoom], openings: [], version: 1, dirty: true, wallsEdited: false, roomsRefreshFailed: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    })
  })

  it('after a wall edit the rooms are derived again and saved', async () => {
    vi.mocked(geometryService.deriveRooms).mockResolvedValue([{ points: square, label: 'Room 1' }, { points: square, label: 'Room 2' }])
    useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])

    await useGeometryStore.getState().saveToServer('p')

    expect(vi.mocked(geometryService.deriveRooms).mock.calls[0][0]).toHaveLength(2)
    const saved = vi.mocked(geometryService.saveGeometry).mock.calls[0][2]
    expect(saved.rooms.map((r) => r.label)).toEqual(['Room 1', 'Room 2'])
    expect(useGeometryStore.getState().rooms).toHaveLength(2)
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
  })

  it('when rooms cannot be derived the walls still save with the old rooms, and the next save retries', async () => {
    vi.mocked(geometryService.deriveRooms).mockRejectedValue(new Error('503'))
    useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])

    await useGeometryStore.getState().saveToServer('p')

    const saved = vi.mocked(geometryService.saveGeometry).mock.calls[0][2]
    expect(saved.walls).toHaveLength(2)
    expect(saved.rooms.map((r) => r.id)).toEqual(['r-old'])
    expect(useGeometryStore.getState().roomsRefreshFailed).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('an opening-only edit does not re-derive rooms', async () => {
    useGeometryStore.getState().addOpening({ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 1, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 0 })

    await useGeometryStore.getState().saveToServer('p')

    expect(geometryService.deriveRooms).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/roomRefresh.test.ts`
Expected: failures — `deriveRooms` is not a mocked export (it does not exist), and rooms are not refreshed.

- [ ] **Step 3: Add the service call** — in `src/services/geometryService.ts`:

```ts
// Rooms are derived from the wall graph by the same code the import uses (ai-service, via the API).
export async function deriveRooms(walls: Wall[]): Promise<{ points: Point[]; label: string }[]> {
  const { data } = await apiClient.post('/rooms/derive', { walls: walls.map((w) => ({ points: w.points })) })
  return data.rooms
}
```

- [ ] **Step 4: Derive before saving** — in `geometryStore.ts`, import `deriveRooms` alongside the other service imports, and replace `saveToServer`:

```ts
    saveToServer: async (projectId) => {
      let rooms = get().rooms
      let roomsRefreshFailed = false
      if (get().wallsEdited) {
        try {
          const derived = await deriveRooms(get().walls)
          if (!Array.isArray(derived)) throw new Error('No rooms returned')
          rooms = derived.map((r) => ({ id: newId(), points: r.points, label: r.label, version: 0 }))
        } catch {
          // The walls still save; the previous rooms stay until a later save derives them again.
          roomsRefreshFailed = true
        }
      }
      const { walls, openings, version } = get()
      try {
        const result = await saveGeometry(projectId, version, {
          walls: walls.map((w) => ({ id: w.id, points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
          rooms: rooms.map((r) => ({ id: r.id, points: r.points, label: r.label })),
          openings: openings.map((o) => ({ id: o.id, wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters }))
        })
        clearDraft(projectId)
        set({ rooms, version: result.version, saveConflict: false, dirty: false,
              wallsEdited: roomsRefreshFailed, roomsRefreshFailed })
      } catch (err: any) {
        if (err?.response?.status === 409) {
          set({ saveConflict: true })
          return
        }
        throw err
      }
    }
```

- [ ] **Step 5: Tell the user** — in `StudioToolbar.tsx`, read `const roomsRefreshFailed = useGeometryStore((s) => s.roomsRefreshFailed)` and render, next to the existing `actionError` alert:

```tsx
      {roomsRefreshFailed && (
        <span role="status" className="text-[11px] text-amber-400">
          Saved, but rooms could not be recalculated. They will be retried on the next save.
        </span>
      )}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass, including `StudioSaveFlow.test.tsx` and `unsavedEdits.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add plan2space-web/src/services/geometryService.ts plan2space-web/src/stores/geometryStore.ts plan2space-web/src/components/studio/StudioToolbar.tsx plan2space-web/tests/roomRefresh.test.ts
git commit -m "feat: re-derive rooms from hand-edited walls when saving

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: The source image under the canvas

**Files:**
- Create: `plan2space-web/src/services/underlayService.ts`
- Modify: `plan2space-web/src/components/studio/Canvas2D/canvasTransform.ts` (`underlayRect`)
- Create: `plan2space-web/src/components/studio/Canvas2D/useUnderlay.ts`
- Create: `plan2space-web/src/components/studio/Canvas2D/UnderlayLayer.tsx`
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (layer + controls)
- Create: `plan2space-web/tests/underlay.test.ts`

**Interfaces:**
- Consumes: `GET /api/projects/{id}/underlay` (Task 6), `GET /api/projects/{id}/files/{fileId}/content` (Task 7), `underlayVisible/underlayOpacity` (Task 10).
- Produces: `Underlay { fileId: string; metresPerPixel: number; widthPx: number; heightPx: number }`; `fetchUnderlay(projectId): Promise<Underlay | null>`; `fetchFileObjectUrl(projectId, fileId): Promise<string>`; `underlayRect(u: Underlay): { x; y; width; height }` in stage pixels; `useUnderlay(): { underlay: Underlay; image: HTMLImageElement } | null`.

- [ ] **Step 1: Write the failing tests** — `tests/underlay.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { underlayRect } from '../src/components/studio/Canvas2D/canvasTransform'
import { useUnderlay } from '../src/components/studio/Canvas2D/useUnderlay'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as underlayService from '../src/services/underlayService'

vi.mock('../src/services/underlayService')

describe('underlay placement', () => {
  it('puts image pixel (0,0) at plan (0, H·mpp) and spans W·mpp by H·mpp metres', () => {
    // The worker mapped pixel (px, py) to metres (px·mpp, (H − py)·mpp); 1 m = 50 stage px.
    const rect = underlayRect({ fileId: 'f', metresPerPixel: 0.02, widthPx: 300, heightPx: 200 })
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(-200)
    expect(rect.width).toBeCloseTo(300)
    expect(rect.height).toBeCloseTo(200)
  })
})

describe('useUnderlay', () => {
  beforeEach(() => {
    vi.mocked(underlayService.fetchUnderlay).mockReset()
    vi.mocked(underlayService.fetchFileObjectUrl).mockReset().mockResolvedValue('blob:x')
    useGeometryStore.setState({ projectId: 'p', version: 1 })
  })

  it('a project without an underlay downloads no image', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockResolvedValue(null)
    const { result } = renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchUnderlay).toHaveBeenCalledWith('p'))
    expect(underlayService.fetchFileObjectUrl).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('downloads the image named by the underlay', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockResolvedValue({ fileId: 'f1', metresPerPixel: 0.02, widthPx: 300, heightPx: 200 })
    renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchFileObjectUrl).toHaveBeenCalledWith('p', 'f1'))
  })

  it('a failed underlay request is not an error', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchUnderlay).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/underlay.test.ts`
Expected: modules `underlayService` and `useUnderlay` not found; `underlayRect` not exported.

- [ ] **Step 3: Implement the service** — `src/services/underlayService.ts`:

```ts
import { apiClient } from './api'

export interface Underlay {
  fileId: string
  metresPerPixel: number
  widthPx: number
  heightPx: number
}

// 204 = the latest import has no image to show (a DXF or PDF, or nothing imported yet).
export async function fetchUnderlay(projectId: string): Promise<Underlay | null> {
  const res = await apiClient.get(`/projects/${projectId}/underlay`)
  return res.status === 204 ? null : res.data
}

// An <img> cannot send the bearer token, so the image is fetched as a blob and shown from an object URL.
export async function fetchFileObjectUrl(projectId: string, fileId: string): Promise<string> {
  const { data } = await apiClient.get(`/projects/${projectId}/files/${fileId}/content`, { responseType: 'blob' })
  return URL.createObjectURL(data)
}
```

- [ ] **Step 4: Implement placement** — in `canvasTransform.ts` (add `import { Underlay } from '../../../services/underlayService'`):

```ts
// The worker mapped pixel (px, py) to metres (px·mpp, (H − py)·mpp): the image's top-left corner is plan (0, H·mpp).
export function underlayRect(u: Underlay): { x: number; y: number; width: number; height: number } {
  const topLeft = toScreen({ x: 0, y: u.heightPx * u.metresPerPixel })
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: u.widthPx * u.metresPerPixel * PIXELS_PER_METER,
    height: u.heightPx * u.metresPerPixel * PIXELS_PER_METER,
  }
}
```

- [ ] **Step 5: Implement the hook** — `src/components/studio/Canvas2D/useUnderlay.ts`:

```ts
import { useEffect, useState } from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'
import { fetchFileObjectUrl, fetchUnderlay, Underlay } from '../../../services/underlayService'

// The latest import's image, if it has one. Re-checked when the plan version changes (a new import);
// the image itself is downloaded again only when it is a different file.
export function useUnderlay(): { underlay: Underlay; image: HTMLImageElement } | null {
  const projectId = useGeometryStore((s) => s.projectId)
  const version = useGeometryStore((s) => s.version)
  const [underlay, setUnderlay] = useState<Underlay | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetchUnderlay(projectId)
      .then((u) => { if (!cancelled) setUnderlay(u) })
      .catch(() => { if (!cancelled) setUnderlay(null) })   // no underlay is never an error
    return () => { cancelled = true }
  }, [projectId, version])

  const fileId = underlay?.fileId
  useEffect(() => {
    setImage(null)
    if (!projectId || !fileId) return
    let cancelled = false
    let url: string | null = null
    fetchFileObjectUrl(projectId, fileId)
      .then((objectUrl) => {
        url = objectUrl
        if (cancelled) return
        const img = new window.Image()
        img.onload = () => { if (!cancelled) setImage(img) }
        img.src = objectUrl
      })
      .catch(() => { if (!cancelled) setImage(null) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [projectId, fileId])

  return underlay && image ? { underlay, image } : null
}
```

- [ ] **Step 6: Draw it** — `src/components/studio/Canvas2D/UnderlayLayer.tsx`:

```tsx
import React from 'react'
import { Image as KonvaImage } from 'react-konva'
import { Underlay } from '../../../services/underlayService'
import { underlayRect } from './canvasTransform'

export function UnderlayLayer({ underlay, image, opacity }: { underlay: Underlay; image: HTMLImageElement; opacity: number }) {
  const rect = underlayRect(underlay)
  return <KonvaImage image={image} {...rect} opacity={opacity} listening={false} />
}
```

In `CanvasEditor.tsx`: import `useUnderlay`, `UnderlayLayer`, and `ImageIcon` from `lucide-react`; read `underlayVisible`, `underlayOpacity`, `setUnderlayVisible`, `setUnderlayOpacity` from `useEditorStore`; `const underlay = useUnderlay()`.

Make it the first child of `<Layer>`:

```tsx
          {underlay && underlayVisible && (
            <UnderlayLayer underlay={underlay.underlay} image={underlay.image} opacity={underlayOpacity} />
          )}
```

Inside the floating controls bar, after the zoom percentage `<span>`:

```tsx
        {underlay && (
          <>
            <div className="h-4 w-px bg-zinc-800 mx-0.5" />
            <button
              onClick={() => setUnderlayVisible(!underlayVisible)}
              aria-pressed={underlayVisible}
              className={`p-1.5 rounded hover:bg-zinc-800 transition ${underlayVisible ? 'text-blue-400' : 'text-zinc-400'}`}
              title="Show the imported image under the plan"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              type="range" min={0.1} max={1} step={0.05}
              value={underlayOpacity}
              onChange={(e) => setUnderlayOpacity(parseFloat(e.target.value))}
              aria-label="Image opacity"
              className="w-20"
              disabled={!underlayVisible}
            />
          </>
        )}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src/services/underlayService.ts plan2space-web/src/components/studio/Canvas2D plan2space-web/tests/underlay.test.ts
git commit -m "feat: show the imported image under the 2D plan for tracing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase E — Verification

### Task 16: Whole-stack check against the real images

**Files:**
- Modify (only if tuning is needed): `ai-service/pipeline/vectorize.py` constants `KERNEL_TO_HALF_WIDTH`, `MIN_WALL_HALF_WIDTH_PX`, `MIN_KEPT_FRACTION`

**Interfaces:** none new.

- [ ] **Step 1: Run every suite**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`
Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Run: `dotnet test backend/Plan2Space.sln`
Expected: all pass. Report any failure by name, whether or not this plan caused it.

- [ ] **Step 2: Measure the two real images** — they are the user's and stay out of the repo: `E:\Project Indivdual\AutoCad\ban-ve-thiet-ke-nha-cap-4-dep-4.jpg`, and the AutoCAD screenshot saved at `%TEMP%\p2s\user.png`. If that copy is gone, the screenshot is MinIO object `projects/40477133-c801-44d0-a936-caa3545e632e/64e2f2f6-1115-46b1-9942-6242cfe55f92.png` in bucket `plan2space-uploads`; download it inside the `ai` container with `pipeline.api_client.download_from_minio` and copy it out with `docker compose cp`. For each image, with the local venv:

```bash
cd ai-service && .venv/Scripts/python.exe -c "
import sys, workers.celery_app
from workers.tasks import _raster_to_project_space
from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import rooms_from_walls
walls, _, underlay = _raster_to_project_space(sys.argv[1])
rooms = rooms_from_walls(heal_wall_topology(walls, snap_tolerance_m=0.05))
print(len(walls), 'walls', len(rooms), 'rooms', underlay)" "<path to image>"
```

Baselines before this plan: the furnished `.jpg` gave 801 walls and 1 room; the AutoCAD screenshot gave 1107 walls and 9 rooms. The target is a large drop in walls with the room count not falling. If the furnished image stays above ~60 walls, tune `KERNEL_TO_HALF_WIDTH` (between 1.2 and 1.8) and re-run until both images improve **and** `tests/test_thick_stroke_filter.py` still passes; commit any change with the measured numbers in the message.

- [ ] **Step 3: Confirm the DXF results are unchanged**

```bash
cd ai-service && .venv/Scripts/python.exe -c "
from pipeline.dxf_parser import parse_dxf
from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import rooms_from_walls
d = parse_dxf('tests/fixtures/sample_house_plan.dxf')
print(len(d['walls']), 'walls', len(rooms_from_walls(heal_wall_topology(d['walls'], snap_tolerance_m=0.005))), 'rooms')"
```

Expected: `6 walls 3 rooms`.

- [ ] **Step 4: Rebuild the stack and run the smoke test**

Run: `docker compose up -d --build`
Run: `bash scripts/smoke-test-full-stack.sh`
Expected: `PASS: full-stack smoke test succeeded end to end`.

- [ ] **Step 5: Walk the feature in the browser** — at http://localhost as `test@plan2space.dev` / `Test1234!` (each check is a thing a person would notice at once):
  1. New project → import the furnished `.jpg` → the image appears dimmed under the draft walls; the image toggle and opacity slider work.
  2. Press W, drag a wall from one wall end to another → it joins them (snaps). Esc mid-drag cancels.
  3. Press O, choose Door 0.9 m, click a wall → a door appears on it; clicking open floor does nothing.
  4. Press V, click a wall, press Delete → the wall and its door go. Typing "w" in the co-pilot chat does not switch tools.
  5. Save → rooms are recalculated; the 3D view shows the door cut through the wall.
  6. Import a DXF into the same project → the old image is gone.

- [ ] **Step 6: Push and watch CI**

```bash
git push origin main
gh run watch "$(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: all four jobs green.
