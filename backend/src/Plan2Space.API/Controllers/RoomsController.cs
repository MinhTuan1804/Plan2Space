using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Plan2Space.API.Middleware;
using Plan2Space.Application.Geometry;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/rooms")]
public class RoomsController : ControllerBase
{
    public const int MaxWalls = 5000;
    private readonly IRoomDerivationClient _rooms;
    public RoomsController(IRoomDerivationClient rooms) => _rooms = rooms;

    public record PointIn(double X, double Y);
    public record WallIn(List<PointIn> Points);
    public record DeriveRequest(List<WallIn> Walls);

    [HttpPost("derive")]
    [EnableRateLimiting(RateLimitPolicies.AiTriggering)]
    public async Task<IActionResult> Derive(DeriveRequest req, CancellationToken ct)
    {
        if (req.Walls is null || req.Walls.Count > MaxWalls || req.Walls.Any(w =>
                w?.Points is null || w.Points.Count < 2 || w.Points.Any(p => p is null || !double.IsFinite(p.X) || !double.IsFinite(p.Y))))
            return BadRequest(new { message = $"walls must be at most {MaxWalls} walls of at least 2 finite points." });
        try
        {
            var rooms = await _rooms.DeriveAsync(
                req.Walls.Select(w => w.Points.Select(p => new[] { p.X, p.Y }).ToList()).ToList(), ct);
            return Ok(new
            {
                rooms = rooms.Select(r => new { points = r.Points.Select(p => new { x = p[0], y = p[1] }), label = r.Label })
            });
        }
        catch (RoomDerivationUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }
}
