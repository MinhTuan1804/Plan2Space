using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Plan2Space.Application.Geometry;

namespace Plan2Space.Infrastructure.Geometry;

// Calls the ai-service's internal POST /rooms/derive; BaseAddress and X-Internal-Token are set at registration.
public class RoomDerivationHttpClient : IRoomDerivationClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    public RoomDerivationHttpClient(HttpClient http) => _http = http;

    private record AiRoom([property: JsonPropertyName("points")] List<double[]> Points,
                          [property: JsonPropertyName("label")] string Label);
    private record AiResponse([property: JsonPropertyName("rooms")] List<AiRoom> Rooms);

    public async Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("rooms/derive", new { walls = walls.Select(points => new { points }) }, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new RoomDerivationUnavailableException("The AI service could not be reached.", ex);
        }
        if (!response.IsSuccessStatusCode)
            throw new RoomDerivationUnavailableException($"The AI service returned {(int)response.StatusCode}.");

        var body = await response.Content.ReadFromJsonAsync<AiResponse>(Json, ct);
        return body?.Rooms.Select(r => new DerivedRoom(r.Points, r.Label)).ToList() ?? new();
    }
}
