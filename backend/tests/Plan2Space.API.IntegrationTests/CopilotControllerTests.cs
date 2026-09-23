// backend/tests/Plan2Space.API.IntegrationTests/CopilotControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Copilot;
using Plan2Space.Application.Geometry.Queries;
using Xunit;

public class CopilotControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public CopilotControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    // Stands in for the ai-service's /copilot/parse (whose contract is pinned by test_copilot_intent.py).
    private class FakeIntentClient : ICopilotIntentClient
    {
        private readonly Func<GeometryDto, CopilotIntent> _reply;
        public FakeIntentClient(Func<GeometryDto, CopilotIntent> reply) => _reply = reply;
        public Task<CopilotIntent> ParseIntentAsync(string message, GeometryDto currentGeometry, CancellationToken ct) =>
            Task.FromResult(_reply(currentGeometry));
    }

    private static CopilotIntent Intent(string action, object parameters, string? reason = null) =>
        new(action, JsonSerializer.SerializeToElement(parameters), reason);

    private async Task<(HttpClient Client, Guid ProjectId)> ClientWithIntentAsync(string email, Func<GeometryDto, CopilotIntent> reply)
    {
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.AddSingleton<ICopilotIntentClient>(new FakeIntentClient(reply))));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsync(client, email));
        var project = await _factory.CreateProjectAsync(client, "Copilot Test");
        return (client, project.Id);
    }

    // One 5m wall along y=0 with a door at x=2, plus a 4x4 room above it (fresh ids per project).
    private static async Task SeedAsync(HttpClient client, Guid projectId)
    {
        var wallId = Guid.NewGuid();
        var roomId = Guid.NewGuid();
        var res = await client.PutAsJsonAsync($"/api/projects/{projectId}/geometry", new
        {
            baseVersion = 0,
            walls = new[] { new { id = wallId, points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = new[] { new { id = roomId, label = "Kitchen", points = new[] { new { x = 0.0, y = 1.0 }, new { x = 4.0, y = 1.0 }, new { x = 4.0, y = 5.0 }, new { x = 0.0, y = 5.0 }, new { x = 0.0, y = 1.0 } } } },
            openings = new[] { new { wallId = wallId, type = "Door", position = new { x = 2.0, y = 0.0 }, widthMeters = 0.9, sillHeightMeters = 0.0 } }
        });
        res.EnsureSuccessStatusCode();
    }

    private static Task<JsonElement> GeometryAsync(HttpClient client, Guid projectId) =>
        client.GetFromJsonAsync<JsonElement>($"/api/projects/{projectId}/geometry");

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, Guid projectId, string message) =>
        client.PostAsJsonAsync("/api/copilot/message", new { projectId, message });

    [Fact]
    public async Task UnknownIntent_ReturnsOkWithNoGeometryChange()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-user@plan2space.dev", _ => Intent("unknown", new { }));

        var response = await SendAsync(client, projectId, "make it nicer somehow");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("unknown", body.GetProperty("action").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("appliedVersion").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));
        Assert.Equal(0u, (await GeometryAsync(client, projectId)).GetProperty("version").GetUInt32());
    }

    [Fact]
    public async Task MoveWall_SavesThroughTheGeometryPath_KeepingRoomsAndMovingItsOpenings()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-move@plan2space.dev",
            g => Intent("move_wall", new { wall_id = g.Walls[0].Id.ToString(), dx = 0.0, dy = -0.5 }));
        await SeedAsync(client, projectId);

        var response = await SendAsync(client, projectId, "move the bottom wall 50cm down");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2u, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("appliedVersion").GetUInt32());
        var geo = await GeometryAsync(client, projectId);
        var wall = geo.GetProperty("walls")[0];
        var wallId = wall.GetProperty("id").GetGuid();
        Assert.Equal(-0.5, wall.GetProperty("points")[0].GetProperty("y").GetDouble(), 6);
        var opening = geo.GetProperty("openings")[0];
        Assert.Equal(wallId, opening.GetProperty("wallId").GetGuid());
        Assert.Equal(-0.5, opening.GetProperty("position").GetProperty("y").GetDouble(), 6);
        Assert.Equal(1, geo.GetProperty("rooms").GetArrayLength());
    }

    [Fact]
    public async Task AddOpening_PlacesItAlongTheWallAtTheRequestedOffset()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-open@plan2space.dev",
            g => Intent("add_opening", new { wall_id = g.Walls[0].Id.ToString(), type = "window", offset_m = 4.0, width_m = 1.2 }));
        await SeedAsync(client, projectId);

        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, projectId, "add a window near the right end")).StatusCode);

        var openings = (await GeometryAsync(client, projectId)).GetProperty("openings").EnumerateArray().ToList();
        Assert.Equal(2, openings.Count);
        var window = openings.Single(o => o.GetProperty("type").GetString() == "Window");
        Assert.Equal(4.0, window.GetProperty("position").GetProperty("x").GetDouble(), 6);
        Assert.Equal(1.2, window.GetProperty("widthMeters").GetDouble(), 6);
        Assert.Equal(0.9, window.GetProperty("sillHeightMeters").GetDouble(), 6);
    }

    [Fact]
    public async Task ResizeRoom_ScalesItAboutItsCentre()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-resize@plan2space.dev",
            g => Intent("resize_room", new { room_id = g.Rooms[0].Id.ToString(), scale = 0.5 }));
        await SeedAsync(client, projectId);

        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, projectId, "make the kitchen half the size")).StatusCode);

        var xs = (await GeometryAsync(client, projectId)).GetProperty("rooms")[0].GetProperty("points")
            .EnumerateArray().Select(p => p.GetProperty("x").GetDouble()).ToList();
        Assert.Equal(1.0, xs.Min(), 6);   // 4m wide room centred at x=2 -> 2m wide
        Assert.Equal(3.0, xs.Max(), 6);
    }

    [Fact]
    public async Task IntentReferencingAnElementThatDoesNotExist_Returns422AndChangesNothing()
    {
        // LLM output is untrusted: a hallucinated id must not crash or edit anything.
        var (client, projectId) = await ClientWithIntentAsync("copilot-halluc@plan2space.dev",
            _ => Intent("move_wall", new { wall_id = Guid.NewGuid().ToString(), dx = 1.0, dy = 0.0 }));
        await SeedAsync(client, projectId);

        var response = await SendAsync(client, projectId, "move that wall");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("wall", (await response.Content.ReadAsStringAsync()).ToLowerInvariant());
        Assert.Equal(1u, (await GeometryAsync(client, projectId)).GetProperty("version").GetUInt32());
    }

    [Fact]
    public async Task OutOfRangeValues_AreRejected()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-range@plan2space.dev",
            g => Intent("resize_room", new { room_id = g.Rooms[0].Id.ToString(), scale = 50.0 }));
        await SeedAsync(client, projectId);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await SendAsync(client, projectId, "make it huge")).StatusCode);
    }

    [Fact]
    public async Task SomeoneElsesProject_Returns404()
    {
        var (_, projectId) = await ClientWithIntentAsync("copilot-owner@plan2space.dev", _ => Intent("unknown", new { }));
        var (intruder, _) = await ClientWithIntentAsync("copilot-intruder@plan2space.dev", _ => Intent("unknown", new { }));

        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(intruder, projectId, "hi")).StatusCode);
    }

    [Fact]
    public async Task AiServiceUnavailable_Returns503()
    {
        var (client, projectId) = await ClientWithIntentAsync("copilot-down@plan2space.dev",
            _ => throw new CopilotUnavailableException("ai-service unreachable"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await SendAsync(client, projectId, "move a wall")).StatusCode);
    }
}
