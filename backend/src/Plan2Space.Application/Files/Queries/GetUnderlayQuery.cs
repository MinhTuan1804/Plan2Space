using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Queries;

public record UnderlayDto(Guid FileId, double MetresPerPixel, int WidthPx, int HeightPx);

public record GetUnderlayQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<UnderlayDto?>;

public class GetUnderlayHandler : IRequestHandler<GetUnderlayQuery, UnderlayDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    public GetUnderlayHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<UnderlayDto?> Handle(GetUnderlayQuery q, CancellationToken ct)
    {
        if (!await _db.Projects.AnyAsync(p => p.Id == q.ProjectId && p.OwnerId == q.RequestingUserId, ct))
            throw new KeyNotFoundException();

        // Only the latest import can lie under the plan: after a DXF import an older image would mislead.
        var job = await _db.AiJobs.AsNoTracking()
            .Where(j => j.ProjectId == q.ProjectId && j.Status == AiJobStatus.Completed)
            .OrderByDescending(j => j.CompletedAt)
            .FirstOrDefaultAsync(ct);
        if (job?.ResultJson is null)
            return null;

        try
        {
            using var doc = JsonDocument.Parse(job.ResultJson);
            if (!doc.RootElement.TryGetProperty("underlay", out var u))
                return null;
            return new UnderlayDto(job.SourceFileId, u.GetProperty("metresPerPixel").GetDouble(),
                u.GetProperty("widthPx").GetInt32(), u.GetProperty("heightPx").GetInt32());
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            return null;   // a malformed worker result means no underlay, never an error for the user
        }
    }
}
