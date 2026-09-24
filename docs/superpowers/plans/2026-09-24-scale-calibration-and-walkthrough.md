# Scale Calibration and Walk-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user fix an imported plan's scale with one measured line, then walk through the house — with floors, ceilings, painted walls, glazed windows and soft light — full screen with WASD and the mouse.

**Architecture:** A Measure tool in the 2D editor computes a factor, the geometry store scales every position by it and saves, and a new `PUT /api/projects/{id}/underlay` rewrites the latest import's metres-per-pixel so the underlay stays aligned. The 3D house is extracted into one `HouseModel` (walls, floors, ceilings, window glass) used by both the 3D pane and a full-screen `WalkMode`. Walking is driven by pure functions (`moveVector`, `stepPlayer`, `wallBlockers`, `spawnPoint`) in `src/lib/walkPhysics.ts`, called from a `useFrame` loop under drei's `PointerLockControls`.

**Tech Stack:** React 18 + TypeScript, Zustand, react-konva, three.js 0.169 + @react-three/fiber 8 + @react-three/drei 9, vitest + Testing Library; ASP.NET Core 8 (MediatR, EF Core), xUnit + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-24-scale-calibration-and-walkthrough-design.md`

## Global Constraints

- Branch `feature/scale-and-walkthrough`, based on `feature/image-import-editing` (unmerged).
- Calibration scales **positions only** (wall points, opening positions, room points) about plan origin `(0, 0)`; wall thickness, wall height, opening width and sill height are unchanged.
- A measured length under **0.05 m**, or a real length that is not a finite number > 0, is refused.
- The underlay PUT is sent **only after the geometry save succeeded without conflict**.
- Walk-through is desktop only: W/A/S/D (and arrow keys), mouse look, Shift to run, Escape to pause.
- Walk speed **1.4 m/s**, run **3 m/s**, eye height **1.6 m**, player radius **0.25 m**, physics step capped at **0.05 s**.
- A room under **6 m²** gets tile; any other room gets wood.
- Door openings are **2.1 m** high, window openings **1.2 m** above their sill (the existing CSG cut, `cutOpenings.ts:26`).
- Plan → world: plan point `(x, y)` at height `h` is world `(x, h, −y)` (the scene group is rotated −90° about X).
- Textures are drawn on canvases in code; no asset files. In jsdom `getContext` returns null: the code must fall back to plain colours.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test commands, from the repo root:
  - Web: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
  - .NET: `dotnet test backend/Plan2Space.sln` (Docker must be running)

## Rulings against the spec

- **R1** — The spec's `PUT … { metresPerPixel }` takes an **absolute** value (idempotent on retry). The client computes it as the current underlay's value × the factor, so the calibration orchestration needs the current underlay; `CanvasEditor` already holds it from `useUnderlay`.
- **R2** — After the PUT the underlay must be re-fetched, but the save already bumped the plan version and `useUnderlay` may have re-fetched *before* the PUT landed. `editorStore.underlayRevision` is bumped after the PUT and `useUnderlay` depends on it.
- **R3** — drei's `PointerLockControls` without a `selector` locks on **any** click in the document, including the *Exit* button. It is given `selector="#walk-continue"`, and that button stays mounted (hidden with CSS while locked) because drei binds its click listener once, to the element present when it mounts.
- **R4** — While walking, the editor shortcuts (V/W/O/M, Delete, Backspace, Escape) must not act: W would switch the editor tool and Backspace could delete the selected wall behind the full-screen view. `useEditorShortcuts` returns early while `walking` is true.
- **R5** — The Walk button is disabled when the plan has no walls: there is nothing to walk in.

## Review Focus

- **Pressing W/A/S/D, Delete or Backspace while walking** — the player moves; no editor tool changes and nothing is deleted. Pinned in Task 7.
- **Calibrating twice** — the second calibration multiplies the already-corrected underlay value, so the image stays aligned. Pinned in Task 4.
- **Measuring a zero-length line, or typing 0, a negative number or text** — refused with a message; nothing is scaled or saved. Pinned in Tasks 2 and 3.
- **Walking diagonally into a wall corner, or a long frame (tab switch)** — the player stays inside; no tunnelling through a wall. Pinned in Task 6.
- **Opening the walk-through on a plan with walls but no rooms** — one floor, a centre spawn, no crash. Pinned in Tasks 5 and 6.

## File Structure

**backend**
- `src/Plan2Space.Application/Files/Commands/SetUnderlayScaleCommand.cs` — create.
- `src/Plan2Space.API/Controllers/UnderlayController.cs` — modify: `PUT`.
- `tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs` — modify.

**plan2space-web**
- `src/lib/planGeometry.ts` — modify: `polygonArea`, `polygonCentroid`, `calibrationFactor`, `MIN_MEASURE_M`.
- `src/stores/geometryStore.ts` — modify: `scalePlan`.
- `src/stores/editorStore.ts` — modify: `'measure'` tool, `walking`, `underlayRevision`.
- `src/hooks/useEditorShortcuts.ts` — modify: M key; ignore keys while walking.
- `src/services/underlayService.ts` — modify: `setUnderlayScale`.
- `src/components/studio/Canvas2D/useMeasureTool.ts`, `applyCalibration.ts`, `CalibrationDialog.tsx` — create.
- `src/components/studio/Canvas2D/useUnderlay.ts`, `CanvasEditor.tsx` — modify.
- `src/components/studio/StudioToolbar.tsx` — modify: Measure button.
- `src/components/studio/Viewer3D/floorPlan.ts`, `textures.ts`, `HouseModel.tsx` — create.
- `src/components/studio/Viewer3D/cutOpenings.ts` — modify: export `segmentAngleAt`.
- `src/components/studio/Viewer3D/Scene.tsx` — modify: use `HouseModel`, lights, Walk button.
- `src/lib/walkPhysics.ts` — create.
- `src/components/studio/Walk/useMovementKeys.ts`, `WalkMode.tsx` — create.
- `src/pages/StudioPage.tsx` — modify: render `WalkMode` while walking.
- Tests: `calibration.test.ts`, `measureTool.test.ts`, `applyCalibration.test.ts`, `floorPlan.test.ts`, `walkPhysics.test.ts`, `walkShortcuts.test.tsx` — create.

---

### Task 1: Store a corrected underlay scale

**Files:**
- Create: `backend/src/Plan2Space.Application/Files/Commands/SetUnderlayScaleCommand.cs`
- Modify: `backend/src/Plan2Space.API/Controllers/UnderlayController.cs`
- Modify: `backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs`

**Interfaces:**
- Produces: `PUT /api/projects/{projectId}/underlay` with body `{ metresPerPixel: number }` → 204; 400 when the value is not finite and > 0; 404 for a project the caller does not own or one whose latest completed import has no underlay. Afterwards `GET` returns the new value.

- [ ] **Step 1: Write the failing tests** — append inside `UnderlayTests`:

```csharp
    [Fact]
    public async Task ACorrectedScale_ReplacesTheImportsMapping()
    {
        var (client, projectId) = await OwnerAsync("underlay-scale@plan2space.dev");
        var (_, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.0152 });

        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{projectId}/underlay");
        Assert.Equal(0.0152, body.GetProperty("metresPerPixel").GetDouble());
        Assert.Equal(300, body.GetProperty("widthPx").GetInt32());
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-0.02)]
    public async Task ANonPositiveScale_Returns400(double value)
    {
        var (client, projectId) = await OwnerAsync($"underlay-bad-scale-{Guid.NewGuid():N}@plan2space.dev");
        var (_, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = value });

        Assert.Equal(HttpStatusCode.BadRequest, put.StatusCode);
    }

    [Fact]
    public async Task ScalingAProjectWithoutAnUnderlay_Returns404()
    {
        var (client, projectId) = await OwnerAsync("underlay-scale-none@plan2space.dev");

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.02 });

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
    }

    [Fact]
    public async Task ScalingSomeoneElsesUnderlay_Returns404()
    {
        var (owner, projectId) = await OwnerAsync("underlay-scale-owner@plan2space.dev");
        var (_, jobId) = await ImportAsync(owner, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });
        var (stranger, _) = await OwnerAsync("underlay-scale-stranger@plan2space.dev");

        var put = await stranger.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.02 });

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
    }
```

- [ ] **Step 2: Run them and watch them fail**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~UnderlayTests"`
Expected: the four new tests fail with `MethodNotAllowed` (405); the existing four pass.

- [ ] **Step 3: Add the command** — `SetUnderlayScaleCommand.cs`:

```csharp
using System.Text.Json.Nodes;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Commands;

// The user measured a known length on the plan: the import's pixel-to-metre mapping was wrong by that factor.
// The correction is written into the result of the import it belongs to, so a later import of another
// image never inherits it.
public record SetUnderlayScaleCommand(Guid ProjectId, Guid RequestingUserId, double MetresPerPixel) : IRequest;

public class SetUnderlayScaleHandler : IRequestHandler<SetUnderlayScaleCommand>
{
    private readonly IPlan2SpaceDbContext _db;
    public SetUnderlayScaleHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task Handle(SetUnderlayScaleCommand cmd, CancellationToken ct)
    {
        if (!double.IsFinite(cmd.MetresPerPixel) || cmd.MetresPerPixel <= 0)
            throw new ArgumentException("metresPerPixel must be a positive number.");
        if (!await _db.Projects.AnyAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct))
            throw new KeyNotFoundException();

        var job = await _db.AiJobs
            .Where(j => j.ProjectId == cmd.ProjectId && j.Status == AiJobStatus.Completed)
            .OrderByDescending(j => j.CompletedAt)
            .FirstOrDefaultAsync(ct);
        var result = job?.ResultJson is null ? null : JsonNode.Parse(job.ResultJson) as JsonObject;
        if (result?["underlay"] is not JsonObject underlay)
            throw new KeyNotFoundException();

        underlay["metresPerPixel"] = cmd.MetresPerPixel;
        job!.ResultJson = result.ToJsonString();
        await _db.SaveChangesAsync(ct);
    }
}
```

- [ ] **Step 4: Add the action** — in `UnderlayController` (add `using Plan2Space.Application.Files.Commands;`):

```csharp
    public record ScaleRequest(double MetresPerPixel);

    [HttpPut]
    public async Task<IActionResult> Put(Guid projectId, ScaleRequest req, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new SetUnderlayScaleCommand(projectId, CurrentUserId, req.MetresPerPixel), ct);
            return NoContent();
        }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        catch (KeyNotFoundException) { return NotFound(); }
    }
```

- [ ] **Step 5: Run the tests**

Run: `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~UnderlayTests"`
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/Plan2Space.Application/Files/Commands/SetUnderlayScaleCommand.cs backend/src/Plan2Space.API/Controllers/UnderlayController.cs backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs
git commit -m "feat: let the user correct an import's pixel-to-metre scale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Calibration math and scaling the plan

**Files:**
- Modify: `plan2space-web/src/lib/planGeometry.ts`
- Modify: `plan2space-web/src/stores/geometryStore.ts`
- Create: `plan2space-web/tests/calibration.test.ts`

**Interfaces:**
- Produces (`planGeometry.ts`): `MIN_MEASURE_M = 0.05`; `calibrationFactor(measuredM: number, realM: number): number | null`; `polygonArea(points: Point[]): number` (absolute, closed or open ring); `polygonCentroid(points: Point[]): Point`.
- Produces (`GeometryState`): `scalePlan(factor: number): void` — multiplies wall points, opening positions and room points; leaves sizes; marks the plan edited.

- [ ] **Step 1: Write the failing tests** — `tests/calibration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { calibrationFactor, polygonArea, polygonCentroid } from '../src/lib/planGeometry'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('calibration factor', () => {
  it('is the real length over the measured one', () => {
    expect(calibrationFactor(34, 7)).toBeCloseTo(7 / 34)
  })

  it('refuses a line too short to measure, and a real length that is not a positive number', () => {
    expect(calibrationFactor(0, 7)).toBeNull()
    expect(calibrationFactor(0.01, 7)).toBeNull()
    expect(calibrationFactor(5, 0)).toBeNull()
    expect(calibrationFactor(5, -2)).toBeNull()
    expect(calibrationFactor(5, Number.NaN)).toBeNull()
    expect(calibrationFactor(5, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('polygon helpers', () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }]
  it('measures area and centre of a closed ring', () => {
    expect(polygonArea(square)).toBeCloseTo(12)
    expect(polygonCentroid(square)).toEqual({ x: 2, y: 1.5 })
  })
})

describe('scalePlan', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', version: 1, dirty: false, wallsEdited: false,
    walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    openings: [{ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 4, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
    rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 0 }] }],
  }))

  it('scales every position about the origin and keeps real-world sizes', () => {
    useGeometryStore.getState().scalePlan(0.5)
    const { walls, openings, rooms, dirty } = useGeometryStore.getState()
    expect(walls[0].points[1]).toEqual({ x: 5, y: 0 })
    expect(walls[0].thicknessMeters).toBe(0.2)
    expect(walls[0].heightMeters).toBe(2.8)
    expect(openings[0].position).toEqual({ x: 2, y: 0 })
    expect(openings[0].widthMeters).toBe(0.9)
    expect(rooms[0].points[2]).toEqual({ x: 5, y: 4 })
    expect(dirty).toBe(true)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/calibration.test.ts`
Expected: failures — `calibrationFactor` / `polygonArea` / `polygonCentroid` not exported; `scalePlan is not a function`.

- [ ] **Step 3: Implement the helpers** — append to `src/lib/planGeometry.ts`:

```ts
// Shorter than this, a measured line is a mis-click, not a dimension.
export const MIN_MEASURE_M = 0.05

// How much every position must be multiplied by so the measured line becomes its real length.
export function calibrationFactor(measuredM: number, realM: number): number | null {
  if (!(measuredM >= MIN_MEASURE_M) || !Number.isFinite(realM) || !(realM > 0)) return null
  return realM / measuredM
}

function ring(points: Point[]): Point[] {
  const n = points.length
  return n > 1 && points[0].x === points[n - 1].x && points[0].y === points[n - 1].y ? points.slice(0, -1) : points
}

export function polygonArea(points: Point[]): number {
  const p = ring(points)
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function polygonCentroid(points: Point[]): Point {
  const p = ring(points)
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const s = p[i]
    const t = p[(i + 1) % p.length]
    const cross = s.x * t.y - t.x * s.y
    a += cross
    cx += (s.x + t.x) * cross
    cy += (s.y + t.y) * cross
  }
  if (Math.abs(a) < 1e-12) {
    return { x: p.reduce((m, q) => m + q.x, 0) / p.length, y: p.reduce((m, q) => m + q.y, 0) / p.length }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}
```

- [ ] **Step 4: Implement `scalePlan`** — in `geometryStore.ts` add `scalePlan: (factor: number) => void` to `GeometryState` (after `deleteOpening`), and after the `deleteOpening` action:

```ts
    scalePlan: (factor) => {
      // Calibration corrects measurements, not sizes: thickness, height and opening widths are real-world values.
      const scale = (p: Point) => ({ x: p.x * factor, y: p.y * factor })
      set((state) => ({
        walls: state.walls.map((w) => ({ ...w, points: w.points.map(scale) })),
        rooms: state.rooms.map((r) => ({ ...r, points: r.points.map(scale) })),
        openings: state.openings.map((o) => ({ ...o, position: scale(o.position) })),
      }))
      markEdited()
    },
```

- [ ] **Step 5: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src/lib/planGeometry.ts plan2space-web/src/stores/geometryStore.ts plan2space-web/tests/calibration.test.ts
git commit -m "feat: scale a plan's positions by a calibration factor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The Measure tool

**Files:**
- Modify: `plan2space-web/src/stores/editorStore.ts` (`'measure'` tool)
- Modify: `plan2space-web/src/hooks/useEditorShortcuts.ts` (M key)
- Create: `plan2space-web/src/components/studio/Canvas2D/useMeasureTool.ts`
- Create: `plan2space-web/src/components/studio/Canvas2D/CalibrationDialog.tsx`
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx`
- Modify: `plan2space-web/src/components/studio/StudioToolbar.tsx` (Measure button)
- Create: `plan2space-web/tests/measureTool.test.ts`

**Interfaces:**
- Consumes: `screenToPlan`, `toScreen` (canvasTransform), `calibrationFactor` (Task 2).
- Produces: `Tool = 'select' | 'wall' | 'opening' | 'measure'`; `useMeasureTool(): { preview: Point[] | null; measuredM: number | null; onPointerDown(p): void; onPointerMove(p): void; reset(): void }`; `CalibrationDialog({ measuredM, onApply(realM: number): void, onCancel(): void })`.

- [ ] **Step 1: Write the failing tests** — `tests/measureTool.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import { useMeasureTool } from '../src/components/studio/Canvas2D/useMeasureTool'
import { CalibrationDialog } from '../src/components/studio/Canvas2D/CalibrationDialog'
import { useEditorStore } from '../src/stores/editorStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

describe('measure tool', () => {
  it('two clicks measure the line between them; a third starts over', () => {
    const { result } = renderHook(() => useMeasureTool())
    act(() => result.current.onPointerDown({ x: 0, y: 0 }))
    act(() => result.current.onPointerMove({ x: 3, y: 4 }))
    expect(result.current.preview).toEqual([{ x: 0, y: 0 }, { x: 3, y: 4 }])
    expect(result.current.measuredM).toBeNull()
    act(() => result.current.onPointerDown({ x: 3, y: 4 }))
    expect(result.current.measuredM).toBeCloseTo(5)
    act(() => result.current.onPointerDown({ x: 9, y: 9 }))
    expect(result.current.measuredM).toBeNull()
  })

  it('M chooses the measure tool', () => {
    function Harness() { useEditorShortcuts(); return null }
    useEditorStore.setState({ tool: 'select', selection: null })
    render(React.createElement(Harness))
    fireEvent.keyDown(window, { key: 'm' })
    expect(useEditorStore.getState().tool).toBe('measure')
  })
})

describe('calibration dialog', () => {
  it('passes a valid real length on', () => {
    let applied: number | null = null
    const { getByLabelText, getByText } = render(React.createElement(CalibrationDialog,
      { measuredM: 34, onApply: (m: number) => { applied = m }, onCancel: () => {} }))
    fireEvent.change(getByLabelText('Real length in metres'), { target: { value: '7' } })
    fireEvent.click(getByText('Apply'))
    expect(applied).toBe(7)
  })

  it('refuses zero, negative and non-numeric lengths with a message', () => {
    let applied = false
    const { getByLabelText, getByText, getByRole } = render(React.createElement(CalibrationDialog,
      { measuredM: 34, onApply: () => { applied = true }, onCancel: () => {} }))
    for (const value of ['0', '-3', 'abc']) {
      fireEvent.change(getByLabelText('Real length in metres'), { target: { value } })
      fireEvent.click(getByText('Apply'))
    }
    expect(applied).toBe(false)
    expect(getByRole('alert').textContent).toMatch(/positive/i)
  })

  it('refuses a line too short to calibrate from', () => {
    let applied = false
    const { getByLabelText, getByText, getByRole } = render(React.createElement(CalibrationDialog,
      { measuredM: 0.01, onApply: () => { applied = true }, onCancel: () => {} }))
    fireEvent.change(getByLabelText('Real length in metres'), { target: { value: '7' } })
    fireEvent.click(getByText('Apply'))
    expect(applied).toBe(false)
    expect(getByRole('alert').textContent).toMatch(/too short/i)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/measureTool.test.ts`
Expected: modules `useMeasureTool` and `CalibrationDialog` not found.

- [ ] **Step 3: Extend the tool type and shortcut** — in `editorStore.ts` change `export type Tool = 'select' | 'wall' | 'opening'` to `export type Tool = 'select' | 'wall' | 'opening' | 'measure'`. In `useEditorShortcuts.ts` change `TOOL_KEYS` to `{ v: 'select', w: 'wall', o: 'opening', m: 'measure' }`.

- [ ] **Step 4: Implement the hook** — `src/components/studio/Canvas2D/useMeasureTool.ts`:

```ts
import { useState } from 'react'
import { Point } from '../../../services/geometryService'

// Two clicks measure a line; dimension lines are not walls, so nothing snaps.
export function useMeasureTool() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const [hover, setHover] = useState<Point | null>(null)

  return {
    preview: start ? [start, end ?? hover ?? start] : null,
    measuredM: start && end ? Math.hypot(end.x - start.x, end.y - start.y) : null,
    onPointerDown(p: Point) {
      if (!start || end) {
        setStart(p)
        setEnd(null)
        setHover(p)
      } else {
        setEnd(p)
      }
    },
    onPointerMove(p: Point) {
      if (start && !end) setHover(p)
    },
    reset() {
      setStart(null)
      setEnd(null)
      setHover(null)
    },
  }
}
```

- [ ] **Step 5: Implement the dialog** — `src/components/studio/Canvas2D/CalibrationDialog.tsx`:

```tsx
import React, { useState } from 'react'
import { calibrationFactor, MIN_MEASURE_M } from '../../../lib/planGeometry'

export function CalibrationDialog({ measuredM, onApply, onCancel }: {
  measuredM: number
  onApply: (realM: number) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function apply() {
    const realM = Number(text.replace(',', '.'))
    if (measuredM < MIN_MEASURE_M) {
      setError(`That line is too short to calibrate from (under ${MIN_MEASURE_M * 100} cm). Measure a longer one.`)
      return
    }
    if (calibrationFactor(measuredM, realM) === null) {
      setError('Enter the real length as a positive number of metres, e.g. 7.')
      return
    }
    onApply(realM)
  }

  return (
    <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-zinc-800 bg-[#121215] p-3 text-xs text-zinc-200 shadow-lg">
      <div className="mb-2">Measured {measuredM.toFixed(2)} m on the plan. What is its real length?</div>
      <div className="flex items-center gap-2">
        <input
          aria-label="Real length in metres"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') onCancel() }}
          className="w-24 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1"
          placeholder="7"
        />
        <span>m</span>
        <button onClick={apply} className="rounded bg-blue-600 px-2 py-1 text-white">Apply</button>
        <button onClick={onCancel} className="rounded px-2 py-1 text-zinc-400 hover:text-white">Cancel</button>
      </div>
      {error && <div role="alert" className="mt-2 text-amber-400">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 6: Wire the canvas and toolbar**

`CanvasEditor.tsx`: `import { Text } from 'react-konva'` (merge into the existing `react-konva` import), `import { useMeasureTool } from './useMeasureTool'`, `import { CalibrationDialog } from './CalibrationDialog'`. In the body: `const measureTool = useMeasureTool()`. Extend the existing tool-change effect to `useEffect(() => { wallTool.cancel(); measureTool.reset() }, [tool])`. In the Stage handlers:
- `onMouseDown`: add `else if (p && tool === 'measure') measureTool.onPointerDown(p)` after the opening branch.
- `onMouseMove`: add `if (p && tool === 'measure') measureTool.onPointerMove(p)`.

Inside `<Layer>`, after the wall preview:

```tsx
          {measureTool.preview && (() => {
            const [a, b] = measureTool.preview.map(toScreen)
            const length = Math.hypot(measureTool.preview[1].x - measureTool.preview[0].x,
                                      measureTool.preview[1].y - measureTool.preview[0].y)
            return (
              <>
                <Line points={[a.x, a.y, b.x, b.y]} stroke="#facc15" strokeWidth={2} dash={[8, 4]} listening={false} />
                <Text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 18} text={`${length.toFixed(2)} m`}
                      fontSize={13} fill="#facc15" listening={false} />
              </>
            )
          })()}
```

After `</Stage>` (still inside the container `div`), the dialog — calibration itself is wired in Task 4, so for now Apply only closes it:

```tsx
      {tool === 'measure' && measureTool.measuredM !== null && (
        <CalibrationDialog
          measuredM={measureTool.measuredM}
          onApply={() => measureTool.reset()}
          onCancel={() => measureTool.reset()}
        />
      )}
```

Update the hint text to include `tool === 'measure' ? 'Click two points of a known length' : …`.

`StudioToolbar.tsx`: import `Ruler` from `lucide-react` and add a fourth tool button after Opening:

```tsx
        <button
          className={toolClass('measure')}
          onClick={() => setTool('measure')}
          aria-pressed={tool === 'measure'}
          title="Measure & set scale (M)"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Scale</span>
        </button>
```

- [ ] **Step 7: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src plan2space-web/tests/measureTool.test.ts
git commit -m "feat: measure a known length on the plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Apply a calibration

**Files:**
- Modify: `plan2space-web/src/services/underlayService.ts` (`setUnderlayScale`)
- Modify: `plan2space-web/src/stores/editorStore.ts` (`underlayRevision`, `bumpUnderlay`)
- Modify: `plan2space-web/src/components/studio/Canvas2D/useUnderlay.ts` (depend on the revision)
- Create: `plan2space-web/src/components/studio/Canvas2D/applyCalibration.ts`
- Modify: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx` (dialog `onApply`)
- Create: `plan2space-web/tests/applyCalibration.test.ts`

**Interfaces:**
- Consumes: `scalePlan` (Task 2), `saveToServer`, `PUT /api/projects/{id}/underlay` (Task 1), `useUnderlay()`.
- Produces: `setUnderlayScale(projectId: string, metresPerPixel: number): Promise<void>`; `editorStore.underlayRevision: number`, `bumpUnderlay(): void`; `applyCalibration(factor: number, underlayMpp: number | null): Promise<string | null>` — resolves to an error message, or null on success.

- [ ] **Step 1: Write the failing tests** — `tests/applyCalibration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyCalibration } from '../src/components/studio/Canvas2D/applyCalibration'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorStore } from '../src/stores/editorStore'
import * as geometryService from '../src/services/geometryService'
import * as underlayService from '../src/services/underlayService'

vi.mock('../src/services/geometryService')
vi.mock('../src/services/underlayService')

describe('applying a calibration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(underlayService.setUnderlayScale).mockReset().mockResolvedValue()
    useEditorStore.setState({ underlayRevision: 0 })
    useGeometryStore.setState({
      projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false, saveConflict: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 34, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: [],
    })
  })

  it('scales the plan, saves it, then corrects the underlay and refreshes it', async () => {
    const error = await applyCalibration(7 / 34, 0.0742)

    expect(error).toBeNull()
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].walls[0].points[1].x).toBeCloseTo(7)
    expect(underlayService.setUnderlayScale).toHaveBeenCalledWith('p', expect.closeTo(0.0742 * 7 / 34, 6))
    expect(useEditorStore.getState().underlayRevision).toBe(1)
  })

  it('calibrating twice compounds on the corrected underlay value', async () => {
    await applyCalibration(0.5, 0.08)
    await applyCalibration(0.5, 0.04)
    expect(vi.mocked(underlayService.setUnderlayScale).mock.calls[1][1]).toBeCloseTo(0.02)
  })

  it('a plan without an underlay is only scaled and saved', async () => {
    expect(await applyCalibration(0.5, null)).toBeNull()
    expect(underlayService.setUnderlayScale).not.toHaveBeenCalled()
  })

  it('when the save conflicts the underlay is left alone and the user is told', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 409 } })

    const error = await applyCalibration(0.5, 0.08)

    expect(error).toMatch(/changed/i)
    expect(underlayService.setUnderlayScale).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/applyCalibration.test.ts`
Expected: module `applyCalibration` not found.

- [ ] **Step 3: Service call** — append to `src/services/underlayService.ts`:

```ts
export async function setUnderlayScale(projectId: string, metresPerPixel: number): Promise<void> {
  await apiClient.put(`/projects/${projectId}/underlay`, { metresPerPixel })
}
```

- [ ] **Step 4: Underlay revision** — in `editorStore.ts` add `underlayRevision: number` and `bumpUnderlay: () => void` to `EditorState`, and in the store `underlayRevision: 0,` and `bumpUnderlay: () => set((s) => ({ underlayRevision: s.underlayRevision + 1 })),`.

In `useUnderlay.ts`: `import { useEditorStore } from '../../../stores/editorStore'`, read `const revision = useEditorStore((s) => s.underlayRevision)`, and change the metadata effect's dependencies to `[projectId, version, revision]`.

- [ ] **Step 5: Orchestration** — `src/components/studio/Canvas2D/applyCalibration.ts`:

```ts
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { setUnderlayScale } from '../../../services/underlayService'

// Scale, save, and only then correct the underlay: if the save fails the plan and its image never disagree
// on the server. Resolves to a message for the user, or null when everything was applied.
export async function applyCalibration(factor: number, underlayMpp: number | null): Promise<string | null> {
  const store = useGeometryStore.getState()
  const projectId = store.projectId
  if (!projectId) return 'No project is open.'
  store.scalePlan(factor)
  try {
    await useGeometryStore.getState().saveToServer(projectId)
  } catch (err: any) {
    return err?.response?.data?.message || 'The scaled plan could not be saved. Try again.'
  }
  if (useGeometryStore.getState().saveConflict) {
    return 'The plan changed elsewhere. Reload it, then set the scale again.'
  }
  if (underlayMpp !== null) {
    try {
      await setUnderlayScale(projectId, underlayMpp * factor)
      useEditorStore.getState().bumpUnderlay()
    } catch {
      return 'The plan was rescaled, but the background image could not be updated. Reload to realign it.'
    }
  }
  return null
}
```

Note: `saveToServer` swallows a 409 by setting `saveConflict`; the test's rejected `{ response: { status: 409 } }` exercises exactly that branch.

- [ ] **Step 6: Wire the dialog** — in `CanvasEditor.tsx` add `import { applyCalibration } from './applyCalibration'` and a state `const [calibrationError, setCalibrationError] = useState<string | null>(null)`. Replace the dialog's `onApply` with:

```tsx
          onApply={async (realM) => {
            const factor = realM / measureTool.measuredM!
            const error = await applyCalibration(factor, underlay?.underlay.metresPerPixel ?? null)
            setCalibrationError(error)
            measureTool.reset()
            if (!error) useEditorStore.getState().setTool('select')
          }}
```

and after the dialog block render `{calibrationError && <div role="alert" className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded bg-amber-950/90 px-3 py-2 text-xs text-amber-300">{calibrationError}</div>}`. Clear it on the next tool change (add `setCalibrationError(null)` to the tool-change effect).

- [ ] **Step 7: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src plan2space-web/tests/applyCalibration.test.ts
git commit -m "feat: rescale the plan and its underlay from a measured length

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: A house that looks like a place

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/floorPlan.ts`
- Create: `plan2space-web/src/components/studio/Viewer3D/textures.ts`
- Create: `plan2space-web/src/components/studio/Viewer3D/HouseModel.tsx`
- Modify: `plan2space-web/src/components/studio/Viewer3D/cutOpenings.ts` (export `segmentAngleAt`)
- Modify: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx`
- Create: `plan2space-web/tests/floorPlan.test.ts`

**Interfaces:**
- Consumes: `polygonArea` (Task 2), `useWallGeometry`, `segmentAngleAt`.
- Produces: `TILE_ROOM_MAX_AREA_M2 = 6`; `type FloorKind = 'wood' | 'tile'`; `floorMaterialFor(areaM2: number): FloorKind`; `floorPatches(rooms: Room[], walls: Wall[]): { points: Point[]; kind: FloorKind }[]`; `wallHeight(walls: Wall[]): number` (max, default 2.8); `floorTexture(kind: FloorKind): THREE.Texture | null`; `HouseModel({ showCeilings }: { showCeilings: boolean })` — renders inside a group already rotated to plan space.

- [ ] **Step 1: Write the failing tests** — `tests/floorPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { floorMaterialFor, floorPatches, wallHeight } from '../src/components/studio/Viewer3D/floorPlan'
import { floorTexture } from '../src/components/studio/Viewer3D/textures'
import { Room, Wall } from '../src/services/geometryService'

const room = (id: string, w: number, h: number): Room =>
  ({ id, label: id, version: 1, points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: 0 }] })
const wall = (a: [number, number], b: [number, number], height = 2.8): Wall =>
  ({ id: `${a}-${b}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: height, version: 1 })

describe('floors', () => {
  it('a room under 6 m² is tiled, any other is wood', () => {
    expect(floorMaterialFor(4.8)).toBe('tile')
    expect(floorMaterialFor(6)).toBe('wood')
    expect(floorMaterialFor(24)).toBe('wood')
  })

  it('each room becomes a floor patch of its own material', () => {
    const patches = floorPatches([room('wc', 2, 2), room('bed', 4, 4)], [])
    expect(patches.map((p) => p.kind)).toEqual(['tile', 'wood'])
  })

  it('with walls but no rooms, one wood floor spans the walls', () => {
    const [patch, ...rest] = floorPatches([], [wall([0, 0], [8, 0]), wall([8, 0], [8, 5])])
    expect(rest).toHaveLength(0)
    expect(patch.kind).toBe('wood')
    expect(patch.points).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 0, y: 5 }])
  })

  it('an empty plan has no floor', () => {
    expect(floorPatches([], [])).toEqual([])
  })

  it('ceilings sit at the tallest wall, 2.8 m by default', () => {
    expect(wallHeight([wall([0, 0], [1, 0], 2.6), wall([1, 0], [2, 0], 3)])).toBe(3)
    expect(wallHeight([])).toBe(2.8)
  })

  it('without a canvas (jsdom) textures fall back to plain colours', () => {
    expect(floorTexture('wood')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/floorPlan.test.ts`
Expected: modules `floorPlan` and `textures` not found.

- [ ] **Step 3: Floor logic** — `src/components/studio/Viewer3D/floorPlan.ts`:

```ts
import { Point, Room, Wall } from '../../../services/geometryService'
import { polygonArea } from '../../../lib/planGeometry'

// In these plans a room this small is almost always a WC; pipeline rooms carry no type, only "Room N".
export const TILE_ROOM_MAX_AREA_M2 = 6
export const DEFAULT_WALL_HEIGHT_M = 2.8

export type FloorKind = 'wood' | 'tile'

export function floorMaterialFor(areaM2: number): FloorKind {
  return areaM2 < TILE_ROOM_MAX_AREA_M2 ? 'tile' : 'wood'
}

export function floorPatches(rooms: Room[], walls: Wall[]): { points: Point[]; kind: FloorKind }[] {
  if (rooms.length > 0) return rooms.map((r) => ({ points: r.points, kind: floorMaterialFor(polygonArea(r.points)) }))
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return [{ kind: 'wood', points: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }] }]
}

export function wallHeight(walls: Wall[]): number {
  return walls.length === 0 ? DEFAULT_WALL_HEIGHT_M : Math.max(...walls.map((w) => w.heightMeters))
}
```

- [ ] **Step 4: Textures** — `src/components/studio/Viewer3D/textures.ts`:

```ts
import * as THREE from 'three'
import { FloorKind } from './floorPlan'

// One canvas = one metre of floor; floor UVs are plan metres, so repeat-wrapping tiles it per metre.
const SIZE = 256
const cache = new Map<FloorKind, THREE.Texture | null>()

function paintWood(ctx: CanvasRenderingContext2D) {
  const plank = SIZE / 5
  for (let i = 0; i < 5; i++) {
    const shade = 140 + ((i * 37) % 30)
    ctx.fillStyle = `rgb(${shade + 40}, ${shade}, ${shade - 55})`
    ctx.fillRect(0, i * plank, SIZE, plank)
    ctx.fillStyle = 'rgba(60, 35, 15, 0.35)'
    ctx.fillRect(0, i * plank, SIZE, 2)                      // seam between planks
    ctx.fillRect(((i * 97) % SIZE), i * plank, 2, plank)     // staggered butt joint
  }
}

function paintTile(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#e9e6df'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#b9b4aa'
  for (const at of [0, SIZE / 2]) {                          // 50 cm tiles
    ctx.fillRect(at, 0, 3, SIZE)
    ctx.fillRect(0, at, SIZE, 3)
  }
}

export function floorTexture(kind: FloorKind): THREE.Texture | null {
  if (cache.has(kind)) return cache.get(kind)!
  let texture: THREE.Texture | null = null
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas')
  const ctx = canvas ? (() => { try { return canvas.getContext('2d') } catch { return null } })() : null
  if (canvas && ctx) {
    canvas.width = canvas.height = SIZE
    if (kind === 'wood') paintWood(ctx)
    else paintTile(ctx)
    texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
  }
  cache.set(kind, texture)
  return texture
}
```

- [ ] **Step 5: The house** — in `cutOpenings.ts` change `function segmentAngleAt` to `export function segmentAngleAt`. Create `src/components/studio/Viewer3D/HouseModel.tsx`:

```tsx
import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { Opening, Point, Wall } from '../../../services/geometryService'
import { useWallGeometry } from './useWallGeometry'
import { segmentAngleAt } from './cutOpenings'
import { floorPatches, FloorKind, wallHeight } from './floorPlan'
import { floorTexture } from './textures'

const WALL_PAINT = '#efe9df'
const FLOOR_FALLBACK: Record<FloorKind, string> = { wood: '#b98a5a', tile: '#e6e2da' }
const WINDOW_HEIGHT_M = 1.2   // matches the CSG cut in cutOpenings.ts

function WallMesh({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  const geometry = useWallGeometry(wall, openings)
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={WALL_PAINT} roughness={0.9} metalness={0} />
    </mesh>
  )
}

function useShape(points: Point[]) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)))), [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function Floor({ points, kind }: { points: Point[]; kind: FloorKind }) {
  const geometry = useShape(points)
  return (
    <mesh geometry={geometry} position={[0, 0, 0.002]} receiveShadow>
      <meshStandardMaterial map={floorTexture(kind)} color={floorTexture(kind) ? '#ffffff' : FLOOR_FALLBACK[kind]} roughness={0.8} />
    </mesh>
  )
}

function Ceiling({ points, height }: { points: Point[]; height: number }) {
  const geometry = useShape(points)
  return (
    <mesh geometry={geometry} position={[0, 0, height]}>
      <meshStandardMaterial color="#fbfaf7" side={THREE.DoubleSide} roughness={1} />
    </mesh>
  )
}

function WindowGlass({ opening, wall }: { opening: Opening; wall: Wall }) {
  const angle = segmentAngleAt(wall, opening.position)
  return (
    <mesh position={[opening.position.x, opening.position.y, opening.sillHeightMeters + WINDOW_HEIGHT_M / 2]}
          rotation={[0, 0, angle]}>
      <boxGeometry args={[opening.widthMeters, 0.02, WINDOW_HEIGHT_M]} />
      <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.3} roughness={0.05} metalness={0} />
    </mesh>
  )
}

// The house in plan space (x, y, height up). Callers place it inside a group rotated −90° about X.
export function HouseModel({ showCeilings }: { showCeilings: boolean }) {
  const walls = useGeometryStore((s) => s.walls)
  const rooms = useGeometryStore((s) => s.rooms)
  const openings = useGeometryStore((s) => s.openings)
  const floors = useMemo(() => floorPatches(rooms, walls), [rooms, walls])
  const height = wallHeight(walls)

  return (
    <>
      {walls.map((wall) => <WallMesh key={wall.id} wall={wall} openings={openings} />)}
      {floors.map((f, i) => <Floor key={i} points={f.points} kind={f.kind} />)}
      {showCeilings && floors.map((f, i) => <Ceiling key={i} points={f.points} height={height} />)}
      {openings.filter((o) => o.type === 'Window').map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        return wall ? <WindowGlass key={o.id} opening={o} wall={wall} /> : null
      })}
    </>
  )
}
```

- [ ] **Step 6: Use it in the 3D pane** — in `Scene.tsx`: remove the local `WallMesh` and the `useWallGeometry` / `Wall` / `Opening` imports and the `walls`/`openings` selectors that only fed it; `import { HouseModel } from './HouseModel'`; replace the `<group rotation={[-Math.PI / 2, 0, 0]}>…</group>` body with `<HouseModel showCeilings={false} />` inside the same group. Replace the lights with:

```tsx
        <hemisphereLight args={['#fdfbf5', '#8a7a66', 0.8]} />
        <directionalLight position={[15, 25, 10]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
```

and add `shadows` to `<Canvas>`.

- [ ] **Step 7: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass (the existing wall-geometry tests are unaffected: `useWallGeometry` and `cutOpeningsIntoWall` keep their behaviour).

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src/components/studio/Viewer3D plan2space-web/tests/floorPlan.test.ts
git commit -m "feat: floors, ceilings, painted walls, window glass and soft light

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Walking physics

**Files:**
- Create: `plan2space-web/src/lib/walkPhysics.ts`
- Create: `plan2space-web/tests/walkPhysics.test.ts`

**Interfaces:**
- Consumes: `polygonArea`, `polygonCentroid` (Task 2).
- Produces: `WALK_SPEED_MS = 1.4`, `RUN_SPEED_MS = 3`, `EYE_HEIGHT_M = 1.6`, `PLAYER_RADIUS_M = 0.25`, `MAX_STEP_S = 0.05`; `interface MoveKeys { forward: boolean; back: boolean; left: boolean; right: boolean; run: boolean }`; `interface Blocker { a: Point; b: Point; halfWidth: number }`; `moveVector(keys: MoveKeys, facing: Point, dt: number): Point`; `wallBlockers(walls: Wall[], openings: Opening[]): Blocker[]`; `stepPlayer(position: Point, move: Point, blockers: Blocker[]): Point`; `spawnPoint(rooms: Room[], walls: Wall[]): Point`. All in plan metres.

- [ ] **Step 1: Write the failing tests** — `tests/walkPhysics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { moveVector, spawnPoint, stepPlayer, wallBlockers, PLAYER_RADIUS_M, MAX_STEP_S } from '../src/lib/walkPhysics'
import { Opening, Room, Wall } from '../src/services/geometryService'

const still = { forward: false, back: false, left: false, right: false, run: false }
const wall = (id: string, a: [number, number], b: [number, number]): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 })
const opening = (type: 'Door' | 'Window', x: number): Opening =>
  ({ id: type, wallId: 'w', type, position: { x, y: 0 }, widthMeters: 0.9, sillHeightMeters: type === 'Door' ? 0 : 0.9, version: 1 })

/** Walk from `from` along `step` for `n` frames against `blockers`. */
function walk(from: { x: number; y: number }, step: { x: number; y: number }, n: number, blockers: ReturnType<typeof wallBlockers>) {
  let p = from
  for (let i = 0; i < n; i++) p = stepPlayer(p, step, blockers)
  return p
}

describe('moving', () => {
  it('walks 1.4 m/s, runs 3 m/s, and a diagonal is no faster', () => {
    expect(moveVector({ ...still, forward: true }, { x: 0, y: 1 }, 1)).toEqual({ x: 0, y: 1.4 })
    expect(moveVector({ ...still, forward: true, run: true }, { x: 0, y: 1 }, 1).y).toBeCloseTo(3)
    const d = moveVector({ ...still, forward: true, right: true }, { x: 0, y: 1 }, 1)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1.4)
    expect(d.x).toBeGreaterThan(0)                          // facing north, right is east
    expect(moveVector(still, { x: 0, y: 1 }, 1)).toEqual({ x: 0, y: 0 })
  })

  it('ignores the vertical part of the view direction', () => {
    expect(moveVector({ ...still, forward: true }, { x: 0, y: 0.1 }, 1)).toEqual({ x: 0, y: 1.4 })
  })
})

describe('walls', () => {
  const plain = wallBlockers([wall('w', [-5, 0], [5, 0])], [])

  it("a wall stops the player at arm's length", () => {
    const p = walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, plain)
    expect(p.y).toBeGreaterThanOrEqual(0.1 + PLAYER_RADIUS_M - 1e-6)
  })

  it('walking into a wall at an angle slides along it', () => {
    const p = walk({ x: 0, y: 1 }, { x: 0.05, y: -0.05 }, 60, plain)
    expect(p.x).toBeGreaterThan(2)
    expect(p.y).toBeGreaterThan(0.3)
  })

  it('a door opening can be walked through; a window cannot', () => {
    const door = wallBlockers([wall('w', [-5, 0], [5, 0])], [opening('Door', 0)])
    expect(walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, door).y).toBeLessThan(-1)
    const window = wallBlockers([wall('w', [-5, 0], [5, 0])], [opening('Window', 0)])
    expect(walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, window).y).toBeGreaterThan(0.3)
  })

  it('a corner walked into diagonally holds, even on a long frame', () => {
    const corner = wallBlockers([wall('a', [0, 0], [5, 0]), wall('b', [0, 0], [0, 5])], [])
    const p = walk({ x: 2, y: 2 }, { x: -3 * MAX_STEP_S, y: -3 * MAX_STEP_S }, 200, corner)
    expect(p.x).toBeGreaterThan(0.3)
    expect(p.y).toBeGreaterThan(0.3)
  })
})

describe('spawn', () => {
  const square = (x: number, y: number, s: number): Room =>
    ({ id: `${x}`, label: 'r', version: 1, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }] })

  it('starts in the middle of the largest room', () => {
    expect(spawnPoint([square(0, 0, 2), square(10, 0, 6)], [])).toEqual({ x: 13, y: 3 })
  })

  it('without rooms starts in the middle of the walls, and at the origin with nothing at all', () => {
    expect(spawnPoint([], [wall('a', [0, 0], [8, 0]), wall('b', [8, 0], [8, 4])])).toEqual({ x: 4, y: 2 })
    expect(spawnPoint([], [])).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/walkPhysics.test.ts`
Expected: module `walkPhysics` not found.

- [ ] **Step 3: Implement** — `src/lib/walkPhysics.ts`:

```ts
import { Opening, Point, Room, Wall } from '../services/geometryService'
import { polygonArea, polygonCentroid } from './planGeometry'

export const WALK_SPEED_MS = 1.4
export const RUN_SPEED_MS = 3
export const EYE_HEIGHT_M = 1.6
export const PLAYER_RADIUS_M = 0.25
export const MAX_STEP_S = 0.05          // a long frame (tab switch) must not carry the player through a wall
const DOOR_ON_SEGMENT_M = 0.3
const RESOLVE_PASSES = 4

export interface MoveKeys { forward: boolean; back: boolean; left: boolean; right: boolean; run: boolean }
export interface Blocker { a: Point; b: Point; halfWidth: number }

// Plan-space displacement for this frame. `facing` is the view direction projected on the floor.
export function moveVector(keys: MoveKeys, facing: Point, dt: number): Point {
  const length = Math.hypot(facing.x, facing.y)
  if (length === 0) return { x: 0, y: 0 }
  const f = { x: facing.x / length, y: facing.y / length }
  const right = { x: f.y, y: -f.x }
  const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const dx = f.x * ahead + right.x * side
  const dy = f.y * ahead + right.y * side
  const norm = Math.hypot(dx, dy)
  if (norm === 0) return { x: 0, y: 0 }
  // dt is capped by the caller (Math.min(delta, MAX_STEP_S)); the tests pass a whole second.
  const distance = (keys.run ? RUN_SPEED_MS : WALK_SPEED_MS) * dt
  return { x: (dx / norm) * distance, y: (dy / norm) * distance }
}

function closest(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t }
}

// Each wall segment becomes the blocking pieces left after taking out its door spans. A piece's end that
// borders a doorway is pulled back by the wall's half-thickness, so the doorway keeps its real width
// instead of being narrowed by the rounded end of the collision band.
export function wallBlockers(walls: Wall[], openings: Opening[]): Blocker[] {
  const blockers: Blocker[] = []
  for (const wall of walls) {
    const half = wall.thicknessMeters / 2
    const doors = openings.filter((o) => o.wallId === wall.id && o.type === 'Door')
    for (let i = 0; i < wall.points.length - 1; i++) {
      const a = wall.points[i]
      const b = wall.points[i + 1]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length === 0) continue
      const spans = doors
        .map((d) => ({ d, hit: closest(d.position, a, b) }))
        .filter(({ d, hit }) => Math.hypot(d.position.x - hit.point.x, d.position.y - hit.point.y) <= DOOR_ON_SEGMENT_M)
        .map(({ d, hit }) => [hit.t * length - d.widthMeters / 2, hit.t * length + d.widthMeters / 2] as [number, number])
        .sort((s, t) => s[0] - t[0])
      let from = 0
      let fromIsDoor = false
      const at = (s: number) => ({ x: a.x + ((b.x - a.x) * s) / length, y: a.y + ((b.y - a.y) * s) / length })
      const piece = (s: number, e: number, startsAtDoor: boolean, endsAtDoor: boolean) => {
        const s2 = s + (startsAtDoor ? half : 0)
        const e2 = e - (endsAtDoor ? half : 0)
        if (e2 > s2) blockers.push({ a: at(s2), b: at(e2), halfWidth: half })
      }
      for (const [s, e] of spans) {
        piece(from, Math.max(from, s), fromIsDoor, true)
        from = Math.min(length, Math.max(from, e))
        fromIsDoor = true
      }
      piece(from, length, fromIsDoor, false)
    }
  }
  return blockers
}

// Moves by `move`, then pushes the player out of every wall band along its normal, which makes contact
// slide along walls. Several passes let corners (two bands at once) settle.
export function stepPlayer(position: Point, move: Point, blockers: Blocker[]): Point {
  let p = { x: position.x + move.x, y: position.y + move.y }
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    let pushed = false
    for (const bl of blockers) {
      const { point: c } = closest(p, bl.a, bl.b)
      const min = bl.halfWidth + PLAYER_RADIUS_M
      const dx = p.x - c.x
      const dy = p.y - c.y
      const distance = Math.hypot(dx, dy)
      if (distance >= min) continue
      if (distance > 1e-9) {
        p = { x: c.x + (dx / distance) * min, y: c.y + (dy / distance) * min }
      } else {
        // Exactly on the centreline: push back towards the side the player came from.
        const sx = bl.b.x - bl.a.x
        const sy = bl.b.y - bl.a.y
        const len = Math.hypot(sx, sy) || 1
        let nx = -sy / len
        let ny = sx / len
        if ((position.x - c.x) * nx + (position.y - c.y) * ny < 0) { nx = -nx; ny = -ny }
        p = { x: c.x + nx * min, y: c.y + ny * min }
      }
      pushed = true
    }
    if (!pushed) break
  }
  return p
}

export function spawnPoint(rooms: Room[], walls: Wall[]): Point {
  if (rooms.length > 0) {
    const largest = rooms.reduce((best, r) => (polygonArea(r.points) > polygonArea(best.points) ? r : best))
    return polygonCentroid(largest.points)
  }
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return { x: 0, y: 0 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd plan2space-web && npx vitest run tests/walkPhysics.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Run the suite and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src/lib/walkPhysics.ts plan2space-web/tests/walkPhysics.test.ts
git commit -m "feat: walking physics - movement, wall collision, doorways and spawn point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Walk-through mode

**Files:**
- Modify: `plan2space-web/src/stores/editorStore.ts` (`walking`, `setWalking`)
- Modify: `plan2space-web/src/hooks/useEditorShortcuts.ts` (inactive while walking)
- Create: `plan2space-web/src/components/studio/Walk/useMovementKeys.ts`
- Create: `plan2space-web/src/components/studio/Walk/WalkMode.tsx`
- Modify: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx` (Walk button)
- Modify: `plan2space-web/src/pages/StudioPage.tsx`
- Create: `plan2space-web/tests/walkShortcuts.test.tsx`

**Interfaces:**
- Consumes: everything in `walkPhysics.ts` (Task 6), `HouseModel` (Task 5).
- Produces: `editorStore.walking: boolean`, `setWalking(v: boolean): void`; `keysFromCodes(pressed: Set<string>): MoveKeys` (exported from `useMovementKeys.ts`); `useMovementKeys(): React.MutableRefObject<MoveKeys>`; `WalkMode()`.

- [ ] **Step 1: Write the failing tests** — `tests/walkShortcuts.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'
import { keysFromCodes } from '../src/components/studio/Walk/useMovementKeys'

function Harness() {
  useEditorShortcuts()
  return null
}

describe('while walking', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      projectId: 'p', rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'wall', id: 'w1' }, walking: true })
  })

  it('movement keys do not switch editor tools', () => {
    render(<Harness />)
    for (const key of ['w', 'a', 's', 'd', 'o', 'm', 'v']) fireEvent.keyDown(window, { key })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('Delete and Backspace do not delete the selected wall behind the walk view', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})

describe('movement keys', () => {
  it('WASD and the arrows move; Shift runs', () => {
    expect(keysFromCodes(new Set(['KeyW', 'ShiftLeft']))).toEqual({ forward: true, back: false, left: false, right: false, run: true })
    expect(keysFromCodes(new Set(['ArrowDown', 'ArrowLeft']))).toEqual({ forward: false, back: true, left: true, right: false, run: false })
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd plan2space-web && npx vitest run tests/walkShortcuts.test.tsx`
Expected: module `useMovementKeys` not found.

- [ ] **Step 3: Walking state and quiet shortcuts** — in `editorStore.ts` add `walking: boolean` and `setWalking: (walking: boolean) => void` to `EditorState`; in the store `walking: false,` and `setWalking: (walking) => set({ walking }),`. In `useEditorShortcuts.ts`, first line of `onKeyDown`:

```ts
      // The walk-through owns the keyboard: W moves the player, it must not switch tools or delete walls.
      if (useEditorStore.getState().walking) return
```

- [ ] **Step 4: Movement keys** — `src/components/studio/Walk/useMovementKeys.ts`:

```ts
import { useEffect, useRef } from 'react'
import { MoveKeys } from '../../../lib/walkPhysics'

// Physical key codes, so the layout (QWERTY, AZERTY…) does not move the controls around.
export function keysFromCodes(pressed: Set<string>): MoveKeys {
  const any = (...codes: string[]) => codes.some((c) => pressed.has(c))
  return {
    forward: any('KeyW', 'ArrowUp'),
    back: any('KeyS', 'ArrowDown'),
    left: any('KeyA', 'ArrowLeft'),
    right: any('KeyD', 'ArrowRight'),
    run: any('ShiftLeft', 'ShiftRight'),
  }
}

export function useMovementKeys() {
  const keys = useRef<MoveKeys>(keysFromCodes(new Set()))
  useEffect(() => {
    const pressed = new Set<string>()
    const update = () => { keys.current = keysFromCodes(pressed) }
    const down = (e: KeyboardEvent) => { pressed.add(e.code); update() }
    const up = (e: KeyboardEvent) => { pressed.delete(e.code); update() }
    const blur = () => { pressed.clear(); update() }       // a key released outside the window must not stick
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return keys
}
```

- [ ] **Step 5: The walk-through** — `src/components/studio/Walk/WalkMode.tsx`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { HouseModel } from '../Viewer3D/HouseModel'
import { EYE_HEIGHT_M, MAX_STEP_S, moveVector, spawnPoint, stepPlayer, wallBlockers } from '../../../lib/walkPhysics'
import { useMovementKeys } from './useMovementKeys'

// Plan (x, y) at height h is world (x, h, −y): the house group is rotated −90° about X.
function Player() {
  const walls = useGeometryStore((s) => s.walls)
  const rooms = useGeometryStore((s) => s.rooms)
  const openings = useGeometryStore((s) => s.openings)
  const blockers = useMemo(() => wallBlockers(walls, openings), [walls, openings])
  const position = useRef(spawnPoint(rooms, walls))
  const keys = useMovementKeys()
  const { camera } = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    camera.position.set(position.current.x, EYE_HEIGHT_M, -position.current.y)
  }, [camera])

  useFrame((_, delta) => {
    camera.getWorldDirection(look)
    const move = moveVector(keys.current, { x: look.x, y: -look.z }, Math.min(delta, MAX_STEP_S))
    if (move.x !== 0 || move.y !== 0) position.current = stepPlayer(position.current, move, blockers)
    camera.position.set(position.current.x, EYE_HEIGHT_M, -position.current.y)
  })
  return null
}

export function WalkMode() {
  const setWalking = useEditorStore((s) => s.setWalking)
  const [locked, setLocked] = useState(false)

  useEffect(() => () => { if (document.pointerLockElement) document.exitPointerLock() }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <Canvas shadows camera={{ fov: 70, near: 0.05, far: 200 }} gl={{ antialias: true }}>
        <color attach="background" args={['#cfe3f5']} />
        <hemisphereLight args={['#fdfbf5', '#8a7a66', 0.9]} />
        <directionalLight position={[15, 25, 10]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <HouseModel showCeilings />
        </group>
        {/* Only #walk-continue locks the pointer: without a selector drei locks on ANY click, Exit included. */}
        <PointerLockControls selector="#walk-continue" onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
        <Player />
      </Canvas>

      {locked && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-white/80" />
            <div className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-white/80" />
          </div>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-xs text-white">
            W A S D to walk · Shift to run · mouse to look · Esc to pause
          </div>
        </>
      )}

      {/* Kept mounted and only hidden while locked: drei binds its click listener to this element once. */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/60 ${locked ? 'hidden' : ''}`}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/90 p-6 text-white">
          <div className="text-sm">Walk through your plan</div>
          <button id="walk-continue" className="rounded bg-blue-600 px-4 py-2 text-sm">Click to walk</button>
          <button onClick={() => setWalking(false)} className="text-xs text-zinc-400 hover:text-white">Exit to the editor</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Open and close it** — `Scene.tsx`: `import { useEditorStore } from '../../../stores/editorStore'`, `import { Footprints } from 'lucide-react'`; read `const setWalking = useEditorStore((s) => s.setWalking)` and `const wallCount = useGeometryStore((s) => s.walls.length)`; inside the top-right HUD `div`, after the existing spans:

```tsx
        <button
          onClick={() => setWalking(true)}
          disabled={wallCount === 0}
          title={wallCount === 0 ? 'Draw or import walls first' : 'Walk through the house'}
          className="ml-2 flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-white disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          <Footprints className="w-3.5 h-3.5" />
          <span>Walk</span>
        </button>
```

`StudioPage.tsx`: `import { WalkMode } from '../components/studio/Walk/WalkMode'`, `import { useEditorStore } from '../stores/editorStore'`; `const walking = useEditorStore((s) => s.walking)`; render `{walking && <WalkMode />}` as the last child of the page's root `div`. Also reset on leaving the page: `useEffect(() => () => useEditorStore.getState().setWalking(false), [])`.

- [ ] **Step 7: Run the tests and the type check**

Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src plan2space-web/tests/walkShortcuts.test.tsx
git commit -m "feat: full-screen walk-through with WASD, mouse look and pause

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Whole-stack check

**Files:** none unless a check fails.

- [ ] **Step 1: Every suite**

Run: `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`
Run: `cd plan2space-web && npx vitest run && npx tsc --noEmit`
Run: `dotnet test backend/Plan2Space.sln`
Expected: all pass. Report any failure by name.

- [ ] **Step 2: Rebuild and smoke test**

Run: `docker compose up -d --build api web`
Run: `bash scripts/smoke-test-full-stack.sh`
Expected: `PASS: full-stack smoke test succeeded end to end`.

- [ ] **Step 3: The calibration over HTTP** — as a fresh user through nginx: import `ban-ve-thiet-ke-nha-cap-4-dep-4.jpg`, wait for the job, `PUT /api/projects/{id}/underlay {"metresPerPixel": 0.0152}` → 204, `GET` returns 0.0152. Pace requests (the API allows 100 per minute per user).

- [ ] **Step 4: Hand the visual walk to the user** — logging in needs a password typed into a form, which the executor must not do. List these for the user, at http://localhost after Ctrl+F5:
  1. Scale (M): click both ends of the "7000" dimension line, type 7, Apply → the plan and the image shrink together and stay aligned; reload → still aligned.
  2. The 3D pane shows wood floors, tiled small rooms, off-white walls, glass in windows, soft shadows.
  3. Walk → "Click to walk" → WASD moves, the mouse looks, Shift runs; walls stop you and you slide along them; you pass through doors, not windows.
  4. Esc pauses; "Exit to the editor" returns; W/Delete while walking changed nothing in the editor.
  5. On a plan with walls but no rooms, Walk still opens with one floor.
