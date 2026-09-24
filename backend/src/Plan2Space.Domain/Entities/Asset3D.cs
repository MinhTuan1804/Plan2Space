namespace Plan2Space.Domain.Entities;

public class Asset3D
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public string Format { get; set; } = default!;   // "gltf" | "obj" | "ifc" | "pdf"
    public string MinioObjectKey { get; set; } = default!;
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;
}
