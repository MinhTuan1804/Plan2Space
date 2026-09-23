using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public class Wall
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public LineString Geometry { get; set; } = default!;   // centerline, project-space meters
    public double ThicknessMeters { get; set; }
    public double HeightMeters { get; set; }
    public uint Version { get; set; } = 1;                 // optimistic concurrency token
}
