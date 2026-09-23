using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Ai.Queries;

public record JobStatusDto(string Status, int ProgressPercent);
public record GetJobStatusQuery(Guid JobId, Guid RequestingUserId) : IRequest<JobStatusDto?>;

public class GetJobStatusHandler : IRequestHandler<GetJobStatusQuery, JobStatusDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IJobProgressReader _progress;
    public GetJobStatusHandler(IPlan2SpaceDbContext db, IJobProgressReader progress) { _db = db; _progress = progress; }

    public async Task<JobStatusDto?> Handle(GetJobStatusQuery q, CancellationToken ct)
    {
        var job = await _db.AiJobs.AsNoTracking()
            .Where(j => j.Id == q.JobId && j.Project.OwnerId == q.RequestingUserId)
            .Select(j => new { j.Status, j.ProgressPercent })
            .FirstOrDefaultAsync(ct);
        if (job is null) return null;

        // Workers report live progress to Redis; the DB row is the fallback before the first report.
        var live = await _progress.GetCurrentStateAsync(q.JobId);
        return live is { } s
            ? new JobStatusDto(s.Status, s.Percent)
            : new JobStatusDto(job.Status.ToString(), job.ProgressPercent);
    }
}
