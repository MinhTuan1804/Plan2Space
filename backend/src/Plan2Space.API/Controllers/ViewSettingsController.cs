using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Projects.ViewSettings;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/view-settings")]
public class ViewSettingsController : ControllerBase
{
    private readonly IMediator _mediator;
    public ViewSettingsController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpGet]
    public async Task<IActionResult> Get(Guid projectId)
    {
        var dto = await _mediator.Send(new GetViewSettingsQuery(projectId, CurrentUserId));
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpPut]
    public async Task<IActionResult> Save(Guid projectId, ViewSettingsDto settings)
    {
        try
        {
            return await _mediator.Send(new SaveViewSettingsCommand(projectId, CurrentUserId, settings)) ? NoContent() : NotFound();
        }
        catch (ViewSettingsValidationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
