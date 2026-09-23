using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Plan2Space.Application.Export;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.Infrastructure.Export;

// Calls the ai-service's internal POST /export; BaseAddress and X-Internal-Token are set at registration.
public class AiExportClient : IAiExportClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    public AiExportClient(HttpClient http) => _http = http;

    public async Task<byte[]> ExportAsync(GeometryDto geometry, string format, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("export", new { geometry, format }, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            throw new ExportUnavailableException("The AI service could not be reached.", ex);
        }

        if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
        {
            var detail = await response.Content.ReadFromJsonAsync<JsonElement>(Json, ct);
            throw new ExportRejectedException(detail.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String
                ? d.GetString()! : "The exporter rejected the plan.");
        }
        if (!response.IsSuccessStatusCode)
            throw new ExportUnavailableException($"The AI service returned {(int)response.StatusCode}.");
        return await response.Content.ReadAsByteArrayAsync(ct);
    }
}
