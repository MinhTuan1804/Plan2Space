using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Plan2Space.API.Security;
using Plan2Space.Application.Common;
using Plan2Space.Application.Geometry.Commands;

namespace Plan2Space.API.Controllers;

// Service-to-service endpoints for the AI worker (Task 12). Not proxied by nginx (only /api/ and /ws/ are);
// authenticated by the shared X-Internal-Token. The worker acts on behalf of the project's owner.
[ApiController]
[AllowAnonymous]
[InternalServiceToken]
[Route("internal/projects/{projectId:guid}/geometry")]
public class InternalGeometryController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IPlan2SpaceDbContext _db;
    public InternalGeometryController(IMediator mediator, IPlan2SpaceDbContext db) { _mediator = mediator; _db = db; }

    [HttpGet("version")]
    public async Task<IActionResult> Version(Guid projectId)
    {
        var project = await _db.Projects.AsNoTracking()
            .Where(p => p.Id == projectId).Select(p => new { p.GeometryVersion }).FirstOrDefaultAsync();
        return project is null ? NotFound() : Ok(new { version = project.GeometryVersion });
    }

    [HttpPut]
    public async Task<IActionResult> Save(Guid projectId, GeometryController.SaveRequest req)
    {
        var owner = await _db.Projects.AsNoTracking()
            .Where(p => p.Id == projectId).Select(p => (Guid?)p.OwnerId).FirstOrDefaultAsync();
        if (owner is null) return NotFound();
        return await GeometrySaveResults.RunAsync(this, () => _mediator.Send(new SaveGeometryCommand(
            projectId, owner.Value, req.BaseVersion, req.Walls, req.Rooms, req.Openings)));
    }
}
