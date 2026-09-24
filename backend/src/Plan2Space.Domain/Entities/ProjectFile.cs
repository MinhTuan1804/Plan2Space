namespace Plan2Space.Domain.Entities;

public enum FileKind { RasterImage, Pdf, Dxf, Dwg }

public class ProjectFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public string MinioObjectKey { get; set; } = default!;
    public FileKind Kind { get; set; }
    public long SizeBytes { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
