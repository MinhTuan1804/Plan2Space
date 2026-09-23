using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Geometry.Commands;

namespace Plan2Space.API.Controllers;

// Maps SaveGeometryCommand outcomes to HTTP results; shared by the user-facing and internal (AI worker) endpoints.
public static class GeometrySaveResults
{
    public static async Task<IActionResult> RunAsync(ControllerBase controller, Func<Task<uint>> save)
    {
        try
        {
            var version = await save();
            return controller.Ok(new { version });
        }
        catch (KeyNotFoundException)
        {
            return controller.NotFound();
        }
        catch (GeometryConflictException)
        {
            return controller.Conflict(new { message = "Geometry was modified by another session. Reload and retry." });
        }
        catch (RoomOverlapException ex)
        {
            return controller.UnprocessableEntity(new
            {
                message = ex.Message,
                overlaps = ex.Overlaps.Select(o => new { roomAId = o.RoomAId, roomBId = o.RoomBId })
            });
        }
        catch (GeometryValidationException ex)
        {
            return controller.BadRequest(new { message = ex.Message });
        }
    }
}
