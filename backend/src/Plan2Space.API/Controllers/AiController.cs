using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Ai.Commands;
using Plan2Space.Application.Ai.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly IMediator _mediator;
    public AiController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record VectorizeRequest(Guid ProjectId, Guid FileId);

    [HttpPost("vectorize")]
    public async Task<IActionResult> Vectorize(VectorizeRequest req)
    {
        try
        {
            var jobId = await _mediator.Send(new EnqueueVectorizeJobCommand(req.ProjectId, req.FileId, CurrentUserId));
            return Accepted(new { jobId });
        }
        catch (KeyNotFoundException) { return NotFound(); }
    }

    [HttpGet("job/{id:guid}/status")]
    public async Task<IActionResult> Status(Guid id)
    {
        var dto = await _mediator.Send(new GetJobStatusQuery(id, CurrentUserId));
        return dto is null ? NotFound() : Ok(new { status = dto.Status, progressPercent = dto.ProgressPercent });
    }
}
