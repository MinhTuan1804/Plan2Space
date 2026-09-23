using System.Net.Http.Json;
using System.Text.Json;
using Plan2Space.Application.Copilot;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.Infrastructure.Copilot;

// Calls the ai-service's internal POST /copilot/parse. The HttpClient's BaseAddress and X-Internal-Token
// header are configured at registration (Program.cs).
public class CopilotIntentHttpClient : ICopilotIntentClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    public CopilotIntentHttpClient(HttpClient http) => _http = http;

    public async Task<CopilotIntent> ParseIntentAsync(string message, GeometryDto currentGeometry, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("copilot/parse", new { message, geometry = currentGeometry }, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new CopilotUnavailableException("The AI service could not be reached.", ex);
        }
        if (!response.IsSuccessStatusCode)
            throw new CopilotUnavailableException($"The AI service returned {(int)response.StatusCode}.");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Json, ct);
        var action = body.TryGetProperty("action", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString()! : "unknown";
        var parameters = body.TryGetProperty("params", out var p) ? p.Clone() : JsonSerializer.SerializeToElement(new { });
        var reason = body.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;
        return new CopilotIntent(action, parameters, reason);
    }
}
