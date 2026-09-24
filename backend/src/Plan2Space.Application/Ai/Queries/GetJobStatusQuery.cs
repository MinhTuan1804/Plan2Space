using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Ai.Queries;

public record JobStatusDto(string Status, int ProgressPercent, string? Error = null);
public record GetJobStatusQuery(Guid JobId, Guid RequestingUserId) : IRequest<JobStatusDto?>;

public class GetJobStatusHandler : IRequestHandler<GetJobStatusQuery, JobStatusDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IJobProgressReader _progress;
    private readonly AiJobOptions _options;

    public GetJobStatusHandler(IPlan2SpaceDbContext db, IJobProgressReader progress, AiJobOptions options)
    { _db = db; _progress = progress; _options = options; }

    public async Task<JobStatusDto?> Handle(GetJobStatusQuery q, CancellationToken ct)
    {
        var job = await _db.AiJobs.AsNoTracking()
            .Where(j => j.Id == q.JobId && j.Project.OwnerId == q.RequestingUserId)
            .Select(j => new { j.Status, j.ProgressPercent, j.ErrorMessage, j.CreatedAt })
            .FirstOrDefaultAsync(ct);
        if (job is null) return null;

        return await JobStatusResolver.ResolveAsync(q.JobId, job.Status, job.ProgressPercent, job.ErrorMessage,
            job.CreatedAt, _progress, _options, DateTimeOffset.UtcNow);
    }
}
