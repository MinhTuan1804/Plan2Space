using System.Text.Json;
using MediatR;
using Plan2Space.Application.Geometry.Commands;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.Application.Copilot.Commands;

public record CopilotResult(string Action, JsonElement Params, uint? AppliedVersion, string Message);
public record InterpretCopilotMessageCommand(Guid ProjectId, Guid RequestingUserId, string Message) : IRequest<CopilotResult>;

public class InterpretCopilotMessageHandler : IRequestHandler<InterpretCopilotMessageCommand, CopilotResult>
{
    private const double MaxMoveMeters = 50;
    private const double MinScale = 0.25, MaxScale = 4;
    private const double MinOpeningWidth = 0.3, MaxOpeningWidth = 5, DefaultOpeningWidth = 0.9;
    private const double WindowSillHeight = 0.9;

    private readonly ICopilotIntentClient _intentClient;
    private readonly IMediator _mediator;

    public InterpretCopilotMessageHandler(ICopilotIntentClient intentClient, IMediator mediator)
    { _intentClient = intentClient; _mediator = mediator; }

    public async Task<CopilotResult> Handle(InterpretCopilotMessageCommand cmd, CancellationToken ct)
    {
        var geometry = await _mediator.Send(new GetGeometryQuery(cmd.ProjectId, cmd.RequestingUserId), ct)
            ?? throw new KeyNotFoundException();

        var intent = await _intentClient.ParseIntentAsync(cmd.Message, geometry, ct);

        // Start from the full current plan (ids kept) so an edit never drops rooms/openings.
        var walls = geometry.Walls.Select(w => new WallInput(Points(w.Points), w.ThicknessMeters, w.HeightMeters, w.Id)).ToList();
        var rooms = geometry.Rooms.Select(r => new RoomInput(Points(r.Points), r.Label, r.Id)).ToList();
        var openings = geometry.Openings.Select(o => new OpeningInput(
            o.WallId, o.Type, new PointDto(o.Position.X, o.Position.Y), o.WidthMeters, o.SillHeightMeters)).ToList();

        string summary;
        switch (intent.Action)
        {
            case "move_wall":
            {
                var wallId = RequireId(intent.Params, "wall_id", walls.Select(w => w.Id!.Value), "wall");
                var dx = RequireNumber(intent.Params, "dx", -MaxMoveMeters, MaxMoveMeters);
                var dy = RequireNumber(intent.Params, "dy", -MaxMoveMeters, MaxMoveMeters);
                walls = walls.Select(w => w.Id == wallId
                    ? w with { Points = w.Points.Select(p => new PointDto(p.X + dx, p.Y + dy)).ToList() }
                    : w).ToList();
                // Doors/windows sit on the wall's centreline, so they move with it.
                openings = openings.Select(o => o.WallId == wallId
                    ? o with { Position = new PointDto(o.Position.X + dx, o.Position.Y + dy) }
                    : o).ToList();
                summary = $"Moved the wall by ({dx:0.##} m, {dy:0.##} m).";
                break;
            }
            case "add_opening":
            {
                var wallId = RequireId(intent.Params, "wall_id", walls.Select(w => w.Id!.Value), "wall");
                var wall = walls.Single(w => w.Id == wallId);
                var type = RequireString(intent.Params, "type").ToLowerInvariant();
                if (type is not ("door" or "window"))
                    throw new CopilotRejectedException($"Openings must be a door or a window, not '{type}'.");
                var offset = RequireNumber(intent.Params, "offset_m", 0, PolylineLength(wall.Points));
                var width = OptionalNumber(intent.Params, "width_m", MinOpeningWidth, MaxOpeningWidth, DefaultOpeningWidth);
                openings.Add(new OpeningInput(wallId, type == "door" ? "Door" : "Window", PointAlong(wall.Points, offset),
                    width, type == "door" ? 0 : WindowSillHeight));
                summary = $"Added a {width:0.##} m {type} {offset:0.##} m along the wall.";
                break;
            }
            case "resize_room":
            {
                var roomId = RequireId(intent.Params, "room_id", rooms.Select(r => r.Id!.Value), "room");
                var scale = RequireNumber(intent.Params, "scale", MinScale, MaxScale);
                rooms = rooms.Select(r => r.Id == roomId ? r with { Points = ScaleAboutCentre(r.Points, scale) } : r).ToList();
                summary = $"Scaled the room by {scale:0.##}×.";
                break;
            }
            default:
                return new CopilotResult("unknown", intent.Params, null, intent.Reason
                    ?? "I couldn't turn that into an edit. Try e.g. \"move the kitchen wall 0.5 m left\", \"add a door to …\" or \"make the bedroom 20% bigger\".");
        }

        // Same concurrency-safe path as manual edits (Task 5): conflicts/overlaps surface as usual.
        var version = await _mediator.Send(new SaveGeometryCommand(
            cmd.ProjectId, cmd.RequestingUserId, geometry.Version, walls, rooms, openings), ct);
        return new CopilotResult(intent.Action, intent.Params, version, summary);
    }

    private static List<PointDto> Points(IEnumerable<GeometryPointDto> points) => points.Select(p => new PointDto(p.X, p.Y)).ToList();

    private static Guid RequireId(JsonElement p, string name, IEnumerable<Guid> known, string kind)
    {
        if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            && Guid.TryParse(v.GetString(), out var id) && known.Contains(id))
            return id;
        throw new CopilotRejectedException($"The co-pilot referred to a {kind} that doesn't exist in this plan.");
    }

    private static string RequireString(JsonElement p, string name) =>
        p.ValueKind == JsonValueKind.Object && p.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()!
            : throw new CopilotRejectedException($"Missing '{name}' in the co-pilot's edit.");

    private static double RequireNumber(JsonElement p, string name, double min, double max) =>
        OptionalNumber(p, name, min, max, null) ?? throw new CopilotRejectedException($"Missing '{name}' in the co-pilot's edit.");

    private static double? OptionalNumber(JsonElement p, string name, double min, double max, double? fallback)
    {
        if (p.ValueKind != JsonValueKind.Object || !p.TryGetProperty(name, out var v) || v.ValueKind == JsonValueKind.Null)
            return fallback;
        if (v.ValueKind != JsonValueKind.Number || !double.IsFinite(v.GetDouble()))
            throw new CopilotRejectedException($"'{name}' must be a number.");
        var value = v.GetDouble();
        if (value < min || value > max)
            throw new CopilotRejectedException($"'{name}' = {value} is outside the allowed range [{min}, {max}].");
        return value;
    }

    private static double OptionalNumber(JsonElement p, string name, double min, double max, double fallback) =>
        OptionalNumber(p, name, min, max, (double?)fallback)!.Value;

    private static double PolylineLength(List<PointDto> pts) =>
        pts.Zip(pts.Skip(1), (a, b) => Math.Sqrt(Math.Pow(b.X - a.X, 2) + Math.Pow(b.Y - a.Y, 2))).Sum();

    private static PointDto PointAlong(List<PointDto> pts, double offset)
    {
        foreach (var (a, b) in pts.Zip(pts.Skip(1)))
        {
            var length = Math.Sqrt(Math.Pow(b.X - a.X, 2) + Math.Pow(b.Y - a.Y, 2));
            if (offset <= length && length > 0)
                return new PointDto(a.X + (b.X - a.X) * offset / length, a.Y + (b.Y - a.Y) * offset / length);
            offset -= length;
        }
        return pts[^1];
    }

    private static List<PointDto> ScaleAboutCentre(List<PointDto> pts, double scale)
    {
        var closed = pts.Count > 1 && pts[0] == pts[^1];
        var distinct = closed ? pts.Take(pts.Count - 1).ToList() : pts;
        var cx = distinct.Average(p => p.X);
        var cy = distinct.Average(p => p.Y);
        return pts.Select(p => new PointDto(cx + (p.X - cx) * scale, cy + (p.Y - cy) * scale)).ToList();
    }
}
