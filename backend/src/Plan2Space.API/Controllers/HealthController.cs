using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.API.Controllers;

// Readiness probe for the compose healthcheck and the full-stack smoke test.
[ApiController]
[AllowAnonymous]
[Route("api/health")]
public class HealthController : ControllerBase
{
    private readonly Plan2SpaceDbContext _db;
    public HealthController(Plan2SpaceDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var databaseOk = await _db.Database.CanConnectAsync(ct);
        return databaseOk
            ? Ok(new { status = "ok", database = "ok" })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "degraded", database = "unreachable" });
    }
}
