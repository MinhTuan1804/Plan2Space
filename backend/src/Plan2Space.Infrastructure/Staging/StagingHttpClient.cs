using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Plan2Space.Application.Staging;

namespace Plan2Space.Infrastructure.Staging;

// Calls the ai-service's internal POST /staging/suggest; BaseAddress and X-Internal-Token are set at registration.
public class StagingHttpClient : IStagingClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    public StagingHttpClient(HttpClient http) => _http = http;

    private record AiItem(
        [property: JsonPropertyName("item")] string Item,
        [property: JsonPropertyName("position")] double[] Position,
        [property: JsonPropertyName("rotation_deg")] double RotationDeg,
        [property: JsonPropertyName("width_m")] double WidthM,
        [property: JsonPropertyName("depth_m")] double DepthM);

    private record AiResponse([property: JsonPropertyName("items")] List<AiItem> Items);

    public async Task<List<StagingItem>> SuggestAsync(List<List<double>> roomPolygon, string roomLabel, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("staging/suggest", new { roomPolygon, roomLabel }, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new StagingUnavailableException("The AI service could not be reached.", ex);
        }

        if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
        {
            var detail = await response.Content.ReadFromJsonAsync<JsonElement>(Json, ct);
            throw new StagingRejectedException(detail.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String
                ? d.GetString()! : "The AI service rejected the room.");
        }
        if (!response.IsSuccessStatusCode)
            throw new StagingUnavailableException($"The AI service returned {(int)response.StatusCode}.");

        var body = await response.Content.ReadFromJsonAsync<AiResponse>(Json, ct);
        return body?.Items.Select(i => new StagingItem(i.Item, i.Position, i.RotationDeg, i.WidthM, i.DepthM)).ToList() ?? new();
    }
}
