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
