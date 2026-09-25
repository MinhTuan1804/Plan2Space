using System.Text.RegularExpressions;
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

    public record SuggestRequest(List<List<double>> RoomPolygon, string RoomLabel,
        List<StagingRequestItem>? Items = null, List<List<double>>? KeepClear = null);
    private static readonly Regex ItemId = new("^[a-z0-9_-]{1,64}$", RegexOptions.Compiled);

    [HttpPost("suggest")]
    [EnableRateLimiting(RateLimitPolicies.AiTriggering)]
    public async Task<IActionResult> Suggest(SuggestRequest req, CancellationToken ct)
    {
        if (req.RoomPolygon is null || req.RoomPolygon.Count < 3 || req.RoomPolygon.Any(p => p is null || p.Count != 2 || p.Any(v => !double.IsFinite(v))))
            return BadRequest(new { message = "roomPolygon must be at least 3 [x, y] points." });
        if (req.Items is { Count: > 50 } || req.Items?.Any(i => i is null || i.Id is null || !ItemId.IsMatch(i.Id)
                || !(i.WidthM > 0) || !(i.DepthM > 0) || !double.IsFinite(i.WidthM) || !double.IsFinite(i.DepthM)) == true)
            return BadRequest(new { message = "items must be at most 50 entries with an id and positive sizes." });
        if (req.KeepClear?.Any(z => z is null || z.Count != 3 || z.Any(v => !double.IsFinite(v)) || !(z[2] > 0)) == true)
            return BadRequest(new { message = "keepClear entries must be [x, y, radius] with a positive radius." });
        try
        {
            var items = await _staging.SuggestAsync(req.RoomPolygon, req.RoomLabel ?? "", req.Items, req.KeepClear, ct);
            return Ok(new { items });
        }
        catch (StagingRejectedException ex) { return BadRequest(new { message = ex.Message }); }
        catch (StagingUnavailableException ex) { return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message }); }
    }
}
