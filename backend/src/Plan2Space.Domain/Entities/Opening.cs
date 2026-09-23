using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public enum OpeningType { Door, Window }

public class Opening
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Guid WallId { get; set; }
    public OpeningType Type { get; set; }
    public Point Position { get; set; } = default!;   // point on the wall centerline
    public double WidthMeters { get; set; }
    public double SillHeightMeters { get; set; }       // 0 for doors
    public uint Version { get; set; } = 1;
}
