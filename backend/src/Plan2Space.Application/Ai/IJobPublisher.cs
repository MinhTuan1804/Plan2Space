namespace Plan2Space.Application.Ai;

public interface IJobPublisher
{
    Task PublishVectorizeJobAsync(Guid jobId, Guid projectId, string fileObjectKey, CancellationToken ct);
}
