// backend/tests/Plan2Space.Application.Tests/Export/AiExportClientTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using Plan2Space.Application.Export;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Infrastructure.Export;
using Xunit;

public class AiExportClientTests
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

    private static AiExportClient Client(StubHandler handler) => new(new HttpClient(handler) { BaseAddress = new Uri("http://ai:8000/") });

    [Fact]
    public async Task PostsCamelCaseGeometryAndFormat_AndReturnsTheFileBytes()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent("glTF123"u8.ToArray()) });

        var bytes = await Client(handler).ExportAsync(Geometry, "glb", CancellationToken.None);

        Assert.Equal("http://ai:8000/export", handler.Request!.RequestUri!.ToString());
        var sent = JsonDocument.Parse(handler.Body!).RootElement;
        Assert.Equal("glb", sent.GetProperty("format").GetString());
        Assert.Equal(0.2, sent.GetProperty("geometry").GetProperty("walls")[0].GetProperty("thicknessMeters").GetDouble());
        Assert.Equal("glTF123"u8.ToArray(), bytes);
    }

    [Fact]
    public async Task Ai422_IsARejectionCarryingItsDetail()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.UnprocessableEntity)
        {
            Content = new StringContent("""{"detail":"The plan has no walls — nothing to export"}""", Encoding.UTF8, "application/json")
        });
        var ex = await Assert.ThrowsAsync<ExportRejectedException>(() => Client(handler).ExportAsync(Geometry, "obj", CancellationToken.None));
        Assert.Contains("nothing to export", ex.Message);
    }

    [Fact]
    public async Task OtherFailures_AreUnavailable()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.BadGateway));
        await Assert.ThrowsAsync<ExportUnavailableException>(() => Client(handler).ExportAsync(Geometry, "obj", CancellationToken.None));
    }
}
