# Furniture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A furniture library the user places on the 2D plan, room types with Auto-furnish, and the furniture rendered as real models in 3D and in the walk-through, where it blocks the player.

**Architecture:** Furniture is a new `FurnitureItems` table carried by the existing geometry save (absent list = untouched, so the co-pilot keeps it; the import's empty list clears it). A Node tool normalises the user's GLBs into `plan2space-web/public/furniture/` plus `catalog.json`, the single catalog every layer reads. The staging service is extended to place client-supplied items against walls and away from doors. The web app gains furniture state in `geometryStore`, a Furniture tool and library, a room panel with type and Auto-furnish, 3D models in `HouseModel`, and furniture walk blockers.

**Tech Stack:** ASP.NET Core 8 + EF Core (Npgsql), Python 3.11 + Shapely, Node 20 + @gltf-transform 4 + meshoptimizer + sharp, React 18 + TS + Zustand + react-konva + @react-three/fiber/drei.

**Spec:** `docs/superpowers/specs/2026-09-25-furniture-design.md`

## Global Constraints

- Branch `feature/furniture` from `feature/scale-and-walkthrough` (unmerged).
- Local frame: width along local x, depth along local y, **front faces local −y** at rotation 0; rotation is CCW degrees in plan space. A GLB (Y-up, front +Z) is wrapped in a **+90° X rotation** inside the plan-space group.
- Furniture positions are absolute plan metres; calibration scales positions, never sizes.
- Geometry save: `furniture` **absent = untouched**, present = replace. Worker import sends `[]` → clears. Item: `catalogId` 1–64 chars `^[a-z0-9_-]+$`, finite `x`, `y`, `rotationDeg`; ≤ 2000 items; violations → 400.
- Room types and their labels: `bedroom` "Phòng ngủ", `living` "Phòng khách", `dining` "Phòng ăn", `kitchen` "Bếp", `bathroom` "WC".
- Furniture blocks walking when its `elevationM` < 0.3.
- Keep-clear zone per door: circle at the door's position, radius = the door's width.
- Normalised GLB ≤ 2 MB each; meshes simplified above 30 000 triangles; textures ≤ 1024 px WebP. `model3d/` is git-ignored; only outputs are committed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: Python `cd ai-service && .venv/Scripts/python.exe -m pytest tests/ -q`; web `cd plan2space-web && npx vitest run && npx tsc --noEmit`; .NET `dotnet test backend/Plan2Space.sln`; tools `cd tools/furniture && node --test`.

## Rulings against the spec

- **R1** — Furniture ids: the server honours a client GUID when it is this project's row or unused elsewhere (the walls' `TakenElsewhereAsync` rule), and updates existing rows in place — removing and re-adding the same key in one EF context would throw.
- **R2** — Grid-placed (not against-wall) items are tried nearest the room's representative point first, so a coffee table lands mid-room instead of in a corner. This changes the fallback staging order too; its existing tests assert containment and non-overlap, not positions.
- **R3** — Orientation rule in the normaliser: turn 90° about Y exactly when the model's longer horizontal side and the catalog's longer side (width vs depth) disagree. A toilet (depth > width) is therefore aligned correctly, which the spec's "longer side along depth → turn" wording would get wrong.

## Review Focus

- **A co-pilot edit on a furnished plan** — the furniture survives (its save omits the list). Pinned in Task 1.
- **Editing a wall of a room tagged "Phòng ngủ", then saving** — the re-derived room keeps its label. Pinned in Task 5.
- **Auto-furnish in a room next to a door** — nothing is placed in the door's keep-clear zone. Pinned in Task 2.
- **Pressing R or Delete while typing, or while walking** — nothing rotates or disappears (existing guards cover typing and walking; the new keys go through them). Pinned in Task 6.
- **A catalog id with no entry (catalog changed since the plan was saved)** — drawn as a grey placeholder in 2D, skipped in 3D and in collision, no crash. Pinned in Tasks 6 and 8.

## File Structure

- **backend:** `Domain/Entities/FurnitureItem.cs` (create); `Project.cs`, `Plan2SpaceDbContext.cs`, `IPlan2SpaceDbContext.cs`, `SaveGeometryCommand.cs`, `GetGeometryQuery.cs`, `GeometryController.cs`, `InternalGeometryController.cs` (modify); migration `AddFurniture` (generate); `Staging/IStagingClient.cs`, `StagingHttpClient.cs`, `StagingController.cs` (modify); tests in `GeometryControllerTests.cs`, `InternalGeometryTests.cs`, `StagingControllerTests.cs`.
- **ai-service:** `pipeline/generative_staging.py`, `api/routers/staging.py` (modify); `tests/test_staging_items.py` (create).
- **tools/furniture:** `package.json`, `sources.json`, `fit.mjs`, `fit.test.mjs`, `build.mjs` (create). Outputs: `plan2space-web/public/furniture/*.glb`, `catalog.json`. `.gitignore` gains `model3d/`.
- **plan2space-web:** `src/services/catalogService.ts`, `src/services/stagingService.ts`, `src/lib/roomTypes.ts`, `src/lib/furnish.ts`, `src/components/studio/Canvas2D/FurnitureLayer.tsx`, `FurnitureLibrary.tsx`, `RoomPanel.tsx`, `src/components/studio/Viewer3D/FurnitureModels.tsx` (create); `geometryService.ts`, `geometryStore.ts`, `editorStore.ts`, `useEditorShortcuts.ts`, `CanvasEditor.tsx`, `RoomLayer.tsx`, `StudioToolbar.tsx`, `HouseModel.tsx`, `floorPlan.ts`, `walkPhysics.ts`, `WalkMode.tsx` (modify); tests `furnitureStore.test.ts`, `roomTypes.test.ts`, `furnitureShortcuts.test.tsx`, `furnish.test.ts`, `furnitureWalk.test.ts` (create).

---

### Task 1: Store furniture with the geometry

**Files:** create `backend/src/Plan2Space.Domain/Entities/FurnitureItem.cs`; modify `Project.cs`, `Plan2SpaceDbContext.cs`, `IPlan2SpaceDbContext.cs`, `SaveGeometryCommand.cs`, `GetGeometryQuery.cs`, `GeometryController.cs`, `InternalGeometryController.cs`; generate migration; tests in `GeometryControllerTests.cs` and `InternalGeometryTests.cs`.

**Interfaces:**
- Produces: `FurnitureInput(string CatalogId, double X, double Y, double RotationDeg, Guid? Id = null)`; `SaveGeometryCommand(..., List<FurnitureInput>? Furniture = null)`; `FurnitureDto(Guid Id, string CatalogId, double X, double Y, double RotationDeg)`; `GeometryDto(..., List<FurnitureDto> Furniture)` — JSON `furniture: [{ id, catalogId, x, y, rotationDeg }]`; `SaveRequest(..., List<FurnitureInput>? Furniture = null)`.

- [ ] **Step 1: Failing tests** — add to `GeometryControllerTests`:

```csharp
    private static object[] OneWall() => new object[]
    {
        new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 }
    };

    [Fact]
    public async Task Furniture_RoundTripsThroughSave()
    {
        var (client, project) = await AuthedProjectAsync($"furn-{Guid.NewGuid():N}@plan2space.dev");
        var put = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId = "bed_double", x = 2.0, y = 1.5, rotationDeg = 90.0 } }
        });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry");
        var item = body.GetProperty("furniture")[0];
        Assert.Equal("bed_double", item.GetProperty("catalogId").GetString());
        Assert.Equal(2.0, item.GetProperty("x").GetDouble());
        Assert.Equal(90.0, item.GetProperty("rotationDeg").GetDouble());
    }

    [Fact]
    public async Task ASaveWithoutAFurnitureList_LeavesFurnitureAlone()
    {
        // The co-pilot saves walls/rooms/openings only; a furnished plan must not lose its furniture.
        var (client, project) = await AuthedProjectAsync($"furn-keep-{Guid.NewGuid():N}@plan2space.dev");
        await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId = "sofa", x = 1.0, y = 1.0, rotationDeg = 0.0 } }
        });
        await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 1, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>()
        });

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry");
        Assert.Equal(1, body.GetProperty("furniture").GetArrayLength());
    }

    [Theory]
    [InlineData("", 1.0)]
    [InlineData("Bed Double!", 1.0)]
    [InlineData("bed_double", double.NaN)]
    public async Task InvalidFurniture_Returns400(string catalogId, double x)
    {
        var (client, project) = await AuthedProjectAsync($"furn-bad-{Guid.NewGuid():N}@plan2space.dev");
        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId, x = double.IsNaN(x) ? (double?)null : x, y = 1.0, rotationDeg = 0.0 } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
```

(NaN cannot travel in JSON; sending `x: null` exercises the "not a finite number" rule through model binding, which leaves `X` at its default only if nullable — `FurnitureInput.X` is `double`, so a null makes model binding fail with 400, which is the behaviour under test.)

Add `using System.Text.Json;` to the file if absent.

In `InternalGeometryTests`, add (following that file's service-token client helper and project setup):

```csharp
    [Fact]
    public async Task AnImport_ReplacesTheFurnitureToo()
    {
        // The worker's body has no furniture key; an import replaces the whole plan, so furniture goes.
        var (client, projectId) = await OwnerProjectAsync("import-clears-furniture@plan2space.dev");
        await client.PutAsJsonAsync($"/api/projects/{projectId}/geometry", new
        {
            baseVersion = 0, walls = Array.Empty<object>(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId = "sofa", x = 1.0, y = 1.0, rotationDeg = 0.0 } }
        });

        var put = await Service().PutAsJsonAsync($"/internal/projects/{projectId}/geometry", new
        {
            baseVersion = 1, walls = Array.Empty<object>(), rooms = Array.Empty<object>(), openings = Array.Empty<object>()
        });

        Assert.True(put.IsSuccessStatusCode);
        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{projectId}/geometry");
        Assert.Equal(0, body.GetProperty("furniture").GetArrayLength());
    }
```

If `InternalGeometryTests` has no `OwnerProjectAsync`/`Service` helpers, add them as in `UnderlayTests` (register+login+create project; a client carrying `X-Internal-Token`), and use the internal route that file already exercises.

- [ ] **Step 2: Run and watch them fail** — `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~Furniture|FullyQualifiedName~AnImport_ReplacesTheFurnitureToo"`. Expected: failures (`furniture` property missing).

- [ ] **Step 3: Entity and mapping** — `FurnitureItem.cs`:

```csharp
namespace Plan2Space.Domain.Entities;

// A piece of furniture at an absolute plan position: it belongs to the project, not to a room, because rooms
// are re-derived (with new ids) whenever walls change.
public class FurnitureItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public string CatalogId { get; set; } = default!;
    public double X { get; set; }
    public double Y { get; set; }
    public double RotationDeg { get; set; }
    public uint Version { get; set; } = 1;
}
```

`Project.cs`: `public ICollection<FurnitureItem> Furniture { get; set; } = new List<FurnitureItem>();`. `Plan2SpaceDbContext.cs`: `public DbSet<FurnitureItem> Furniture => Set<FurnitureItem>();` and in `OnModelCreating`:

```csharp
        b.Entity<FurnitureItem>().Property(f => f.CatalogId).HasMaxLength(64);
        b.Entity<FurnitureItem>().Property(f => f.Version).IsConcurrencyToken();
        b.Entity<Project>().HasMany(p => p.Furniture).WithOne(f => f.Project).HasForeignKey(f => f.ProjectId);
```

`IPlan2SpaceDbContext.cs`: `DbSet<FurnitureItem> Furniture { get; }`.

- [ ] **Step 4: Migration** — from `backend/`: `dotnet ef migrations add AddFurniture --project src/Plan2Space.Infrastructure --startup-project src/Plan2Space.API --output-dir Persistence/Migrations`. Read the generated `Up`: it must create table `Furniture` with FK to `Projects` (cascade) and an index on `ProjectId`, and nothing else.

- [ ] **Step 5: Save and get** — `SaveGeometryCommand.cs`: add the record and the parameter:

```csharp
public record FurnitureInput(string CatalogId, double X, double Y, double RotationDeg, Guid? Id = null);
```

```csharp
public record SaveGeometryCommand(
    Guid ProjectId, Guid RequestingUserId, uint BaseVersion,
    List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings,
    List<FurnitureInput>? Furniture = null) : IRequest<uint>;
```

In the handler: add `.Include(p => p.Furniture)` to the project query; add near the top of the class `private static readonly Regex CatalogIdShape = new("^[a-z0-9_-]{1,64}$", RegexOptions.Compiled);` (`using System.Text.RegularExpressions;`); and before `project.GeometryVersion = nextVersion;`:

```csharp
        // Absent list = untouched (the co-pilot); a list replaces the plan's furniture.
        if (cmd.Furniture is not null)
        {
            if (cmd.Furniture.Count > MaxFurniture)
                throw new GeometryValidationException($"A plan can hold at most {MaxFurniture} furniture items");
            var existingFurniture = project.Furniture.ToDictionary(f => f.Id);
            var takenFurnitureIds = await TakenElsewhereAsync(_db.Furniture, cmd.Furniture.Select(f => f.Id), existingFurniture.Keys, ct);
            var usedFurnitureIds = new HashSet<Guid>();
            var keptFurniture = new List<FurnitureItem>();
            foreach (var f in cmd.Furniture)
            {
                if (f.CatalogId is null || !CatalogIdShape.IsMatch(f.CatalogId))
                    throw new GeometryValidationException("A furniture catalogId must be 1–64 characters of a-z, 0-9, _ or -");
                if (!double.IsFinite(f.X) || !double.IsFinite(f.Y) || !double.IsFinite(f.RotationDeg))
                    throw new GeometryValidationException("Furniture position and rotation must be finite numbers");
                var item = f.Id is Guid id && existingFurniture.TryGetValue(id, out var found) && usedFurnitureIds.Add(id)
                    ? found
                    : new FurnitureItem { Id = FreshOrRequested(f.Id, takenFurnitureIds, existingFurniture.Keys, usedFurnitureIds), ProjectId = project.Id };
                item.CatalogId = f.CatalogId;
                item.X = f.X;
                item.Y = f.Y;
                item.RotationDeg = f.RotationDeg;
                item.Version = nextVersion;
                keptFurniture.Add(item);
            }
            var keptFurnitureIds = keptFurniture.Select(f => f.Id).ToHashSet();
            _db.Furniture.RemoveRange(project.Furniture.Where(f => !keptFurnitureIds.Contains(f.Id)));
            _db.Furniture.AddRange(keptFurniture.Where(f => !existingFurniture.ContainsKey(f.Id)));
        }
```

with `public const int MaxFurniture = 2000;` on the handler. `FreshOrRequested` and `TakenElsewhereAsync` already exist in this class; if `TakenElsewhereAsync` is constrained to a type without an `Id`, give `FurnitureItem` the same shape (it has `Guid Id`) — match whatever constraint the existing helper uses.

`GetGeometryQuery.cs`: add `public record FurnitureDto(Guid Id, string CatalogId, double X, double Y, double RotationDeg);`, add `List<FurnitureDto> Furniture` to `GeometryDto` **after** `Openings` and before `Version`, `.Include(p => p.Furniture)`, and pass `project.Furniture.Select(f => new FurnitureDto(f.Id, f.CatalogId, f.X, f.Y, f.RotationDeg)).ToList()`. Fix every other `new GeometryDto(...)` construction the compiler reports (tests' fakes included) by passing `new()` for furniture.

`GeometryController.cs`: `public record SaveRequest(uint BaseVersion, List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings, List<FurnitureInput>? Furniture = null);` and pass `req.Furniture` as the new last argument. `InternalGeometryController.cs`: pass `req.Furniture ?? new List<FurnitureInput>()` — an import replaces the whole plan. `InterpretCopilotMessageCommand` stays as is (the default `null` keeps furniture).

- [ ] **Step 6: Run** — `dotnet test backend/Plan2Space.sln`. Expected: all pass.

- [ ] **Step 7: Commit** — `git add backend && git commit -m "feat: furniture saved with the plan; imports replace it, co-pilot edits keep it"` (with the trailer).

### Task 2: Staging places the client's items against walls and away from doors

**Files:** modify `ai-service/pipeline/generative_staging.py`, `ai-service/api/routers/staging.py`; create `ai-service/tests/test_staging_items.py`.

**Interfaces:**
- Produces: `suggest_layout(room_polygon, room_label, items: list[dict] | None = None, keep_clear: list[list[float]] | None = None) -> list[dict]` where an item is `{"item": id, "width_m", "depth_m", "against_wall": bool}` and a keep-clear zone is `[x, y, r]`; result entries `{"item", "position": [x, y], "rotation_deg", "width_m", "depth_m"}`. Router body gains optional `items: [{id, widthM, depthM, againstWall}]` and `keepClear: [[x, y, r]]`.

- [ ] **Step 1: Failing tests** — `ai-service/tests/test_staging_items.py`:

```python
# ai-service/tests/test_staging_items.py
# The client's catalog is the single source of truth: it sends the items, staging only positions them.
import math

from shapely import affinity
from shapely.geometry import Point, Polygon, box

from pipeline.generative_staging import WALL_CLEARANCE_M, suggest_layout

ROOM = [[0, 0], [4, 0], [4, 4], [0, 4]]
BED = {"item": "bed_double", "width_m": 1.6, "depth_m": 2.0, "against_wall": True}
TABLE = {"item": "coffee_table", "width_m": 1.0, "depth_m": 0.6, "against_wall": False}


def _footprint(p):
    x, y = p["position"]
    shape = box(x - p["width_m"] / 2, y - p["depth_m"] / 2, x + p["width_m"] / 2, y + p["depth_m"] / 2)
    return affinity.rotate(shape, p["rotation_deg"], origin=(x, y))


def test_the_given_items_are_placed_inside_the_room_without_overlap():
    placed = suggest_layout(ROOM, "Phòng ngủ", items=[BED, TABLE])
    assert [p["item"] for p in placed] == ["bed_double", "coffee_table"]
    shapes = [_footprint(p) for p in placed]
    assert all(Polygon(ROOM).buffer(1e-6).contains(s) for s in shapes)
    assert shapes[0].intersection(shapes[1]).area < 1e-6


def test_an_against_wall_item_has_its_back_to_a_wall_and_faces_into_the_room():
    [bed] = suggest_layout(ROOM, "Phòng ngủ", items=[BED])
    x, y = bed["position"]
    boundary = Polygon(ROOM).exterior
    assert Point(x, y).distance(boundary) <= WALL_CLEARANCE_M + BED["depth_m"] / 2 + 0.01
    theta = math.radians(bed["rotation_deg"])
    front = (math.sin(theta), -math.cos(theta))           # local −y after rotation
    ahead = Point(x + front[0] * (BED["depth_m"] / 2 + 0.3), y + front[1] * (BED["depth_m"] / 2 + 0.3))
    assert Polygon(ROOM).contains(ahead)
    assert ahead.distance(boundary) > Point(x, y).distance(boundary)


def test_nothing_is_placed_in_front_of_a_door():
    door_zone = [2.0, 0.0, 0.9]
    placed = suggest_layout(ROOM, "Phòng ngủ", items=[BED, TABLE], keep_clear=[door_zone])
    zone = Point(2.0, 0.0).buffer(0.9)
    assert all(not _footprint(p).intersects(zone) for p in placed)


def test_grid_items_go_near_the_middle_of_the_room():
    [table] = suggest_layout(ROOM, "Phòng khách", items=[TABLE])
    assert math.dist(table["position"], (2, 2)) < 0.5


def test_without_items_the_built_in_catalog_still_works():
    assert len(suggest_layout(ROOM, "Bedroom")) > 0
```

- [ ] **Step 2: Watch them fail** — `cd ai-service && .venv/Scripts/python.exe -m pytest tests/test_staging_items.py -q`. Expected: ImportError on `WALL_CLEARANCE_M`.

- [ ] **Step 3: Implement** — in `generative_staging.py` add imports `import math`, `from shapely import affinity`, `from shapely.geometry import Point` (keep existing ones), constants, helpers, and replace `suggest_layout`:

```python
# Room polygons run along wall centrelines: half a wall plus a finger's gap keeps an item off the wall.
WALL_CLEARANCE_M = 0.12
EDGE_STEP_M = 0.1


def _footprint(x: float, y: float, w: float, d: float, rotation_deg: float):
    return affinity.rotate(box(x - w / 2, y - d / 2, x + w / 2, y + d / 2), rotation_deg, origin=(x, y))


def _fits(candidate, room_poly, placed_boxes, keep_clear_zones) -> bool:
    return (room_poly.contains(candidate)
            and all(candidate.intersection(b).area < 1e-6 for b in placed_boxes)
            and not any(candidate.intersects(z) for z in keep_clear_zones))


def _against_wall(room_poly, w, d, placed_boxes, zones):
    """Back to an edge, front (local −y) facing into the room; longest edges first, sliding along each."""
    coords = list(room_poly.exterior.coords)
    edges = sorted(zip(coords[:-1], coords[1:]), key=lambda e: -math.dist(e[0], e[1]))
    for (ax, ay), (bx, by) in edges:
        length = math.dist((ax, ay), (bx, by))
        if length < w + 2 * MARGIN_M:
            continue
        ux, uy = (bx - ax) / length, (by - ay) / length
        nx, ny = -uy, ux
        if not room_poly.contains(Point((ax + bx) / 2 + nx * 0.05, (ay + by) / 2 + ny * 0.05)):
            nx, ny = -nx, -ny
        rotation = math.degrees(math.atan2(nx, -ny))
        offset = WALL_CLEARANCE_M + d / 2
        s = MARGIN_M + w / 2
        while s <= length - MARGIN_M - w / 2 + 1e-9:
            x, y = ax + ux * s + nx * offset, ay + uy * s + ny * offset
            candidate = _footprint(x, y, w, d, rotation)
            if _fits(candidate, room_poly, placed_boxes, zones):
                return x, y, rotation, candidate
            s += EDGE_STEP_M
    return None


def _on_grid(room_poly, w, d, placed_boxes, zones):
    """Unrotated, trying spots nearest the room's middle first."""
    minx, miny, maxx, maxy = room_poly.bounds
    centre = room_poly.representative_point()
    spots = []
    y = miny + d / 2 + MARGIN_M
    while y + d / 2 + MARGIN_M <= maxy:
        x = minx + w / 2 + MARGIN_M
        while x + w / 2 + MARGIN_M <= maxx:
            spots.append((x, y))
            x += STEP_M
        y += STEP_M
    for x, y in sorted(spots, key=lambda s: math.dist(s, (centre.x, centre.y))):
        candidate = _footprint(x, y, w, d, 0.0)
        if _fits(candidate, room_poly, placed_boxes, zones):
            return x, y, 0.0, candidate
    return None


def suggest_layout(room_polygon: list[list[float]], room_label: str,
                   items: list[dict] | None = None, keep_clear: list[list[float]] | None = None) -> list[dict]:
    """Places each item inside the room without overlap and outside the keep-clear zones (in front of doors).
    Against-wall items go back-to-edge facing in; the rest go nearest the middle. Items that fit nowhere are
    skipped. Without `items`, the built-in catalog for the room label is used."""
    if len({tuple(p) for p in room_polygon}) < 3:
        raise ValueError("A room polygon needs at least 3 distinct points")
    room_poly = Polygon(room_polygon)
    if not room_poly.is_valid or room_poly.area <= 0:
        raise ValueError("Room polygon is invalid (self-intersecting or zero area)")
    zones = [Point(x, y).buffer(r) for x, y, r in (keep_clear or [])]
    wanted = items if items is not None else [dict(f, against_wall=False) for f in catalog_for(room_label)]

    placed_boxes, results = [], []
    for furniture in wanted:
        w, d = furniture["width_m"], furniture["depth_m"]
        spot = (_against_wall(room_poly, w, d, placed_boxes, zones) if furniture.get("against_wall") else None) \
            or _on_grid(room_poly, w, d, placed_boxes, zones)
        if spot is None:
            continue
        x, y, rotation, candidate = spot
        placed_boxes.append(candidate)
        results.append({"item": furniture["item"], "position": [round(x, 6), round(y, 6)],
                        "rotation_deg": round(rotation, 6), "width_m": w, "depth_m": d})
    return results
```

Router — replace `SuggestRequest` and the call:

```python
class ItemIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    width_m: float = Field(alias="widthM")
    depth_m: float = Field(alias="depthM")
    against_wall: bool = Field(default=False, alias="againstWall")


class SuggestRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    room_polygon: list[list[float]] = Field(alias="roomPolygon")
    room_label: str = Field(alias="roomLabel")
    items: list[ItemIn] | None = None
    keep_clear: list[list[float]] = Field(default_factory=list, alias="keepClear")
```

(`from pydantic import BaseModel, ConfigDict, Field`), and in the handler:

```python
        items = None if req.items is None else [
            {"item": i.id, "width_m": i.width_m, "depth_m": i.depth_m, "against_wall": i.against_wall} for i in req.items]
        return {"items": suggest_layout(req.room_polygon, req.room_label, items, req.keep_clear)}
```

- [ ] **Step 4: Run** — the new file, then the whole Python suite. Expected: all pass, including `test_generative_staging.py`.

- [ ] **Step 5: Commit** — `feat: staging places the client's items against walls and clear of doors`.

### Task 3: The API passes items and keep-clear zones through

**Files:** modify `backend/src/Plan2Space.Application/Staging/IStagingClient.cs`, `backend/src/Plan2Space.Infrastructure/Staging/StagingHttpClient.cs`, `backend/src/Plan2Space.API/Controllers/StagingController.cs`, `backend/tests/Plan2Space.API.IntegrationTests/StagingControllerTests.cs`.

**Interfaces:**
- Produces: `StagingRequestItem(string Id, double WidthM, double DepthM, bool AgainstWall)`; `IStagingClient.SuggestAsync(List<List<double>> roomPolygon, string roomLabel, List<StagingRequestItem>? items, List<List<double>>? keepClear, CancellationToken ct)`; `POST /api/staging/suggest` body gains optional `items` and `keepClear`; 400 for more than 50 items, an item with a bad id or a non-positive size, or a keep-clear entry that is not 3 finite numbers with a positive radius.

- [ ] **Step 1: Failing test** — in `StagingControllerTests`, change `FakeStagingClient` to the new signature and record what it received:

```csharp
    private class FakeStagingClient : IStagingClient
    {
        private readonly Func<List<List<double>>, string, List<StagingItem>> _reply;
        public List<StagingRequestItem>? SeenItems;
        public List<List<double>>? SeenKeepClear;
        public FakeStagingClient(Func<List<List<double>>, string, List<StagingItem>> reply) => _reply = reply;
        public Task<List<StagingItem>> SuggestAsync(List<List<double>> roomPolygon, string roomLabel,
            List<StagingRequestItem>? items, List<List<double>>? keepClear, CancellationToken ct)
        {
            SeenItems = items;
            SeenKeepClear = keepClear;
            return Task.FromResult(_reply(roomPolygon, roomLabel));
        }
    }
```

Keep `ClientAsync` building the client from a `FakeStagingClient` instance; add an overload taking the instance so the test can read it:

```csharp
    [Fact]
    public async Task ItemsAndKeepClearZones_ArePassedToTheAiService()
    {
        var fake = new FakeStagingClient((_, _) => new List<StagingItem>());
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IStagingClient>(fake)));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, "staging-items@plan2space.dev"));

        var res = await client.PostAsJsonAsync("/api/staging/suggest", new
        {
            roomPolygon = Square, roomLabel = "Phòng ngủ",
            items = new[] { new { id = "bed_double", widthM = 1.6, depthM = 2.0, againstWall = true } },
            keepClear = new[] { new[] { 2.0, 0.0, 0.9 } }
        });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("bed_double", fake.SeenItems![0].Id);
        Assert.True(fake.SeenItems[0].AgainstWall);
        Assert.Equal(0.9, fake.SeenKeepClear![0][2]);
    }

    [Fact]
    public async Task ANonPositiveItemSize_Returns400()
    {
        var client = await ClientAsync("staging-bad-item@plan2space.dev", (_, _) => new());
        var res = await client.PostAsJsonAsync("/api/staging/suggest", new
        {
            roomPolygon = Square, roomLabel = "x", items = new[] { new { id = "bed", widthM = 0.0, depthM = 2.0, againstWall = false } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
```

- [ ] **Step 2: Watch it fail** — compile error: `StagingRequestItem` does not exist.

- [ ] **Step 3: Implement** — `IStagingClient.cs`: add `public record StagingRequestItem(string Id, double WidthM, double DepthM, bool AgainstWall);` and change the method to the signature above. `StagingHttpClient.cs`: post `new { roomPolygon, roomLabel, items, keepClear }` (null `items` serialises as null, which the Python model accepts; null `keepClear` → send `keepClear ?? new()`). `StagingController.cs`:

```csharp
    public record SuggestRequest(List<List<double>> RoomPolygon, string RoomLabel,
        List<StagingRequestItem>? Items = null, List<List<double>>? KeepClear = null);
    private static readonly Regex ItemId = new("^[a-z0-9_-]{1,64}$", RegexOptions.Compiled);
```

and after the polygon check:

```csharp
        if (req.Items is { Count: > 50 } || req.Items?.Any(i => i is null || i.Id is null || !ItemId.IsMatch(i.Id)
                || !(i.WidthM > 0) || !(i.DepthM > 0) || !double.IsFinite(i.WidthM) || !double.IsFinite(i.DepthM)) == true)
            return BadRequest(new { message = "items must be at most 50 entries with an id and positive sizes." });
        if (req.KeepClear?.Any(z => z is null || z.Count != 3 || z.Any(v => !double.IsFinite(v)) || !(z[2] > 0)) == true)
            return BadRequest(new { message = "keepClear entries must be [x, y, radius] with a positive radius." });
```

and call `_staging.SuggestAsync(req.RoomPolygon, req.RoomLabel ?? "", req.Items, req.KeepClear, ct)`. (`using System.Text.RegularExpressions;`)

- [ ] **Step 4: Run** — `dotnet test backend/Plan2Space.sln --filter "FullyQualifiedName~StagingControllerTests"`, then the whole .NET suite. Expected: all pass.

- [ ] **Step 5: Commit** — `feat: staging API accepts the items to place and door keep-clear zones`.

### Task 4: Normalise the models into a catalog

**Files:** create `tools/furniture/package.json`, `tools/furniture/sources.json`, `tools/furniture/fit.mjs`, `tools/furniture/fit.test.mjs`, `tools/furniture/build.mjs`; modify `.gitignore`; outputs `plan2space-web/public/furniture/*.glb` and `catalog.json`.

**Interfaces:**
- Produces: `catalog.json` = `{ "items": [{ id, name, file | null, widthM, depthM, heightM, elevationM, againstWall, roomTypes, attribution }], "autoFurnish": { bedroom: [...], living: [...], dining: [...], kitchen: [...], bathroom: [...] } }`; files at `/furniture/<id>.glb`.
- `fitTransform(bounds: { min: [x,y,z], max: [x,y,z] }, target: { widthM, depthM, heightM }, yawOffsetDeg = 0): { scale, yawDeg, translation: [x,y,z] }`.

- [ ] **Step 1: Failing test** — `tools/furniture/fit.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitTransform, applyTransform } from './fit.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('a centimetre model is scaled uniformly to fit, centred, standing on the floor', () => {
  const t = fitTransform({ min: [10, 5, 20], max: [210, 105, 70] }, { widthM: 2, depthM: 0.5, heightM: 1 })
  near(t.scale, 0.01)
  near(t.yawDeg, 0)
  const lo = applyTransform([10, 5, 20], t)
  const hi = applyTransform([210, 105, 70], t)
  near(lo[0], -1); near(hi[0], 1)        // width centred on x
  near(lo[1], 0); near(hi[1], 1)         // base on the floor
  near(lo[2], -0.25); near(hi[2], 0.25)  // depth centred on z
})

test('it turns when the long sides of the model and of the catalog entry disagree', () => {
  // A toilet: catalog depth (0.7) > width (0.4), model long along x.
  const t = fitTransform({ min: [0, 0, 0], max: [68, 78, 48] }, { widthM: 0.4, depthM: 0.7, heightM: 0.78 })
  near(t.yawDeg, 90)
  near(t.scale, Math.min(0.4 / 48, 0.7 / 68, 0.78 / 78))
})

test('proportions are never distorted: the tightest axis decides', () => {
  const t = fitTransform({ min: [0, 0, 0], max: [1, 4, 1] }, { widthM: 1, depthM: 1, heightM: 2 })
  near(t.scale, 0.5)
})
```

- [ ] **Step 2: Watch it fail** — `cd tools/furniture && node --test`. Expected: cannot find module `./fit.mjs`.

- [ ] **Step 3: Fit maths** — `tools/furniture/fit.mjs`:

```js
// One uniform scale fits the model into the catalog box (absorbing cm / mm / inch sources), a 90° turn aligns
// its long horizontal side with the catalog's long side, and the footprint is centred with the base at y = 0.
export function fitTransform(bounds, target, yawOffsetDeg = 0) {
  const [ex, ey, ez] = bounds.max.map((v, i) => v - bounds.min[i])
  const turn = (ex >= ez) !== (target.widthM >= target.depthM)
  const [w0, d0] = turn ? [ez, ex] : [ex, ez]
  const scale = Math.min(target.widthM / w0, target.depthM / d0, target.heightM / ey)
  const yawDeg = (turn ? 90 : 0) + yawOffsetDeg
  const cx = (bounds.min[0] + bounds.max[0]) / 2
  const cz = (bounds.min[2] + bounds.max[2]) / 2
  const [rx, rz] = rotateY([cx, cz], yawDeg)
  return { scale, yawDeg, translation: [-scale * rx, -scale * bounds.min[1], -scale * rz] }
}

function rotateY([x, z], deg) {
  const a = (deg * Math.PI) / 180
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]
}

// glTF node transform order: translation · rotation · scale.
export function applyTransform([x, y, z], t) {
  const [rx, rz] = rotateY([x * t.scale, z * t.scale], t.yawDeg)
  return [rx + t.translation[0], y * t.scale + t.translation[1], rz + t.translation[2]]
}

export function yawQuaternion(deg) {
  const a = (deg * Math.PI) / 360
  return [0, Math.sin(a), 0, Math.cos(a)]
}
```

- [ ] **Step 4: Run** — `node --test`. Expected: 3 pass.

- [ ] **Step 5: Package, sources, build script** — `tools/furniture/package.json`:

```json
{
  "name": "plan2space-furniture-tools",
  "private": true,
  "type": "module",
  "scripts": { "build": "node build.mjs", "test": "node --test" },
  "devDependencies": {
    "@gltf-transform/core": "^4.1.0",
    "@gltf-transform/extensions": "^4.1.0",
    "@gltf-transform/functions": "^4.1.0",
    "meshoptimizer": "^0.22.0",
    "sharp": "^0.33.5"
  }
}
```

`tools/furniture/sources.json` (sizes in metres; `source` relative to `plan2space/model3d/`; `attribution` empty until the user supplies sources):

```json
{
  "items": [
    { "id": "bed_double", "name": "Giường đôi", "source": "bed.glb", "widthM": 1.6, "depthM": 2.0, "heightM": 1.0, "elevationM": 0, "againstWall": true, "roomTypes": ["bedroom"] },
    { "id": "bed_single", "name": "Giường đơn", "source": "gingle_bed.glb", "widthM": 1.0, "depthM": 2.0, "heightM": 0.9, "elevationM": 0, "againstWall": true, "roomTypes": ["bedroom"] },
    { "id": "nightstand", "name": "Tủ đầu giường", "source": "nightstand.glb", "widthM": 0.45, "depthM": 0.4, "heightM": 0.55, "elevationM": 0, "againstWall": true, "roomTypes": ["bedroom"] },
    { "id": "wardrobe", "name": "Tủ quần áo", "source": "wardrobe_2door.glb", "widthM": 1.2, "depthM": 0.6, "heightM": 2.0, "elevationM": 0, "againstWall": true, "roomTypes": ["bedroom"] },
    { "id": "sofa", "name": "Sofa", "source": "sofa_set.glb", "widthM": 2.2, "depthM": 0.9, "heightM": 0.85, "elevationM": 0, "againstWall": true, "roomTypes": ["living"] },
    { "id": "coffee_table", "name": "Bàn trà", "source": "coffee_table.glb", "widthM": 1.0, "depthM": 0.6, "heightM": 0.45, "elevationM": 0, "againstWall": false, "roomTypes": ["living"] },
    { "id": "tv", "name": "TV treo tường", "source": "tv_screen.glb", "widthM": 1.4, "depthM": 0.1, "heightM": 0.85, "elevationM": 0.9, "againstWall": true, "roomTypes": ["living"] },
    { "id": "dining_set", "name": "Bộ bàn ăn", "source": "dining_set.glb", "widthM": 1.5, "depthM": 1.6, "heightM": 0.8, "elevationM": 0, "againstWall": false, "roomTypes": ["dining"] },
    { "id": "dining_table", "name": "Bàn ăn", "source": "dining_table_4.glb", "widthM": 1.2, "depthM": 0.8, "heightM": 0.75, "elevationM": 0, "againstWall": false, "roomTypes": ["dining"] },
    { "id": "dining_chair", "name": "Ghế ăn", "source": "dining_chair.glb", "widthM": 0.45, "depthM": 0.5, "heightM": 0.9, "elevationM": 0, "againstWall": false, "roomTypes": ["dining"] },
    { "id": "kitchen_counter", "name": "Tủ bếp chữ L", "source": "basic_kitchen_cabinets_and_counter.glb", "widthM": 1.8, "depthM": 1.6, "heightM": 0.9, "elevationM": 0, "againstWall": true, "roomTypes": ["kitchen"] },
    { "id": "kitchen_sink", "name": "Tủ chậu rửa", "source": "a_kitchen_sink_with_cabinets_for_storage.glb", "widthM": 1.8, "depthM": 0.65, "heightM": 1.1, "elevationM": 0, "againstWall": true, "roomTypes": ["kitchen"] },
    { "id": "base_cabinet", "name": "Tủ bếp dưới", "source": "modularkitchen_-_baseunit_-_60_-_slab_-_doors.glb", "widthM": 1.2, "depthM": 0.6, "heightM": 0.9, "elevationM": 0, "againstWall": true, "roomTypes": ["kitchen"] },
    { "id": "wall_cabinet", "name": "Tủ bếp treo", "source": "wall_kitchen_cupboard.glb", "widthM": 1.0, "depthM": 0.37, "heightM": 0.54, "elevationM": 1.45, "againstWall": true, "roomTypes": ["kitchen"] },
    { "id": "cooktop", "name": "Bếp nấu", "source": "cooktop_burner.glb", "widthM": 0.7, "depthM": 0.4, "heightM": 0.06, "elevationM": 0.9, "againstWall": false, "roomTypes": ["kitchen"] },
    { "id": "fridge", "name": "Tủ lạnh", "source": "fridge.glb", "widthM": 0.7, "depthM": 0.7, "heightM": 1.8, "elevationM": 0, "againstWall": true, "roomTypes": ["kitchen"] },
    { "id": "toilet", "name": "Bồn cầu", "source": "toilet.glb", "widthM": 0.4, "depthM": 0.7, "heightM": 0.78, "elevationM": 0, "againstWall": true, "roomTypes": ["bathroom"] },
    { "id": "lavabo", "name": "Lavabo", "source": "lavabo_wc_01.glb", "widthM": 0.5, "depthM": 0.45, "heightM": 0.85, "elevationM": 0, "againstWall": true, "roomTypes": ["bathroom"] },
    { "id": "shower", "name": "Buồng tắm", "source": "shower.glb", "widthM": 0.9, "depthM": 0.9, "heightM": 2.1, "elevationM": 0, "againstWall": true, "roomTypes": ["bathroom"] },
    { "id": "washing_machine", "name": "Máy giặt", "source": null, "widthM": 0.6, "depthM": 0.6, "heightM": 0.85, "elevationM": 0, "againstWall": true, "roomTypes": ["bathroom"] }
  ],
  "autoFurnish": {
    "bedroom": ["bed_double", "nightstand", "wardrobe"],
    "living": ["sofa", "coffee_table", "tv"],
    "dining": ["dining_set"],
    "kitchen": ["kitchen_counter", "fridge"],
    "bathroom": ["toilet", "lavabo", "shower", "washing_machine"]
  }
}
```

`tools/furniture/build.mjs`:

```js
// Normalises plan2space/model3d/*.glb into plan2space-web/public/furniture/ and writes catalog.json.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, simplify, textureCompress, getBounds } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { fitTransform, yawQuaternion } from './fit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = path.resolve(here, '../../model3d')
const OUT_DIR = path.resolve(here, '../../plan2space-web/public/furniture')
const MAX_BYTES = 2 * 1024 * 1024
const MAX_TRIANGLES = 30000

function triangleCount(doc) {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      n += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3
    }
  return n
}

const sources = JSON.parse(await readFile(path.join(here, 'sources.json'), 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
await MeshoptSimplifier.ready
await mkdir(OUT_DIR, { recursive: true })

const items = []
for (const s of sources.items) {
  const { source, yawOffsetDeg = 0, ...entry } = s
  if (!source) {
    items.push({ ...entry, file: null, attribution: s.attribution ?? '' })
    continue
  }
  const doc = await io.read(path.join(SOURCE_DIR, source))
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const t = fitTransform(getBounds(scene), entry, yawOffsetDeg)
  const root = doc.createNode(`${entry.id}_normalised`)
    .setScale([t.scale, t.scale, t.scale]).setRotation(yawQuaternion(t.yawDeg)).setTranslation(t.translation)
  for (const child of scene.listChildren()) { scene.removeChild(child); root.addChild(child) }
  scene.addChild(root)
  const tris = triangleCount(doc)
  await doc.transform(
    dedup(), prune(), weld(),
    ...(tris > MAX_TRIANGLES ? [simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIANGLES / tris, error: 0.01 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  )
  const out = path.join(OUT_DIR, `${entry.id}.glb`)
  await io.write(out, doc)
  const { size } = await stat(out)
  if (size > MAX_BYTES) throw new Error(`${entry.id}.glb is ${(size / 1e6).toFixed(1)} MB (limit 2 MB)`)
  console.log(`${entry.id.padEnd(16)} ${(size / 1e6).toFixed(2)} MB  ${Math.round(Math.min(tris, MAX_TRIANGLES))} tris  scale ${t.scale.toPrecision(3)}  yaw ${t.yawDeg}`)
  items.push({ ...entry, file: `/furniture/${entry.id}.glb`, attribution: s.attribution ?? '' })
}
await writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify({ items, autoFurnish: sources.autoFurnish }, null, 2) + '\n')
console.log(`catalog.json: ${items.length} items`)
```

`.gitignore` (repo root): add `model3d/` and `tools/furniture/node_modules/`.

- [ ] **Step 6: Build** — `cd tools/furniture && npm install && npm run build`. Expected: 19 lines of sizes, all under 2 MB, then `catalog.json: 20 items`. If an item exceeds 2 MB, lower its texture size by adding `"maxTexture": 512` handling only for it — or report it; do not raise the limit.

- [ ] **Step 7: Measure the outputs** — with the ai-service venv:

```bash
ai-service/.venv/Scripts/python.exe -c "
import glob, json, trimesh
cat = {i['id']: i for i in json.load(open('plan2space-web/public/furniture/catalog.json'))['items']}
for f in sorted(glob.glob('plan2space-web/public/furniture/*.glb')):
    s = trimesh.load(f, force='scene'); e = s.extents; b = s.bounds; i = cat[f.split('/')[-1].split('\\\\')[-1][:-4]]
    print(f'{i[\"id\"]:16s} {e[0]:.2f} x {e[1]:.2f} x {e[2]:.2f}  floor {b[0][1]:+.3f}  fits {e[0] <= i[\"widthM\"]+1e-3 and e[2] <= i[\"depthM\"]+1e-3 and e[1] <= i[\"heightM\"]+1e-3}')"
```

Expected: every line `fits True` and `floor +0.000` (±0.001).

- [ ] **Step 8: Commit** — `git add .gitignore tools/furniture/package.json tools/furniture/package-lock.json tools/furniture/sources.json tools/furniture/*.mjs plan2space-web/public/furniture` → `feat: normalise the furniture models into a web catalog`.

### Task 5: Furniture in the store, and room labels that survive re-derivation

**Files:** create `plan2space-web/src/services/catalogService.ts`, `src/lib/roomTypes.ts`; modify `src/services/geometryService.ts`, `src/stores/geometryStore.ts`; tests `tests/furnitureStore.test.ts`, `tests/roomTypes.test.ts`.

**Interfaces:**
- Produces: `FurnitureItem { id: string; catalogId: string; x: number; y: number; rotationDeg: number }`; `GeometryDto.furniture?: FurnitureItem[]`; `saveGeometry` payload `furniture: { id?, catalogId, x, y, rotationDeg }[]`.
- `CatalogEntry { id, name, file: string | null, widthM, depthM, heightM, elevationM, againstWall, roomTypes: RoomType[], attribution }`; `Catalog { items: CatalogEntry[]; autoFurnish: Record<RoomType, string[]>; byId: Record<string, CatalogEntry> }`; `loadCatalog(): Promise<Catalog>` (cached); `useCatalog(): Catalog | null`.
- `RoomType = 'bedroom' | 'living' | 'dining' | 'kitchen' | 'bathroom'`; `ROOM_TYPES: { type: RoomType; label: string }[]`; `roomTypeOf(label: string): RoomType | null`; `labelFor(type: RoomType): string`.
- Store: `furniture: FurnitureItem[]`; `addFurniture(item: Omit<FurnitureItem, 'id'>): string`; `moveFurniture(id, x, y)`; `rotateFurniture(id, deltaDeg)`; `deleteFurniture(id)`; `replaceFurnitureInRoom(room: Point[], items: Omit<FurnitureItem, 'id'>[])`; `updateRoomLabel(roomId, label)`. `PlanSnapshot` gains `furniture`. `scalePlan` scales furniture `x`, `y`. Load, draft, restore and save carry furniture. Re-derived rooms inherit the label of the old room containing their interior point.

- [ ] **Step 1: Failing tests** — `tests/roomTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { roomTypeOf, labelFor } from '../src/lib/roomTypes'

describe('room types', () => {
  it('reads the fixed labels and common spellings', () => {
    expect(roomTypeOf('Phòng ngủ')).toBe('bedroom')
    expect(roomTypeOf('phong khach')).toBe('living')
    expect(roomTypeOf('Phòng ăn')).toBe('dining')
    expect(roomTypeOf('Bếp')).toBe('kitchen')
    expect(roomTypeOf('WC')).toBe('bathroom')
    expect(roomTypeOf('Phòng tắm')).toBe('bathroom')
    expect(roomTypeOf('Room 3')).toBeNull()
  })
  it('labels round-trip', () => {
    expect(roomTypeOf(labelFor('kitchen'))).toBe('kitchen')
  })
})
```

`tests/furnitureStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { draftKey, useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const square = (x: number, y: number, s: number) =>
  [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }]

describe('furniture in the store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false,
      walls: [], openings: [], furniture: [], rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1, points: square(0, 0, 4) }] })
  })

  it('adds, moves, rotates and deletes furniture without touching walls', () => {
    const id = useGeometryStore.getState().addFurniture({ catalogId: 'bed_double', x: 1, y: 1, rotationDeg: 0 })
    useGeometryStore.getState().moveFurniture(id, 2, 2)
    useGeometryStore.getState().rotateFurniture(id, 90)
    useGeometryStore.getState().rotateFurniture(id, 300)
    expect(useGeometryStore.getState().furniture[0]).toMatchObject({ x: 2, y: 2, rotationDeg: 30 })
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
    expect(useGeometryStore.getState().dirty).toBe(true)
    useGeometryStore.getState().deleteFurniture(id)
    expect(useGeometryStore.getState().furniture).toHaveLength(0)
  })

  it("replacing a room's furniture leaves other rooms' furniture alone", () => {
    useGeometryStore.getState().addFurniture({ catalogId: 'sofa', x: 1, y: 1, rotationDeg: 0 })      // in the room
    useGeometryStore.getState().addFurniture({ catalogId: 'fridge', x: 9, y: 9, rotationDeg: 0 })    // elsewhere
    useGeometryStore.getState().replaceFurnitureInRoom(square(0, 0, 4), [{ catalogId: 'bed_double', x: 2, y: 1, rotationDeg: 0 }])
    expect(useGeometryStore.getState().furniture.map((f) => f.catalogId).sort()).toEqual(['bed_double', 'fridge'])
  })

  it('furniture is saved, drafted and scaled with the plan', async () => {
    useGeometryStore.getState().addFurniture({ catalogId: 'sofa', x: 2, y: 4, rotationDeg: 90 })
    expect(JSON.parse(localStorage.getItem(draftKey('p'))!).furniture).toHaveLength(1)
    useGeometryStore.getState().scalePlan(0.5)
    expect(useGeometryStore.getState().furniture[0]).toMatchObject({ x: 1, y: 2, rotationDeg: 90 })
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].furniture[0]).toMatchObject({ catalogId: 'sofa', x: 1, y: 2 })
  })

  it('a re-derived room keeps the label the user gave the room it replaces', async () => {
    // Review focus: editing a wall must not turn "Phòng ngủ" back into "Room 1".
    vi.mocked(geometryService.deriveRooms).mockResolvedValue([{ points: square(0, 0, 3.8), label: 'Room 1' }])
    useGeometryStore.setState({ wallsEdited: true, dirty: true })
    await useGeometryStore.getState().saveToServer('p')
    expect(useGeometryStore.getState().rooms[0].label).toBe('Phòng ngủ')
  })

  it('loading a plan picks up its furniture', async () => {
    vi.mocked(geometryService.fetchGeometry).mockResolvedValue({ walls: [], rooms: [], openings: [], version: 3,
      furniture: [{ id: 'f1', catalogId: 'tv', x: 1, y: 2, rotationDeg: 0 }] })
    await useGeometryStore.getState().loadFromServer('p')
    expect(useGeometryStore.getState().furniture).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Watch them fail** — `npx vitest run tests/roomTypes.test.ts tests/furnitureStore.test.ts`. Expected: module `roomTypes` not found; `addFurniture is not a function`.

- [ ] **Step 3: Types and catalog** — `geometryService.ts`: add

```ts
export interface FurnitureItem {
  id: string
  catalogId: string
  x: number
  y: number
  rotationDeg: number
}
```

add `furniture?: FurnitureItem[]` to `GeometryDto`, and `furniture: { id?: string; catalogId: string; x: number; y: number; rotationDeg: number }[]` to the `saveGeometry` payload type.

`src/lib/roomTypes.ts`:

```ts
export type RoomType = 'bedroom' | 'living' | 'dining' | 'kitchen' | 'bathroom'

export const ROOM_TYPES: { type: RoomType; label: string }[] = [
  { type: 'bedroom', label: 'Phòng ngủ' },
  { type: 'living', label: 'Phòng khách' },
  { type: 'dining', label: 'Phòng ăn' },
  { type: 'kitchen', label: 'Bếp' },
  { type: 'bathroom', label: 'WC' },
]

const KEYWORDS: [RoomType, string[]][] = [
  ['bedroom', ['ngu', 'bedroom']],
  ['living', ['khach', 'living']],
  ['dining', ['phong an', 'dining']],
  ['kitchen', ['bep', 'kitchen']],
  ['bathroom', ['wc', 'tam', 've sinh', 'bath', 'toilet']],
]

function normalise(label: string): string {
  return label.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Rooms from the pipeline are "Room N"; a type exists only once the user has chosen one.
export function roomTypeOf(label: string): RoomType | null {
  const text = normalise(label)
  for (const [type, words] of KEYWORDS) if (words.some((w) => text.includes(w))) return type
  return null
}

export function labelFor(type: RoomType): string {
  return ROOM_TYPES.find((t) => t.type === type)!.label
}
```

`src/services/catalogService.ts`:

```ts
import { useEffect, useState } from 'react'
import { RoomType } from '../lib/roomTypes'

export interface CatalogEntry {
  id: string
  name: string
  file: string | null
  widthM: number
  depthM: number
  heightM: number
  elevationM: number
  againstWall: boolean
  roomTypes: RoomType[]
  attribution: string
}

export interface Catalog {
  items: CatalogEntry[]
  autoFurnish: Record<RoomType, string[]>
  byId: Record<string, CatalogEntry>
}

let cached: Promise<Catalog> | null = null

// A static file served next to the app: the single catalog every layer reads.
export function loadCatalog(): Promise<Catalog> {
  cached ??= fetch('/furniture/catalog.json')
    .then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json() })
    .then((c) => ({ ...c, byId: Object.fromEntries(c.items.map((i: CatalogEntry) => [i.id, i])) }))
    .catch((e) => { cached = null; throw e })
  return cached
}

export function useCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((c) => { if (alive) setCatalog(c) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return catalog
}
```

- [ ] **Step 4: Store** — in `geometryStore.ts`:
  - import `FurnitureItem` from the service, `interiorPoint, pointInPolygon` from `../lib/planGeometry`;
  - `PlanSnapshot` and `Draft` gain `furniture` (`furniture?: FurnitureItem[]` on `Draft`, since older drafts lack it);
  - `GeometryState` gains `furniture: FurnitureItem[]` and the six actions listed above;
  - initial `furniture: []`; both `loadFromServer` branches set `furniture: draft.furniture ?? []` / `dto.furniture ?? []`; `applyAiResult` sets `furniture: dto.furniture ?? []`;
  - `markEdited` and the in-flight rewrite in `saveToServer` and `restorePlan` write `furniture` into the draft; `snapshotPlan`/`restorePlan` carry it;
  - `scalePlan` adds `furniture: state.furniture.map((f) => ({ ...f, x: f.x * factor, y: f.y * factor }))`;
  - the save payload adds `furniture: furniture.map((f) => ({ id: f.id, catalogId: f.catalogId, x: f.x, y: f.y, rotationDeg: f.rotationDeg }))` taken from the snapshot read at the top of `saveToServer` alongside walls and openings;
  - the derived rooms in `saveToServer` become:

```ts
          const previous = get().rooms
          rooms = derived.map((r) => {
            // A re-derived room keeps the label the user gave the room it replaces.
            const probe = interiorPoint(r.points)
            const before = previous.find((old) => pointInPolygon(probe, old.points))
            return { id: newId(), points: r.points, label: before?.label ?? r.label, version: 0 }
          })
```

Actions:

```ts
    addFurniture: (item) => {
      const id = newId()
      set((state) => ({ furniture: [...state.furniture, { ...item, id }] }))
      markEdited()
      return id
    },
    moveFurniture: (id, x, y) => {
      set((state) => ({ furniture: state.furniture.map((f) => (f.id === id ? { ...f, x, y } : f)) }))
      markEdited()
    },
    rotateFurniture: (id, deltaDeg) => {
      set((state) => ({ furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, rotationDeg: (((f.rotationDeg + deltaDeg) % 360) + 360) % 360 } : f) }))
      markEdited()
    },
    deleteFurniture: (id) => {
      set((state) => ({ furniture: state.furniture.filter((f) => f.id !== id) }))
      markEdited()
    },
    replaceFurnitureInRoom: (room, items) => {
      set((state) => ({ furniture: [
        ...state.furniture.filter((f) => !pointInPolygon({ x: f.x, y: f.y }, room)),
        ...items.map((i) => ({ ...i, id: newId() })),
      ] }))
      markEdited()
    },
    updateRoomLabel: (roomId, label) => {
      set((state) => ({ rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, label } : r)) }))
      markEdited()
    },
```

  - `StudioToolbar.tsx` import confirmation text becomes `'Importing replaces the whole current plan (walls, rooms, doors, windows and furniture). Continue?'`.

- [ ] **Step 5: Run** — `npx vitest run && npx tsc --noEmit`. Expected: all pass (fix any existing test whose `setState` omitted `furniture` only if it now fails — a missing array defaults from the store's initial state).

- [ ] **Step 6: Commit** — `feat: furniture in the plan store; re-derived rooms keep their labels`.

### Task 6: Furniture on the 2D plan

**Files:** create `src/components/studio/Canvas2D/FurnitureLayer.tsx`, `FurnitureLibrary.tsx`; modify `src/stores/editorStore.ts`, `src/hooks/useEditorShortcuts.ts`, `CanvasEditor.tsx`, `StudioToolbar.tsx`; test `tests/furnitureShortcuts.test.tsx`.

**Interfaces:**
- Consumes: store furniture actions (Task 5), `useCatalog` (Task 5).
- Produces: `Tool` gains `'furniture'` (key F); `Selection` kinds gain `'furniture' | 'room'`; `editorStore.pendingCatalogId: string | null`, `setPendingCatalogId(id)`; R rotates the selected furniture by 90°; Delete removes it; a room selection is never deleted by Delete.

- [ ] **Step 1: Failing tests** — `tests/furnitureShortcuts.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

function Harness() {
  useEditorShortcuts()
  return <input aria-label="field" />
}

describe('furniture shortcuts', () => {
  beforeEach(() => {
    useGeometryStore.setState({ projectId: 'p', walls: [], openings: [], version: 1, dirty: false, wallsEdited: false,
      rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }] }],
      furniture: [{ id: 'f1', catalogId: 'sofa', x: 1, y: 1, rotationDeg: 0 }] })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'furniture', id: 'f1' }, walking: false })
  })

  it('F chooses the furniture tool', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'f' })
    expect(useEditorStore.getState().tool).toBe('furniture')
  })

  it('R turns the selected piece a quarter turn; Delete removes it', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'r' })
    expect(useGeometryStore.getState().furniture[0].rotationDeg).toBe(90)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().furniture).toHaveLength(0)
  })

  it('R typed into a field, or while walking, does nothing', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('field'), { key: 'r' })
    useEditorStore.setState({ walking: true })
    fireEvent.keyDown(window, { key: 'r' })
    expect(useGeometryStore.getState().furniture[0].rotationDeg).toBe(0)
  })

  it('Delete on a selected room removes nothing', () => {
    useEditorStore.setState({ selection: { kind: 'room', id: 'r1' } })
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().rooms).toHaveLength(1)
    expect(useGeometryStore.getState().furniture).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Editor state and keys** — `editorStore.ts`: `Tool` adds `'furniture'`; `Selection = { kind: 'wall' | 'opening' | 'furniture' | 'room'; id: string } | null`; add `pendingCatalogId: string | null` (initial null) and `setPendingCatalogId: (id: string | null) => void`. `useEditorShortcuts.ts`: `TOOL_KEYS` adds `f: 'furniture'`; the Delete branch becomes:

```ts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection, select } = useEditorStore.getState()
        if (!selection || selection.kind === 'room') return        // rooms come from walls; they are not deleted
        e.preventDefault()
        const geometry = useGeometryStore.getState()
        if (selection.kind === 'wall') geometry.deleteWall(selection.id)
        else if (selection.kind === 'opening') geometry.deleteOpening(selection.id)
        else geometry.deleteFurniture(selection.id)
        select(null)
        return
      }
      if (e.key.toLowerCase() === 'r') {
        const { selection } = useEditorStore.getState()
        if (selection?.kind === 'furniture') useGeometryStore.getState().rotateFurniture(selection.id, 90)
        return
      }
```

(the `r` branch sits before the tool-key lookup; `r` is not a tool key).

- [ ] **Step 4: Layer** — `FurnitureLayer.tsx`:

```tsx
import React from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { useCatalog } from '../../../services/catalogService'
import { PIXELS_PER_METER, screenToPlan, toScreen } from './canvasTransform'

const UNKNOWN = { name: '?', widthM: 0.5, depthM: 0.5 }

// Footprints in plan space. Screen y points down, so a CCW plan rotation is a CW screen rotation.
export function FurnitureLayer() {
  const furniture = useGeometryStore((s) => s.furniture)
  const moveFurniture = useGeometryStore((s) => s.moveFurniture)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const catalog = useCatalog()
  const editable = tool === 'select'

  return (
    <>
      {furniture.map((f) => {
        const entry = catalog?.byId[f.catalogId] ?? UNKNOWN
        const known = !!catalog?.byId[f.catalogId]
        const w = entry.widthM * PIXELS_PER_METER
        const d = entry.depthM * PIXELS_PER_METER
        const at = toScreen({ x: f.x, y: f.y })
        const selected = selection?.kind === 'furniture' && selection.id === f.id
        return (
          <Group
            key={f.id}
            x={at.x}
            y={at.y}
            rotation={-f.rotationDeg}
            draggable={editable}
            listening={editable}
            onClick={() => select({ kind: 'furniture', id: f.id })}
            onTap={() => select({ kind: 'furniture', id: f.id })}
            onDragEnd={(e) => {
              const p = screenToPlan({ x: e.target.x(), y: e.target.y() })
              moveFurniture(f.id, p.x, p.y)
            }}
          >
            <Rect x={-w / 2} y={-d / 2} width={w} height={d}
                  fill={known ? 'rgba(234, 179, 8, 0.18)' : 'rgba(113, 113, 122, 0.35)'}
                  stroke={selected ? '#ffffff' : known ? '#eab308' : '#71717a'} strokeWidth={selected ? 2 : 1} />
            {/* Front edge: local −y in plan is screen +y at rotation 0. */}
            <Line points={[-w / 2, d / 2, w / 2, d / 2]} stroke={known ? '#eab308' : '#71717a'} strokeWidth={3} listening={false} />
            <Text x={-w / 2} y={-6} width={w} align="center" text={entry.name} fontSize={10} fill="#fde68a" listening={false} />
          </Group>
        )
      })}
    </>
  )
}
```

- [ ] **Step 5: Library and placement** — `FurnitureLibrary.tsx`:

```tsx
import React from 'react'
import { useCatalog } from '../../../services/catalogService'
import { useEditorStore } from '../../../stores/editorStore'
import { ROOM_TYPES } from '../../../lib/roomTypes'

export function FurnitureLibrary() {
  const catalog = useCatalog()
  const pending = useEditorStore((s) => s.pendingCatalogId)
  const setPending = useEditorStore((s) => s.setPendingCatalogId)
  if (!catalog) return <div className="absolute right-4 top-4 z-20 rounded bg-zinc-900 p-3 text-xs text-zinc-400">Loading furniture…</div>
  return (
    <div className="absolute right-4 top-4 z-20 max-h-[70%] w-56 overflow-y-auto rounded-lg border border-zinc-800 bg-[#121215]/95 p-2 text-xs text-zinc-200">
      <div className="mb-1 px-1 text-zinc-400">Pick an item, then click the plan</div>
      {ROOM_TYPES.map(({ type, label }) => (
        <div key={type} className="mb-2">
          <div className="px-1 py-0.5 font-semibold text-zinc-300">{label}</div>
          {catalog.items.filter((i) => i.roomTypes.includes(type)).map((i) => (
            <button key={i.id} onClick={() => setPending(i.id)}
                    className={`block w-full rounded px-2 py-1 text-left ${pending === i.id ? 'bg-yellow-600/30 text-white' : 'hover:bg-zinc-800'}`}>
              {i.name} <span className="text-zinc-500">{i.widthM}×{i.depthM} m</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
```

`CanvasEditor.tsx`: import `FurnitureLayer`, `FurnitureLibrary`; render `<FurnitureLayer />` inside `<Layer>` after `<RoomLayer />` and before `<WallLayer />`; in `onMouseDown` add `else if (p && tool === 'furniture') { const id = useEditorStore.getState().pendingCatalogId; if (id) useGeometryStore.getState().addFurniture({ catalogId: id, x: p.x, y: p.y, rotationDeg: 0 }) }` before the select branch; render `{tool === 'furniture' && <FurnitureLibrary />}` after the Stage; hint text for `'furniture'`: `'Pick furniture, click to place · V then R to rotate'`.

`StudioToolbar.tsx`: add a fifth tool button after Scale: `Sofa` icon from `lucide-react`, label "Furniture", title "Furniture (F)", `toolClass('furniture')`, `setTool('furniture')`.

- [ ] **Step 6: Run** — `npx vitest run && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 7: Commit** — `feat: place, drag, rotate and delete furniture on the 2D plan`.

### Task 7: Room types and Auto-furnish

**Files:** create `src/services/stagingService.ts`, `src/lib/furnish.ts`, `src/components/studio/Canvas2D/RoomPanel.tsx`; modify `RoomLayer.tsx`, `CanvasEditor.tsx`; test `tests/furnish.test.ts`.

**Interfaces:**
- Consumes: `POST /api/staging/suggest` (Task 3), store actions (Task 5), catalog (Task 5).
- Produces: `suggestFurniture(roomPolygon: Point[], roomLabel: string, items: { id; widthM; depthM; againstWall }[], keepClear: [number, number, number][]): Promise<{ item: string; position: [number, number]; rotationDeg: number }[]>`; `autoFurnishRoom(roomId: string, catalog: Catalog): Promise<string | null>` (message or null).

- [ ] **Step 1: Failing tests** — `tests/furnish.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoFurnishRoom } from '../src/lib/furnish'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as stagingService from '../src/services/stagingService'
import { Catalog } from '../src/services/catalogService'

vi.mock('../src/services/stagingService')

const entry = (id: string, againstWall: boolean) =>
  ({ id, name: id, file: null, widthM: 1, depthM: 1, heightM: 1, elevationM: 0, againstWall, roomTypes: ['bedroom' as const], attribution: '' })
const catalog: Catalog = {
  items: [entry('bed_double', true), entry('nightstand', true)],
  autoFurnish: { bedroom: ['bed_double', 'nightstand'], living: [], dining: [], kitchen: [], bathroom: [] },
  byId: {},
}
catalog.byId = Object.fromEntries(catalog.items.map((i) => [i.id, i]))
const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }]

describe('auto-furnish', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(stagingService.suggestFurniture).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, walls: [],
      rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1, points: square }],
      openings: [{ id: 'd1', wallId: 'w', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 },
                 { id: 'n1', wallId: 'w', type: 'Window', position: { x: 0, y: 2 }, widthMeters: 1.2, sillHeightMeters: 0.9, version: 1 }],
      furniture: [{ id: 'old', catalogId: 'sofa', x: 1, y: 1, rotationDeg: 0 }, { id: 'out', catalogId: 'fridge', x: 9, y: 9, rotationDeg: 0 }] })
  })

  it("asks for the room type's items, keeps doors clear, and replaces only this room's furniture", async () => {
    vi.mocked(stagingService.suggestFurniture).mockResolvedValue([{ item: 'bed_double', position: [2, 1.2], rotationDeg: 180 }])

    expect(await autoFurnishRoom('r1', catalog)).toBeNull()

    const [, label, items, keepClear] = vi.mocked(stagingService.suggestFurniture).mock.calls[0]
    expect(label).toBe('Phòng ngủ')
    expect(items.map((i) => i.id)).toEqual(['bed_double', 'nightstand'])
    expect(keepClear).toEqual([[2, 0, 0.9]])                          // doors only, not windows
    expect(useGeometryStore.getState().furniture.map((f) => f.catalogId).sort()).toEqual(['bed_double', 'fridge'])
  })

  it('a room without a type asks the user to choose one first', async () => {
    useGeometryStore.setState({ rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: square }] })
    expect(await autoFurnishRoom('r1', catalog)).toMatch(/type/i)
    expect(stagingService.suggestFurniture).not.toHaveBeenCalled()
  })

  it('a failed request leaves the room as it was', async () => {
    vi.mocked(stagingService.suggestFurniture).mockRejectedValue(new Error('503'))
    expect(await autoFurnishRoom('r1', catalog)).toBeTruthy()
    expect(useGeometryStore.getState().furniture).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** — `src/services/stagingService.ts`:

```ts
import { apiClient } from './api'
import { Point } from './geometryService'

export async function suggestFurniture(
  roomPolygon: Point[], roomLabel: string,
  items: { id: string; widthM: number; depthM: number; againstWall: boolean }[],
  keepClear: [number, number, number][],
): Promise<{ item: string; position: [number, number]; rotationDeg: number }[]> {
  const { data } = await apiClient.post('/staging/suggest', {
    roomPolygon: roomPolygon.map((p) => [p.x, p.y]), roomLabel, items, keepClear,
  })
  return data.items
}
```

`src/lib/furnish.ts`:

```ts
import { useGeometryStore } from '../stores/geometryStore'
import { suggestFurniture } from '../services/stagingService'
import { Catalog } from '../services/catalogService'
import { roomTypeOf } from './roomTypes'

// Furnishes one room from its type's list; replaces only the furniture standing in that room.
export async function autoFurnishRoom(roomId: string, catalog: Catalog): Promise<string | null> {
  const { rooms, openings } = useGeometryStore.getState()
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return 'That room no longer exists.'
  const type = roomTypeOf(room.label)
  if (!type) return 'Choose the room type first.'
  const items = (catalog.autoFurnish[type] ?? []).map((id) => catalog.byId[id]).filter(Boolean)
    .map((e) => ({ id: e.id, widthM: e.widthM, depthM: e.depthM, againstWall: e.againstWall }))
  const keepClear = openings.filter((o) => o.type === 'Door')
    .map((o) => [o.position.x, o.position.y, o.widthMeters] as [number, number, number])
  let placed
  try {
    placed = await suggestFurniture(room.points, room.label, items, keepClear)
  } catch {
    return 'Auto-furnish is unavailable right now. Try again.'
  }
  useGeometryStore.getState().replaceFurnitureInRoom(room.points,
    placed.map((p) => ({ catalogId: p.item, x: p.position[0], y: p.position[1], rotationDeg: p.rotationDeg })))
  return placed.length === 0 ? 'Nothing fitted in this room.' : null
}
```

`RoomPanel.tsx`:

```tsx
import React, { useState } from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useCatalog } from '../../../services/catalogService'
import { labelFor, ROOM_TYPES, roomTypeOf, RoomType } from '../../../lib/roomTypes'
import { autoFurnishRoom } from '../../../lib/furnish'

export function RoomPanel({ roomId }: { roomId: string }) {
  const room = useGeometryStore((s) => s.rooms.find((r) => r.id === roomId))
  const updateRoomLabel = useGeometryStore((s) => s.updateRoomLabel)
  const catalog = useCatalog()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!room) return null
  const type = roomTypeOf(room.label)

  return (
    <div className="absolute right-4 top-4 z-20 w-56 rounded-lg border border-zinc-800 bg-[#121215]/95 p-3 text-xs text-zinc-200">
      <label className="mb-2 block">
        <span className="mb-1 block text-zinc-400">Room type</span>
        <select aria-label="Room type" value={type ?? ''} className="w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1"
                onChange={(e) => e.target.value && updateRoomLabel(room.id, labelFor(e.target.value as RoomType))}>
          <option value="">— choose —</option>
          {ROOM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </label>
      <button disabled={!type || !catalog || busy} className="w-full rounded bg-yellow-600 px-2 py-1 text-white disabled:bg-zinc-700"
              onClick={async () => { setBusy(true); setMessage(await autoFurnishRoom(room.id, catalog!)); setBusy(false) }}>
        {busy ? 'Furnishing…' : 'Auto-furnish'}
      </button>
      {message && <div role="alert" className="mt-2 text-amber-400">{message}</div>}
    </div>
  )
}
```

`RoomLayer.tsx`: read `tool`, `selection`, `select` from `useEditorStore`; on the room `Line` set `listening={tool === 'select'}`, `onClick={() => select({ kind: 'room', id: room.id })}` (and `onTap`), and a brighter stroke when selected (`'rgba(59, 130, 246, 0.9)'`, width 2). `CanvasEditor.tsx`: read `selection`; render `{tool === 'select' && selection?.kind === 'room' && <RoomPanel roomId={selection.id} />}` after the Stage.

- [ ] **Step 4: Run** — `npx vitest run && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 5: Commit** — `feat: room types and auto-furnish from the room panel`.

### Task 8: Furniture in 3D and in the walk

**Files:** create `src/components/studio/Viewer3D/FurnitureModels.tsx`; modify `HouseModel.tsx`, `floorPlan.ts`, `src/lib/walkPhysics.ts`, `src/components/studio/Walk/WalkMode.tsx`; test `tests/furnitureWalk.test.ts`.

**Interfaces:**
- Produces: `furnitureBlockers(furniture: FurnitureItem[], sizeOf: (catalogId: string) => { widthM; depthM; elevationM } | undefined): Blocker[]` in `walkPhysics.ts`; `floorMaterialFor(areaM2, type?: RoomType | null)`; `FurnitureModels()`.

- [ ] **Step 1: Failing tests** — `tests/furnitureWalk.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { furnitureBlockers, stepPlayer, PLAYER_RADIUS_M } from '../src/lib/walkPhysics'
import { floorPatches } from '../src/components/studio/Viewer3D/floorPlan'

const sizes: Record<string, { widthM: number; depthM: number; elevationM: number }> = {
  bed_double: { widthM: 1.6, depthM: 2.0, elevationM: 0 },
  tv: { widthM: 1.4, depthM: 0.1, elevationM: 0.9 },
}
const sizeOf = (id: string) => sizes[id]

describe('furniture in the walk', () => {
  it("a bed blocks the player; walking into its side stops at arm's length", () => {
    const blockers = furnitureBlockers([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 0 }], sizeOf)
    let p = { x: 3, y: 0 }
    for (let i = 0; i < 60; i++) p = stepPlayer(p, { x: -0.07, y: 0 }, blockers)
    expect(p.x).toBeGreaterThanOrEqual(0.8 + PLAYER_RADIUS_M - 1e-6)
  })

  it('wall-mounted items and unknown catalog ids do not block', () => {
    expect(furnitureBlockers([{ id: 't', catalogId: 'tv', x: 0, y: 0, rotationDeg: 0 }], sizeOf)).toHaveLength(0)
    expect(furnitureBlockers([{ id: 'u', catalogId: 'gone', x: 0, y: 0, rotationDeg: 0 }], sizeOf)).toHaveLength(0)
  })

  it('a rotated item blocks along its rotated footprint', () => {
    const blockers = furnitureBlockers([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 90 }], sizeOf)
    let p = { x: 3, y: 0 }
    for (let i = 0; i < 60; i++) p = stepPlayer(p, { x: -0.07, y: 0 }, blockers)
    expect(p.x).toBeGreaterThanOrEqual(1.0 + PLAYER_RADIUS_M - 1e-6)   // depth 2.0 now lies along x
  })
})

describe('floors by room type', () => {
  it('a kitchen is tiled however big it is; an untyped big room is wood', () => {
    const sq = (s: number) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }, { x: 0, y: 0 }]
    const [kitchen, other] = floorPatches([{ id: 'k', label: 'Bếp', version: 1, points: sq(4) },
                                           { id: 'o', label: 'Room 2', version: 1, points: sq(4) }], [])
    expect(kitchen.kind).toBe('tile')
    expect(other.kind).toBe('wood')
  })
})
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Blockers and floors** — `walkPhysics.ts` (import `FurnitureItem` from the service):

```ts
// Furniture standing on the floor blocks like walls do: its footprint's four edges, with no thickness.
const BLOCKING_ELEVATION_M = 0.3
export function furnitureBlockers(
  furniture: FurnitureItem[],
  sizeOf: (catalogId: string) => { widthM: number; depthM: number; elevationM: number } | undefined,
): Blocker[] {
  const blockers: Blocker[] = []
  for (const f of furniture) {
    const size = sizeOf(f.catalogId)
    if (!size || size.elevationM >= BLOCKING_ELEVATION_M) continue
    const a = (f.rotationDeg * Math.PI) / 180
    const [c, s] = [Math.cos(a), Math.sin(a)]
    const corner = (lx: number, ly: number) => ({ x: f.x + lx * c - ly * s, y: f.y + lx * s + ly * c })
    const [hw, hd] = [size.widthM / 2, size.depthM / 2]
    const pts = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)]
    for (let i = 0; i < 4; i++) blockers.push({ a: pts[i], b: pts[(i + 1) % 4], halfWidth: 0 })
  }
  return blockers
}
```

`floorPlan.ts`: import `roomTypeOf, RoomType` from `../../../lib/roomTypes`; `floorMaterialFor(areaM2: number, type: RoomType | null = null)` returns `'tile'` for `'kitchen'` and `'bathroom'`, `'wood'` for other types, and the area rule when `type` is null; `floorPatches` passes `roomTypeOf(r.label)`.

- [ ] **Step 4: 3D models** — `FurnitureModels.tsx`:

```tsx
import React, { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { CatalogEntry, useCatalog } from '../../../services/catalogService'

function Box({ entry }: { entry: CatalogEntry }) {
  return (
    <mesh position={[0, 0, entry.heightM / 2]} castShadow receiveShadow>
      <boxGeometry args={[entry.widthM, entry.depthM, entry.heightM]} />
      <meshStandardMaterial color="#cbbba2" roughness={0.8} />
    </mesh>
  )
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  useEffect(() => { clone.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } }) }, [clone])
  // glTF is Y-up with its front along +Z; +90° about X maps it to plan-up with its front along plan −y.
  return <primitive object={clone} rotation={[Math.PI / 2, 0, 0]} />
}

// Furniture in plan space; items whose catalog entry is gone are skipped.
export function FurnitureModels() {
  const furniture = useGeometryStore((s) => s.furniture)
  const catalog = useCatalog()
  if (!catalog) return null
  return (
    <>
      {furniture.map((f) => {
        const entry = catalog.byId[f.catalogId]
        if (!entry) return null
        return (
          <group key={f.id} position={[f.x, f.y, entry.elevationM]} rotation={[0, 0, (f.rotationDeg * Math.PI) / 180]}>
            {entry.file ? <Suspense fallback={<Box entry={entry} />}><Model url={entry.file} /></Suspense> : <Box entry={entry} />}
          </group>
        )
      })}
    </>
  )
}
```

`HouseModel.tsx`: import and render `<FurnitureModels />` after the window glass.

`WalkMode.tsx` `Player`: `const furniture = useGeometryStore((s) => s.furniture)`, `const catalog = useCatalog()`; `blockers = useMemo(() => [...wallBlockers(walls, openings), ...furnitureBlockers(furniture, (id) => catalog?.byId[id])], [walls, openings, furniture, catalog])`. The spawn is computed once from the initial blockers; acceptable because the catalog usually loads before the walk opens (the 3D pane already requested it).

- [ ] **Step 5: Run** — `npx vitest run && npx tsc --noEmit && npm run build`. Expected: all pass; the production build succeeds.

- [ ] **Step 6: Commit** — `feat: furniture models in 3D and furniture that blocks the walk`.

### Task 9: Whole-stack check

- [ ] **Step 1:** Python, web (+ build), .NET, tools (`node --test`) suites — all green; report failures by name.
- [ ] **Step 2:** `docker compose up -d --build api ai web`, then `bash scripts/smoke-test-full-stack.sh` → PASS. (The API needs the new migration applied; the API applies migrations at startup — confirm the `Furniture` table exists with `docker compose exec -T postgres psql -U p2s -d plan2space -c '\d "Furniture"'`.)
- [ ] **Step 3:** Over HTTP through nginx as a fresh user: save a plan with one room labelled "Phòng ngủ" and two walls; `POST /api/staging/suggest` with the room polygon, the bedroom items from `/furniture/catalog.json` and one keep-clear zone → 200 with placements inside the room; `GET /furniture/catalog.json` and one `/furniture/bed_double.glb` → 200 through nginx. Pace requests (100 per minute per user).
- [ ] **Step 4:** Hand the visual walk to the user (login needs a password): open a plan → select a room → set "Phòng ngủ" → Auto-furnish → bed/nightstand/wardrobe appear in 2D and 3D, facing into the room, clear of the door; F → place a sofa → V, drag, R, Delete; Walk → the bed blocks you; an item facing the wall is noted by id so its `yawOffsetDeg` can be set in `sources.json`.
