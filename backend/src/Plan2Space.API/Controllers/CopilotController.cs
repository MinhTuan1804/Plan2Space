using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Plan2Space.API.Middleware;
using Plan2Space.Application.Copilot;
using Plan2Space.Application.Copilot.Commands;
using Plan2Space.Application.Geometry.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/copilot")]
public class CopilotController : ControllerBase
{
    private readonly IMediator _mediator;
    public CopilotController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record MessageRequest(Guid ProjectId, string Message);

    [HttpPost("message")]
    [EnableRateLimiting(RateLimitPolicies.AiTriggering)]
    public async Task<IActionResult> Message(MessageRequest req)
    {
        try
        {
            var result = await _mediator.Send(new InterpretCopilotMessageCommand(req.ProjectId, CurrentUserId, req.Message));
            return Ok(new { action = result.Action, @params = result.Params, appliedVersion = result.AppliedVersion, message = result.Message });
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (CopilotRejectedException ex) { return UnprocessableEntity(new { message = ex.Message }); }
        catch (CopilotUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message }); }
        catch (GeometryConflictException) { return Conflict(new { message = "The plan changed while the co-pilot was working. Reload and try again." }); }
        catch (RoomOverlapException ex) { return UnprocessableEntity(new { message = $"That edit would make rooms overlap. {ex.Message}" }); }
        catch (GeometryValidationException ex) { return UnprocessableEntity(new { message = ex.Message }); }
    }
}
