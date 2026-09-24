using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Plan2Space.API.Security;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.API.Controllers;

// The AI worker persists each job's final state here so it survives a Redis restart (service token, not proxied by nginx).
[ApiController]
[AllowAnonymous]
[InternalServiceToken]
[Route("internal/ai/jobs/{jobId:guid}/state")]
public class InternalJobsController : ControllerBase
{
    private readonly IPlan2SpaceDbContext _db;
    public InternalJobsController(IPlan2SpaceDbContext db) => _db = db;

    public record JobStateRequest(string Status, int ProgressPercent, string? Error);

    [HttpPut]
    public async Task<IActionResult> Put(Guid jobId, JobStateRequest req, CancellationToken ct)
    {
        if (!Enum.TryParse<AiJobStatus>(req.Status, ignoreCase: true, out var status))
            return BadRequest(new { message = $"Unknown job status '{req.Status}'" });
        var job = await _db.AiJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null) return NotFound();

        job.Status = status;
        job.ProgressPercent = Math.Clamp(req.ProgressPercent, 0, 100);
        job.ErrorMessage = req.Error?[..Math.Min(req.Error.Length, 1000)];
        if (status is AiJobStatus.Completed or AiJobStatus.Failed)
            job.CompletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
