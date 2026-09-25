using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Geometry.Queries;

public record GeometryPointDto(double X, double Y);
public record WallDto(Guid Id, List<GeometryPointDto> Points, double ThicknessMeters, double HeightMeters, uint Version);
public record RoomDto(Guid Id, List<GeometryPointDto> Points, string Label, uint Version);
public record OpeningDto(Guid Id, Guid WallId, string Type, GeometryPointDto Position, double WidthMeters, double SillHeightMeters, uint Version, bool SwingFlipped = false);
public record FurnitureDto(Guid Id, string CatalogId, double X, double Y, double RotationDeg);
// Version = the project's geometry version; clients send it back as BaseVersion on the next save.
public record GeometryDto(List<WallDto> Walls, List<RoomDto> Rooms, List<OpeningDto> Openings, List<FurnitureDto> Furniture, uint Version);

public record GetGeometryQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<GeometryDto?>;

public class GetGeometryHandler : IRequestHandler<GetGeometryQuery, GeometryDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    public GetGeometryHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<GeometryDto?> Handle(GetGeometryQuery q, CancellationToken ct)
    {
        var project = await _db.Projects.AsNoTracking()
            .Include(p => p.Walls).Include(p => p.Rooms).Include(p => p.Openings).Include(p => p.Furniture)
            .FirstOrDefaultAsync(p => p.Id == q.ProjectId && p.OwnerId == q.RequestingUserId, ct);
        if (project is null) return null;

        return new GeometryDto(
            project.Walls.Select(w => new WallDto(w.Id,
                w.Geometry.Coordinates.Select(c => new GeometryPointDto(c.X, c.Y)).ToList(),
                w.ThicknessMeters, w.HeightMeters, w.Version)).ToList(),
            project.Rooms.Select(r => new RoomDto(r.Id,
                r.Geometry.Coordinates.Select(c => new GeometryPointDto(c.X, c.Y)).ToList(),
                r.Label, r.Version)).ToList(),
            project.Openings.Select(o => new OpeningDto(o.Id, o.WallId, o.Type.ToString(),
                new GeometryPointDto(o.Position.X, o.Position.Y), o.WidthMeters, o.SillHeightMeters, o.Version, o.SwingFlipped)).ToList(),
            project.Furniture.Select(f => new FurnitureDto(f.Id, f.CatalogId, f.X, f.Y, f.RotationDeg)).ToList(),
            project.GeometryVersion);
    }
}
