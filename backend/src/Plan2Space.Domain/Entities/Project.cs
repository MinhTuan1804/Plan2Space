namespace Plan2Space.Domain.Entities;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = default!;
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<ProjectFile> Files { get; set; } = new List<ProjectFile>();
    public ICollection<Wall> Walls { get; set; } = new List<Wall>();
    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<Opening> Openings { get; set; } = new List<Opening>();
}
