using System.Text.Json.Nodes;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Commands;

// The user measured a known length on the plan: the import's pixel-to-metre mapping was wrong by that factor.
// The correction is written into the result of the import it belongs to, so a later import of another
// image never inherits it.
public record SetUnderlayScaleCommand(Guid ProjectId, Guid RequestingUserId, double MetresPerPixel) : IRequest;

public class SetUnderlayScaleHandler : IRequestHandler<SetUnderlayScaleCommand>
{
    private readonly IPlan2SpaceDbContext _db;
    public SetUnderlayScaleHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task Handle(SetUnderlayScaleCommand cmd, CancellationToken ct)
    {
        if (!double.IsFinite(cmd.MetresPerPixel) || cmd.MetresPerPixel <= 0)
            throw new ArgumentException("metresPerPixel must be a positive number.");
        if (!await _db.Projects.AnyAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct))
            throw new KeyNotFoundException();

        var job = await _db.AiJobs
            .Where(j => j.ProjectId == cmd.ProjectId && j.Status == AiJobStatus.Completed)
            .OrderByDescending(j => j.CompletedAt)
            .FirstOrDefaultAsync(ct);
        var result = job?.ResultJson is null ? null : JsonNode.Parse(job.ResultJson) as JsonObject;
        if (result?["underlay"] is not JsonObject underlay)
            throw new KeyNotFoundException();

        underlay["metresPerPixel"] = cmd.MetresPerPixel;
        job!.ResultJson = result.ToJsonString();
        await _db.SaveChangesAsync(ct);
    }
}
