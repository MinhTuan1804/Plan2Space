using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Export;
using Plan2Space.Application.Export.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/export")]
public class ExportController : ControllerBase
{
    private readonly IMediator _mediator;
    public ExportController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpPost("{projectId:guid}")]
    public async Task<IActionResult> Export(Guid projectId, [FromQuery] string format, CancellationToken ct)
    {
        format = (format ?? "").ToLowerInvariant();
        if (!ExportFormats.Mesh.ContainsKey(format))
            return BadRequest(new { message = $"Unsupported format '{format}'. Use one of: {string.Join(", ", ExportFormats.Mesh.Keys)}." });
        try
        {
            var file = await _mediator.Send(new RequestExportCommand(projectId, CurrentUserId, format), ct);
            return File(file.Content, file.ContentType, file.FileName);
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (ExportRejectedException ex) { return UnprocessableEntity(new { message = ex.Message }); }
        catch (ExportUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message }); }
    }
}
