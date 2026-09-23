using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Ai;
using Plan2Space.Application.Common;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private const int MaxRows = 500;
    private readonly IPlan2SpaceDbContext _db;
    private readonly IJobProgressReader _progress;
    public AdminController(IPlan2SpaceDbContext db, IJobProgressReader progress) { _db = db; _progress = progress; }

    [HttpGet("users")]
    public async Task<IActionResult> Users() => Ok(await _db.Users.AsNoTracking()
        .OrderByDescending(u => u.CreatedAt).Take(MaxRows)
        .Select(u => new { u.Id, u.Email, u.Role, u.CreatedAt, ProjectCount = u.Projects.Count })
        .ToListAsync());

    [HttpGet("projects")]
    public async Task<IActionResult> Projects() => Ok(await _db.Projects.AsNoTracking()
        .OrderByDescending(p => p.UpdatedAt).Take(MaxRows)
        .Select(p => new { p.Id, p.Name, p.OwnerId, OwnerEmail = p.Owner.Email, p.CreatedAt, p.UpdatedAt, p.GeometryVersion })
        .ToListAsync());

    [HttpGet("jobs")]
    public async Task<IActionResult> Jobs()
    {
        var jobs = await _db.AiJobs.AsNoTracking()
            .OrderByDescending(j => j.CreatedAt).Take(MaxRows)
            .Select(j => new { j.Id, j.ProjectId, j.Status, j.ProgressPercent, j.ErrorMessage, j.CreatedAt })
            .ToListAsync();

        // Workers report live state to Redis; the DB row alone would show every job as "Queued" forever.
        var rows = new List<object>(jobs.Count);
        foreach (var j in jobs)
        {
            var live = await _progress.GetCurrentStateAsync(j.Id);
            rows.Add(new
            {
                j.Id,
                j.ProjectId,
                Status = live?.Status ?? j.Status.ToString(),
                ProgressPercent = live?.Percent ?? j.ProgressPercent,
                Error = await _progress.GetErrorAsync(j.Id) ?? j.ErrorMessage,
                j.CreatedAt
            });
        }
        return Ok(rows);
    }
}
