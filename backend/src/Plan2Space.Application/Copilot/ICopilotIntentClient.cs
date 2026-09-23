using System.Text.Json;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.Application.Copilot;

// action: "move_wall" | "add_opening" | "resize_room" | "unknown"; Params mirror the ai-service's parse_intent contract.
public record CopilotIntent(string Action, JsonElement Params, string? Reason = null);

// Wraps the ai-service's internal POST /copilot/parse (LLM intent parsing).
public interface ICopilotIntentClient
{
    Task<CopilotIntent> ParseIntentAsync(string message, GeometryDto currentGeometry, CancellationToken ct);
}

public class CopilotUnavailableException : Exception
{
    public CopilotUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

// The parsed intent can't be applied to this plan (unknown element, value out of range…).
public class CopilotRejectedException : Exception
{
    public CopilotRejectedException(string message) : base(message) { }
}
