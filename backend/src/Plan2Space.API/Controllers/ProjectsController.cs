using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Projects.Commands;
using Plan2Space.Application.Projects.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly IMediator _mediator;
    public ProjectsController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record CreateProjectRequest(string Name);

    [HttpPost]
    public async Task<IActionResult> Create(CreateProjectRequest req)
    {
        var id = await _mediator.Send(new CreateProjectCommand(CurrentUserId, req.Name));
        var dto = await _mediator.Send(new GetProjectByIdQuery(id, CurrentUserId));
        return Created($"/api/projects/{id}", dto);
    }

    [HttpGet]
    public async Task<IActionResult> List() => Ok(await _mediator.Send(new ListProjectsQuery(CurrentUserId)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var dto = await _mediator.Send(new GetProjectByIdQuery(id, CurrentUserId));
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        await _mediator.Send(new DeleteProjectCommand(id, CurrentUserId)) ? NoContent() : NotFound();
}
