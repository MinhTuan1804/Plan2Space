using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Files.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/files")]
public class FilesController : ControllerBase
{
    private readonly IMediator _mediator;
    public FilesController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpPost]
    [RequestSizeLimit(UploadProjectFileHandler.MaxBytes + 1024 * 1024)]   // + multipart overhead
    [RequestFormLimits(MultipartBodyLengthLimit = UploadProjectFileHandler.MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> Upload(Guid projectId, IFormFile file)
    {
        try
        {
            var dto = await _mediator.Send(new UploadProjectFileCommand(
                projectId, CurrentUserId, file.FileName, file.Length, file.OpenReadStream));
            return Created($"/api/projects/{projectId}/files/{dto.FileId}", dto);
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (FileValidationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
