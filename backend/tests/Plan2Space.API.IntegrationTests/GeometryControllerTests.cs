// backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
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

    [Theory]
    [InlineData(0.0, 2.8)]
    [InlineData(-0.2, 2.8)]
    [InlineData(0.2, 0.0)]
    [InlineData(0.2, -1.0)]
    public async Task NonPositiveWallThicknessOrHeight_Returns400(double thickness, double height)
    {
        // Hand-drawn walls reach this path from the editor; a zero-thickness wall breaks the 3D extrusion.
        var (client, project) = await AuthedProjectAsync($"geo-dims-{Guid.NewGuid():N}@plan2space.dev");

        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0,
            walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } },
                                  thicknessMeters = thickness, heightMeters = height } },
            rooms = Array.Empty<object>(),
            openings = Array.Empty<object>()
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

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
    public async Task ReusingAnElementIdFromAnotherProject_SavesWithFreshIdsAndKeepsOpeningsAttached()
    {
        var (clientA, projectA) = await AuthedProjectAsync("geo-idreuse-a@plan2space.dev");
        var (clientB, projectB) = await AuthedProjectAsync("geo-idreuse-b@plan2space.dev");
        var sharedWallId = Guid.NewGuid();
        var sharedRoomId = Guid.NewGuid();
        object Payload() => new
        {
            baseVersion = 0,
            walls = new[] { new { id = sharedWallId, points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = new[] { new { id = sharedRoomId, points = Square(0, 1, 3), label = "R" } },
            openings = new[] { new { wallId = sharedWallId, type = "Door", position = new { x = 2.0, y = 0.0 }, widthMeters = 0.9, sillHeightMeters = 0.0 } }
        };

        Assert.Equal(HttpStatusCode.OK, (await clientA.PutAsJsonAsync($"/api/projects/{projectA.Id}/geometry", Payload())).StatusCode);
        // Same ids, different project (copied payload / hostile client): must not collide with project A's rows.
        Assert.Equal(HttpStatusCode.OK, (await clientB.PutAsJsonAsync($"/api/projects/{projectB.Id}/geometry", Payload())).StatusCode);

        var geoB = await clientB.GetFromJsonAsync<GeometryBody>($"/api/projects/{projectB.Id}/geometry");
        var wallB = Assert.Single(geoB!.Walls).Id;
        Assert.NotEqual(sharedWallId, wallB);
        Assert.Equal(wallB, Assert.Single(geoB.Openings).WallId);
        var geoA = await clientA.GetFromJsonAsync<GeometryBody>($"/api/projects/{projectA.Id}/geometry");
        Assert.Equal(sharedWallId, Assert.Single(geoA!.Walls).Id);
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

    private static object[] OneWall() => new object[]
    {
        new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 }
    };

    [Fact]
    public async Task Furniture_RoundTripsThroughSave()
    {
        var (client, project) = await AuthedProjectAsync($"furn-{Guid.NewGuid():N}@plan2space.dev");
        var put = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId = "bed_double", x = 2.0, y = 1.5, rotationDeg = 90.0 } }
        });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry");
        var item = body.GetProperty("furniture")[0];
        Assert.Equal("bed_double", item.GetProperty("catalogId").GetString());
        Assert.Equal(2.0, item.GetProperty("x").GetDouble());
        Assert.Equal(90.0, item.GetProperty("rotationDeg").GetDouble());
    }

    [Fact]
    public async Task ASaveWithoutAFurnitureList_LeavesFurnitureAlone()
    {
        // The co-pilot saves walls/rooms/openings only; a furnished plan must not lose its furniture.
        var (client, project) = await AuthedProjectAsync($"furn-keep-{Guid.NewGuid():N}@plan2space.dev");
        await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId = "sofa", x = 1.0, y = 1.0, rotationDeg = 0.0 } }
        });
        await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 1, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>()
        });

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry");
        Assert.Equal(1, body.GetProperty("furniture").GetArrayLength());
    }

    [Theory]
    [InlineData("", 1.0)]
    [InlineData("Bed Double!", 1.0)]
    [InlineData("bed_double", double.NaN)]
    public async Task InvalidFurniture_Returns400(string catalogId, double x)
    {
        var (client, project) = await AuthedProjectAsync($"furn-bad-{Guid.NewGuid():N}@plan2space.dev");
        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new[] { new { catalogId, x = double.IsNaN(x) ? (double?)null : x, y = 1.0, rotationDeg = 0.0 } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task NullFurnitureEntry_Returns400()
    {
        var (client, project) = await AuthedProjectAsync($"furn-null-{Guid.NewGuid():N}@plan2space.dev");
        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), rooms = Array.Empty<object>(), openings = Array.Empty<object>(),
            furniture = new object?[] { null }
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // Walls, rooms, openings and furniture load in one Include chain: a single JOIN multiplies their rows.
    [Fact]
    public void GeometryQueries_AreSplit()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Plan2Space.Infrastructure.Persistence.Plan2SpaceDbContext>();
        var options = db.GetService<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptions>();
        var relational = Microsoft.EntityFrameworkCore.Infrastructure.RelationalOptionsExtension.Extract(options);
        Assert.Equal(Microsoft.EntityFrameworkCore.QuerySplittingBehavior.SplitQuery, relational.QuerySplittingBehavior);
    }

    // The user can flip which way a door swings; the choice is saved with the plan. Absent means automatic.
    [Fact]
    public async Task DoorSwingFlip_RoundTrips_AndDefaultsToAutomatic()
    {
        var (client, project) = await AuthedProjectAsync($"swing-{Guid.NewGuid():N}@plan2space.dev");
        var wallId = Guid.NewGuid();
        object Save(uint baseVersion, bool? flipped) => new
        {
            baseVersion,
            walls = new[] { new { id = wallId, points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = Array.Empty<object>(),
            openings = new object[] { flipped is bool f
                ? new { wallId, type = "Door", position = new { x = 2.0, y = 0.0 }, widthMeters = 0.9, sillHeightMeters = 0.0, swingFlipped = f }
                : new { wallId, type = "Door", position = new { x = 2.0, y = 0.0 }, widthMeters = 0.9, sillHeightMeters = 0.0 } }
        };
        (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", Save(0, true))).EnsureSuccessStatusCode();
        var door = (await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry")).GetProperty("openings")[0];
        Assert.True(door.GetProperty("swingFlipped").GetBoolean());

        (await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", Save(1, null))).EnsureSuccessStatusCode();
        door = (await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry")).GetProperty("openings")[0];
        Assert.False(door.GetProperty("swingFlipped").GetBoolean());
    }

    // A room's wall paint is saved with the plan; absent means the default paint; only #RRGGBB is accepted.
    [Theory]
    [InlineData("#A1B2C3", true)]
    [InlineData(null, true)]
    [InlineData("red", false)]
    [InlineData("#12345", false)]
    public async Task RoomWallColor_RoundTripsAndIsValidated(string? color, bool ok)
    {
        var (client, project) = await AuthedProjectAsync($"paint-{Guid.NewGuid():N}@plan2space.dev");
        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0, walls = OneWall(), openings = Array.Empty<object>(),
            rooms = new[] { new { label = "Phòng ngủ", points = Square(0, 1, 3), wallColor = color } }
        });
        Assert.Equal(ok ? HttpStatusCode.OK : HttpStatusCode.BadRequest, res.StatusCode);
        if (!ok) return;
        var room = (await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry")).GetProperty("rooms")[0];
        if (color is null) Assert.Equal(JsonValueKind.Null, room.GetProperty("wallColor").ValueKind);
        else Assert.Equal(color, room.GetProperty("wallColor").GetString());
    }
}
