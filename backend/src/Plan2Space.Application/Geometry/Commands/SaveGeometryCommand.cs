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
    List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings) : IRequest<uint>;

public class SaveGeometryHandler : IRequestHandler<SaveGeometryCommand, uint>
{
    private readonly IPlan2SpaceDbContext _db;
    private static readonly GeometryFactory Factory = new();

    public SaveGeometryHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<uint> Handle(SaveGeometryCommand cmd, CancellationToken ct)
    {
        var project = await _db.Projects
            .Include(p => p.Walls).Include(p => p.Rooms).Include(p => p.Openings)
            .FirstOrDefaultAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct)
            ?? throw new KeyNotFoundException();

        // Project-level version: survives saves that leave no geometry rows behind.
        if (project.GeometryVersion != cmd.BaseVersion)
            throw new GeometryConflictException();

        var nextVersion = cmd.BaseVersion + 1;

        var existingWalls = project.Walls.ToDictionary(w => w.Id);
        var keptWalls = new List<Wall>();
        foreach (var w in cmd.Walls)
        {
            if (w.Points.Count < 2)
                throw new GeometryValidationException("A wall needs at least 2 points");
            var line = new LineString(w.Points.Select(p => new Coordinate(p.X, p.Y)).ToArray());
            var wall = w.Id is Guid id && existingWalls.TryGetValue(id, out var found)
                ? found
                : new Wall { Id = w.Id ?? Guid.NewGuid(), ProjectId = project.Id };
            wall.Geometry = line;
            wall.ThicknessMeters = w.ThicknessMeters;
            wall.HeightMeters = w.HeightMeters;
            wall.Version = nextVersion;
            keptWalls.Add(wall);
        }

        var existingRooms = project.Rooms.ToDictionary(r => r.Id);
        var keptRooms = new List<Room>();
        foreach (var r in cmd.Rooms)
        {
            var polygon = BuildRoomPolygon(r.Points);
            var room = r.Id is Guid id && existingRooms.TryGetValue(id, out var found)
                ? found
                : new Room { Id = r.Id ?? Guid.NewGuid(), ProjectId = project.Id };
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
            if (!wallIds.Contains(o.WallId))
                throw new GeometryValidationException($"Opening references unknown wall {o.WallId}");
            if (!Enum.TryParse<OpeningType>(o.Type, ignoreCase: true, out var type))
                throw new GeometryValidationException($"Unknown opening type '{o.Type}'");
            return new Opening
            {
                ProjectId = project.Id,
                WallId = o.WallId,
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
