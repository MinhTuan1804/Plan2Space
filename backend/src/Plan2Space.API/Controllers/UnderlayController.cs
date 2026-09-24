using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Files.Commands;
using Plan2Space.Application.Files.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/underlay")]
public class UnderlayController : ControllerBase
{
    private readonly IMediator _mediator;
    public UnderlayController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpGet]
    public async Task<IActionResult> Get(Guid projectId, CancellationToken ct)
    {
        try
        {
            var underlay = await _mediator.Send(new GetUnderlayQuery(projectId, CurrentUserId), ct);
            return underlay is null ? NoContent() : Ok(underlay);
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    public record ScaleRequest(double MetresPerPixel);

    [HttpPut]
    public async Task<IActionResult> Put(Guid projectId, ScaleRequest req, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new SetUnderlayScaleCommand(projectId, CurrentUserId, req.MetresPerPixel), ct);
            return NoContent();
        }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        catch (KeyNotFoundException) { return NotFound(); }
    }
}
