// backend/tests/Plan2Space.Application.Tests/Staging/StagingHttpClientTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using Plan2Space.Application.Staging;
using Plan2Space.Infrastructure.Staging;
using Xunit;

public class StagingHttpClientTests
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

    private static readonly List<List<double>> Room = new() { new() { 0, 0 }, new() { 4, 0 }, new() { 4, 4 }, new() { 0, 0 } };

    private static StagingHttpClient Client(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://ai:8000/") });

    [Fact]
    public async Task PostsPolygonAndLabel_AndReadsSnakeCaseItems()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"items":[{"item":"bed","position":[0.9,1.1],"rotation_deg":0.0,"width_m":1.6,"depth_m":2.0}]}""",
                Encoding.UTF8, "application/json")
        });

        var items = await Client(handler).SuggestAsync(Room, "Bedroom", null, null, CancellationToken.None);

        Assert.Equal("http://ai:8000/staging/suggest", handler.Request!.RequestUri!.ToString());
        var sent = JsonDocument.Parse(handler.Body!).RootElement;
        Assert.Equal("Bedroom", sent.GetProperty("roomLabel").GetString());
        Assert.Equal(4.0, sent.GetProperty("roomPolygon")[1][0].GetDouble());
        var bed = Assert.Single(items);
        Assert.Equal(("bed", 1.6, 2.0, 1.1), (bed.Item, bed.WidthM, bed.DepthM, bed.Position[1]));
    }

    [Fact]
    public async Task Ai422_IsARejectionCarryingItsDetail()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.UnprocessableEntity)
        {
            Content = new StringContent("""{"detail":"Room polygon is invalid"}""", Encoding.UTF8, "application/json")
        });
        var ex = await Assert.ThrowsAsync<StagingRejectedException>(() => Client(handler).SuggestAsync(Room, "Bedroom", null, null, CancellationToken.None));
        Assert.Contains("invalid", ex.Message);
    }

    [Fact]
    public async Task OtherFailures_AreUnavailable()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError));
        await Assert.ThrowsAsync<StagingUnavailableException>(() => Client(handler).SuggestAsync(Room, "Bedroom", null, null, CancellationToken.None));
    }
}
