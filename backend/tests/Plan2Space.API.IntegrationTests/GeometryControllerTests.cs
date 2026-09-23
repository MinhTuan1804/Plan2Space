// backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class GeometryControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public GeometryControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<(HttpClient Client, ProjectRef Project)> AuthedProjectAsync(string email)
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, email);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, await _factory.CreateProjectAsync(client, "Geo Test"));
    }

    private static object[] Square(double x, double y, double s) => new object[]
    {
        new { x, y }, new { x = x + s, y }, new { x = x + s, y = y + s }, new { x, y = y + s }, new { x, y }
    };

    [Fact]
    public async Task SaveGeometry_ThenStaleSave_Returns409()
    {
        var (client, project) = await AuthedProjectAsync("geo-user@plan2space.dev");

        var payload = new
        {
            baseVersion = 0,
            walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = Array.Empty<object>(),
            openings = Array.Empty<object>()
        };

        var first = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Second save still claims baseVersion 0 -> must conflict, not silently overwrite
        var stale = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task SavingEmptyGeometry_DoesNotResetVersion()
    {
        var (client, project) = await AuthedProjectAsync("geo-empty@plan2space.dev");
        var empty = new { baseVersion = 0, walls = Array.Empty<object>(), rooms = Array.Empty<object>(), openings = Array.Empty<object>() };

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", empty)).StatusCode);
        // A client still holding version 0 after someone saved (even an empty plan) is stale.
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", empty)).StatusCode);

        var geo = await client.GetFromJsonAsync<GeometryBody>($"/api/projects/{project.Id}/geometry");
        Assert.Equal(1u, geo!.Version);
    }

    [Fact]
    public async Task OverlappingRooms_Returns422_AndNothingIsStored()
    {
        var (client, project) = await AuthedProjectAsync("geo-overlap@plan2space.dev");
        var payload = new
        {
            baseVersion = 0,
            walls = Array.Empty<object>(),
            rooms = new[] { new { points = Square(0, 0, 4), label = "A" }, new { points = Square(2, 0, 4), label = "B" } },
            openings = Array.Empty<object>()
        };

        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);

        var geo = await client.GetFromJsonAsync<GeometryBody>($"/api/projects/{project.Id}/geometry");
        Assert.Empty(geo!.Rooms);
    }

    [Fact]
    public async Task OpeningKeepsPointingAtItsWall_AcrossSaves()
    {
        var (client, project) = await AuthedProjectAsync("geo-opening@plan2space.dev");
        var wallId = Guid.NewGuid();
        object Payload(uint baseVersion) => new
        {
            baseVersion,
            walls = new[] { new { id = wallId, points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = Array.Empty<object>(),
            openings = new[] { new { wallId, type = "Door", position = new { x = 2.0, y = 0.0 }, widthMeters = 0.9, sillHeightMeters = 0.0 } }
        };

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", Payload(0))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", Payload(1))).StatusCode);

        var geo = await client.GetFromJsonAsync<GeometryBody>($"/api/projects/{project.Id}/geometry");
        Assert.Equal(wallId, Assert.Single(geo!.Walls).Id);
        Assert.Equal(wallId, Assert.Single(geo.Openings).WallId);
    }

    [Fact]
    public async Task OpeningOnUnknownWall_Returns400()
    {
        var (client, project) = await AuthedProjectAsync("geo-badopening@plan2space.dev");
        var payload = new
        {
            baseVersion = 0,
            walls = Array.Empty<object>(),
            rooms = Array.Empty<object>(),
            openings = new[] { new { wallId = Guid.NewGuid(), type = "Window", position = new { x = 1.0, y = 0.0 }, widthMeters = 1.2, sillHeightMeters = 0.9 } }
        };

        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task SaveOnSomeoneElsesProject_Returns404()
    {
        var (_, project) = await AuthedProjectAsync("geo-owner2@plan2space.dev");
        var (intruder, _) = await AuthedProjectAsync("geo-intruder@plan2space.dev");
        var empty = new { baseVersion = 0, walls = Array.Empty<object>(), rooms = Array.Empty<object>(), openings = Array.Empty<object>() };

        var res = await intruder.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", empty);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    private record IdBody(Guid Id);
    private record OpeningBody(Guid Id, Guid WallId);
    private record GeometryBody(List<IdBody> Walls, List<IdBody> Rooms, List<OpeningBody> Openings, uint Version);
}
