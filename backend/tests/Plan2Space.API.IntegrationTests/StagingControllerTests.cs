// backend/tests/Plan2Space.API.IntegrationTests/StagingControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Staging;
using Xunit;

public class StagingControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public StagingControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    // Stands in for the ai-service's /staging/suggest (contract pinned by test_generative_staging.py).
    private class FakeStagingClient : IStagingClient
    {
        private readonly Func<List<List<double>>, string, List<StagingItem>> _reply;
        public FakeStagingClient(Func<List<List<double>>, string, List<StagingItem>> reply) => _reply = reply;
        public Task<List<StagingItem>> SuggestAsync(List<List<double>> roomPolygon, string roomLabel, CancellationToken ct) =>
            Task.FromResult(_reply(roomPolygon, roomLabel));
    }

    private async Task<HttpClient> ClientAsync(string email, Func<List<List<double>>, string, List<StagingItem>> reply)
    {
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.AddSingleton<IStagingClient>(new FakeStagingClient(reply))));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return client;
    }

    private static readonly double[][] Square = { new[] { 0.0, 0.0 }, new[] { 4.0, 0.0 }, new[] { 4.0, 4.0 }, new[] { 0.0, 4.0 }, new[] { 0.0, 0.0 } };

    [Fact]
    public async Task Suggest_ReturnsTheLayoutForTheRoom()
    {
        string? seenLabel = null;
        var client = await ClientAsync("staging-user@plan2space.dev", (_, label) =>
        {
            seenLabel = label;
            return new List<StagingItem> { new("bed", new[] { 0.9, 1.1 }, 0, 1.6, 2.0) };
        });

        var response = await client.PostAsJsonAsync("/api/staging/suggest", new { roomPolygon = Square, roomLabel = "Bedroom" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var item = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")[0];
        Assert.Equal("bed", item.GetProperty("item").GetString());
        Assert.Equal(1.6, item.GetProperty("widthM").GetDouble());
        Assert.Equal("Bedroom", seenLabel);
    }

    [Fact]
    public async Task MalformedPolygon_Returns400WithoutCallingTheAiService()
    {
        var called = false;
        var client = await ClientAsync("staging-bad@plan2space.dev", (_, _) => { called = true; return new(); });

        var response = await client.PostAsJsonAsync("/api/staging/suggest",
            new { roomPolygon = new[] { new[] { 0.0, 0.0 }, new[] { 1.0 } }, roomLabel = "Bedroom" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(called);
    }

    [Fact]
    public async Task AiRejectingThePolygon_Returns400WithItsReason()
    {
        var client = await ClientAsync("staging-rejected@plan2space.dev",
            (_, _) => throw new StagingRejectedException("Room polygon is invalid (self-intersecting or zero area)"));

        var response = await client.PostAsJsonAsync("/api/staging/suggest", new { roomPolygon = Square, roomLabel = "Bedroom" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("self-intersecting", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AiServiceUnavailable_Returns503()
    {
        var client = await ClientAsync("staging-down@plan2space.dev", (_, _) => throw new StagingUnavailableException("down"));
        var response = await client.PostAsJsonAsync("/api/staging/suggest", new { roomPolygon = Square, roomLabel = "Bedroom" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_Returns401()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/staging/suggest", new { roomPolygon = Square, roomLabel = "Bedroom" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
