using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Plan2Space.API.Middleware;
using Plan2Space.Application.Staging;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/staging")]
public class StagingController : ControllerBase
{
    private readonly IStagingClient _staging;
    public StagingController(IStagingClient staging) => _staging = staging;

    public record SuggestRequest(List<List<double>> RoomPolygon, string RoomLabel);

    [HttpPost("suggest")]
    [EnableRateLimiting(RateLimitPolicies.AiTriggering)]
    public async Task<IActionResult> Suggest(SuggestRequest req, CancellationToken ct)
    {
        if (req.RoomPolygon is null || req.RoomPolygon.Count < 3 || req.RoomPolygon.Any(p => p is null || p.Count != 2 || p.Any(v => !double.IsFinite(v))))
            return BadRequest(new { message = "roomPolygon must be at least 3 [x, y] points." });
        try
        {
            var items = await _staging.SuggestAsync(req.RoomPolygon, req.RoomLabel ?? "", ct);
            return Ok(new { items });
        }
        catch (StagingRejectedException ex) { return BadRequest(new { message = ex.Message }); }
        catch (StagingUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message }); }
    }
}
