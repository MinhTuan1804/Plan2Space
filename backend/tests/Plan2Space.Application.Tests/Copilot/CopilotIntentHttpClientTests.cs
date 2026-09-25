// backend/tests/Plan2Space.Application.Tests/Copilot/CopilotIntentHttpClientTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using Plan2Space.Application.Copilot;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Infrastructure.Copilot;
using Xunit;

public class CopilotIntentHttpClientTests
{
    private class StubHandler : HttpMessageHandler
    {
        public HttpRequestMessage? Request;
        public string? Body;
        private readonly HttpResponseMessage _response;
        public StubHandler(HttpResponseMessage response) => _response = response;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return _response;
        }
    }

    private static readonly GeometryDto Geometry = new(
        new List<WallDto> { new(Guid.NewGuid(), new List<GeometryPointDto> { new(0, 0), new(5, 0) }, 0.2, 2.8, 1) },
        new List<RoomDto>(), new List<OpeningDto>(), new List<FurnitureDto>(), 1);

    [Fact]
    public async Task PostsMessageAndCamelCaseGeometry_AndReadsTheIntent()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"action":"move_wall","params":{"wall_id":"w1","dx":0.5,"dy":0}}""", Encoding.UTF8, "application/json")
        });
        var client = new CopilotIntentHttpClient(new HttpClient(handler) { BaseAddress = new Uri("http://ai:8000") });

        var intent = await client.ParseIntentAsync("move it", Geometry, CancellationToken.None);

        Assert.Equal("http://ai:8000/copilot/parse", handler.Request!.RequestUri!.ToString());
        var sent = JsonDocument.Parse(handler.Body!).RootElement;
        Assert.Equal("move it", sent.GetProperty("message").GetString());
        Assert.Equal(5.0, sent.GetProperty("geometry").GetProperty("walls")[0].GetProperty("points")[1].GetProperty("x").GetDouble());
        Assert.Equal("move_wall", intent.Action);
        Assert.Equal(0.5, intent.Params.GetProperty("dx").GetDouble());
    }

    [Fact]
    public async Task ServiceErrors_SurfaceAsCopilotUnavailable()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.BadGateway));
        var client = new CopilotIntentHttpClient(new HttpClient(handler) { BaseAddress = new Uri("http://ai:8000") });

        await Assert.ThrowsAsync<CopilotUnavailableException>(() => client.ParseIntentAsync("x", Geometry, CancellationToken.None));
    }
}
