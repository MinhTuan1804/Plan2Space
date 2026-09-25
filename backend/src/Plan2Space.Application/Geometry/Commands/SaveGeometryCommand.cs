using System.Text.RegularExpressions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Geometry.Commands;

public record PointDto(double X, double Y);
// Id is optional: a client that sends a wall's/room's existing id keeps it stable across saves,
// so openings (which reference WallId) stay attached. Omitted id = new element.
public record WallInput(List<PointDto> Points, double ThicknessMeters, double HeightMeters, Guid? Id = null);
public record RoomInput(List<PointDto> Points, string Label, Guid? Id = null);
public record OpeningInput(Guid WallId, string Type, PointDto Position, double WidthMeters, double SillHeightMeters);
// Absolute plan position; front faces local -y at rotation 0 (CCW degrees).
public record FurnitureInput(string CatalogId, double X, double Y, double RotationDeg, Guid? Id = null);

public class GeometryConflictException : Exception { }

public class GeometryValidationException : Exception
{
    public GeometryValidationException(string message) : base(message) { }
}

public class RoomOverlapException : Exception
{
    public List<(Guid RoomAId, Guid RoomBId)> Overlaps { get; }
    public RoomOverlapException(List<(Guid, Guid)> overlaps)
        : base("Overlapping rooms detected — resolve before saving") => Overlaps = overlaps;
}

public record SaveGeometryCommand(
    Guid ProjectId, Guid RequestingUserId, uint BaseVersion,
    List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings,
    List<FurnitureInput>? Furniture = null) : IRequest<uint>;

public class SaveGeometryHandler : IRequestHandler<SaveGeometryCommand, uint>
{
    public const int MaxFurniture = 2000;
    private static readonly Regex CatalogIdShape = new("^[a-z0-9_-]{1,64}$", RegexOptions.Compiled);
    private readonly IPlan2SpaceDbContext _db;
    private static readonly GeometryFactory Factory = new();

    public SaveGeometryHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<uint> Handle(SaveGeometryCommand cmd, CancellationToken ct)
    {
        var project = await _db.Projects
            .Include(p => p.Walls).Include(p => p.Rooms).Include(p => p.Openings).Include(p => p.Furniture)
            .FirstOrDefaultAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct)
            ?? throw new KeyNotFoundException();

        // Project-level version: survives saves that leave no geometry rows behind.
        if (project.GeometryVersion != cmd.BaseVersion)
            throw new GeometryConflictException();

        var nextVersion = cmd.BaseVersion + 1;

        // A client-supplied id is honoured only if it is this project's element or unused anywhere;
        // an id owned by another project (copied payload, hostile client) or repeated in the request gets
        // a fresh id, and openings follow their wall through wallIdMap.
        var existingWalls = project.Walls.ToDictionary(w => w.Id);
        var takenWallIds = await TakenElsewhereAsync(_db.Walls, cmd.Walls.Select(w => w.Id), existingWalls.Keys, ct);
        var usedWallIds = new HashSet<Guid>();
        var wallIdMap = new Dictionary<Guid, Guid>();
        var keptWalls = new List<Wall>();
        foreach (var w in cmd.Walls)
        {
            if (w.Points.Count < 2)
                throw new GeometryValidationException("A wall needs at least 2 points");
            // !(x > 0) also rejects NaN.
            if (!(w.ThicknessMeters > 0) || !(w.HeightMeters > 0))
                throw new GeometryValidationException("A wall's thickness and height must be greater than zero");
            var line = new LineString(w.Points.Select(p => new Coordinate(p.X, p.Y)).ToArray());
            var wall = w.Id is Guid id && existingWalls.TryGetValue(id, out var found) && usedWallIds.Add(id)
                ? found
                : new Wall { Id = FreshOrRequested(w.Id, takenWallIds, existingWalls.Keys, usedWallIds), ProjectId = project.Id };
            if (w.Id is Guid requested)
                wallIdMap.TryAdd(requested, wall.Id);
            wall.Geometry = line;
            wall.ThicknessMeters = w.ThicknessMeters;
            wall.HeightMeters = w.HeightMeters;
            wall.Version = nextVersion;
            keptWalls.Add(wall);
        }

        var existingRooms = project.Rooms.ToDictionary(r => r.Id);
        var takenRoomIds = await TakenElsewhereAsync(_db.Rooms, cmd.Rooms.Select(r => r.Id), existingRooms.Keys, ct);
        var usedRoomIds = new HashSet<Guid>();
        var keptRooms = new List<Room>();
        foreach (var r in cmd.Rooms)
        {
            var polygon = BuildRoomPolygon(r.Points);
            var room = r.Id is Guid id && existingRooms.TryGetValue(id, out var found) && usedRoomIds.Add(id)
                ? found
                : new Room { Id = FreshOrRequested(r.Id, takenRoomIds, existingRooms.Keys, usedRoomIds), ProjectId = project.Id };
            room.Geometry = polygon;
            room.Label = r.Label;
            room.Version = nextVersion;
            keptRooms.Add(room);
        }

        var overlaps = new RoomOverlapDetector().FindOverlaps(keptRooms);
        if (overlaps.Count > 0)
            throw new RoomOverlapException(overlaps);

        var wallIds = keptWalls.Select(w => w.Id).ToHashSet();
        var newOpenings = cmd.Openings.Select(o =>
        {
            var wallId = wallIdMap.GetValueOrDefault(o.WallId, o.WallId);
            if (!wallIds.Contains(wallId))
                throw new GeometryValidationException($"Opening references unknown wall {o.WallId}");
            if (!Enum.TryParse<OpeningType>(o.Type, ignoreCase: true, out var type))
                throw new GeometryValidationException($"Unknown opening type '{o.Type}'");
            return new Opening
            {
                ProjectId = project.Id,
                WallId = wallId,
                Type = type,
                Position = Factory.CreatePoint(new Coordinate(o.Position.X, o.Position.Y)),
                WidthMeters = o.WidthMeters,
                SillHeightMeters = o.SillHeightMeters,
                Version = nextVersion
            };
        }).ToList();

        var keptRoomIds = keptRooms.Select(r => r.Id).ToHashSet();
        _db.Walls.RemoveRange(project.Walls.Where(w => !wallIds.Contains(w.Id)));
        _db.Rooms.RemoveRange(project.Rooms.Where(r => !keptRoomIds.Contains(r.Id)));
        _db.Openings.RemoveRange(project.Openings);
        _db.Walls.AddRange(keptWalls.Where(w => !existingWalls.ContainsKey(w.Id)));
        _db.Rooms.AddRange(keptRooms.Where(r => !existingRooms.ContainsKey(r.Id)));
        _db.Openings.AddRange(newOpenings);

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
                if (f is null || f.CatalogId is null || !CatalogIdShape.IsMatch(f.CatalogId))
                    throw new GeometryValidationException("A furniture catalogId must be 1-64 characters of a-z, 0-9, _ or -");
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

        project.GeometryVersion = nextVersion;
        project.UpdatedAt = DateTimeOffset.UtcNow;
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another save committed between our read and write.
            throw new GeometryConflictException();
        }
        return nextVersion;
    }

    // Requested ids that are not this project's but already exist in the table (i.e. belong to another project).
    private static async Task<HashSet<Guid>> TakenElsewhereAsync<T>(
        IQueryable<T> table, IEnumerable<Guid?> requested, IEnumerable<Guid> ownIds, CancellationToken ct) where T : class
    {
        var own = ownIds.ToHashSet();
        var candidates = requested.OfType<Guid>().Where(id => !own.Contains(id)).Distinct().ToList();
        if (candidates.Count == 0) return new HashSet<Guid>();
        var ids = await table.Select(e => EF.Property<Guid>(e, "Id")).Where(id => candidates.Contains(id)).ToListAsync(ct);
        return ids.ToHashSet();
    }

    private static Guid FreshOrRequested(Guid? requested, HashSet<Guid> takenElsewhere, IEnumerable<Guid> ownIds, HashSet<Guid> used)
    {
        if (requested is Guid id && !takenElsewhere.Contains(id) && !ownIds.Contains(id) && used.Add(id))
            return id;
        var fresh = Guid.NewGuid();
        used.Add(fresh);
        return fresh;
    }

    private static Polygon BuildRoomPolygon(List<PointDto> points)
    {
        var coords = points.Select(p => new Coordinate(p.X, p.Y)).ToList();
        if (coords.Count > 0 && !coords[0].Equals2D(coords[^1]))
            coords.Add(coords[0].Copy());   // close an unclosed outline
        if (coords.Count < 4)
            throw new GeometryValidationException("A room needs at least 3 distinct points");
        var polygon = Factory.CreatePolygon(coords.ToArray());
        if (!polygon.IsValid)
            throw new GeometryValidationException("Room outline is self-intersecting");
        return polygon;
    }
}
