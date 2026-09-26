using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public class Room
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Polygon Geometry { get; set; } = default!;
    public string Label { get; set; } = "Room";
    public string? WallColor { get; set; }          // #RRGGBB paint of the walls' faces inside this room; null = default
    public uint Version { get; set; } = 1;
}
