using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Ai.Commands;

public record EnqueueVectorizeJobCommand(Guid ProjectId, Guid FileId, Guid RequestingUserId) : IRequest<Guid>;

public class EnqueueVectorizeJobHandler : IRequestHandler<EnqueueVectorizeJobCommand, Guid>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IJobPublisher _publisher;
    public EnqueueVectorizeJobHandler(IPlan2SpaceDbContext db, IJobPublisher publisher) { _db = db; _publisher = publisher; }

    public async Task<Guid> Handle(EnqueueVectorizeJobCommand cmd, CancellationToken ct)
    {
        var file = await _db.ProjectFiles.FirstOrDefaultAsync(f =>
            f.Id == cmd.FileId && f.ProjectId == cmd.ProjectId && f.Project.OwnerId == cmd.RequestingUserId, ct)
            ?? throw new KeyNotFoundException();

        var job = new AiJob { ProjectId = cmd.ProjectId, SourceFileId = cmd.FileId, Status = AiJobStatus.Queued };
        _db.AiJobs.Add(job);
        await _db.SaveChangesAsync(ct);

        try
        {
            await _publisher.PublishVectorizeJobAsync(job.Id, cmd.ProjectId, file.MinioObjectKey, ct);
        }
        catch (Exception ex)
        {
            // Never leave a job "Queued" that no worker will ever receive.
            job.Status = AiJobStatus.Failed;
            job.ErrorMessage = $"Could not enqueue job: {ex.Message}";
            await _db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        return job.Id;
    }
}
