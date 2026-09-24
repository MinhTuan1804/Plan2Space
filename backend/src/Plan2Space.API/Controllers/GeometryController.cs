using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Geometry.Commands;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/geometry")]
public class GeometryController : ControllerBase
{
    private readonly IMediator _mediator;
    public GeometryController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record SaveRequest(uint BaseVersion, List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings);

    [HttpGet]
    public async Task<IActionResult> Get(Guid projectId)
    {
        var dto = await _mediator.Send(new GetGeometryQuery(projectId, CurrentUserId));
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpPut]
    public Task<IActionResult> Save(Guid projectId, SaveRequest req) =>
        GeometrySaveResults.RunAsync(this, () => _mediator.Send(new SaveGeometryCommand(
            projectId, CurrentUserId, req.BaseVersion, req.Walls, req.Rooms, req.Openings)));
}
