namespace Plan2Space.Domain.Entities;

public enum AiJobStatus { Queued, Running, Completed, Failed }

public class AiJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Guid SourceFileId { get; set; }
    public AiJobStatus Status { get; set; } = AiJobStatus.Queued;
    public int ProgressPercent { get; set; }
    public string? ResultJson { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
