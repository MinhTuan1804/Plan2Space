// backend/tests/Plan2Space.API.IntegrationTests/RoomsControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Geometry;
using Xunit;

public class RoomsControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public RoomsControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    // Stands in for the ai-service's /rooms/derive (contract pinned by test_rooms_endpoint.py).
    private class FakeRooms : IRoomDerivationClient
    {
        public List<List<double[]>>? Seen;
        public Exception? Fail;
        public Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct)
        {
            Seen = walls;
            if (Fail is not null) throw Fail;
            return Task.FromResult(new List<DerivedRoom>
            {
                new(new List<double[]> { new[] { 0.0, 0.0 }, new[] { 4.0, 0.0 }, new[] { 4.0, 3.0 }, new[] { 0.0, 0.0 } }, "Room 1")
            });
        }
    }

    private async Task<HttpClient> ClientAsync(string email, FakeRooms fake)
    {
        var client = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IRoomDerivationClient>(fake))).CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return client;
    }

    private static object Wall(double x1, double y1, double x2, double y2) =>
        new { points = new[] { new { x = x1, y = y1 }, new { x = x2, y = y2 } } };

    [Fact]
    public async Task Derive_ReturnsTheRoomsForThePostedWalls()
    {
        var fake = new FakeRooms();
        var client = await ClientAsync("rooms-user@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive", new { walls = new[] { Wall(0, 0, 4, 0), Wall(4, 0, 4, 3) } });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var room = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rooms")[0];
        Assert.Equal("Room 1", room.GetProperty("label").GetString());
        Assert.Equal(4.0, room.GetProperty("points")[1].GetProperty("x").GetDouble());
        Assert.Equal(new[] { 4.0, 0.0 }, fake.Seen![0][1]);
    }

    [Fact]
    public async Task AWallWithOnePoint_Returns400WithoutCallingTheAiService()
    {
        var fake = new FakeRooms();
        var client = await ClientAsync("rooms-bad@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive",
            new { walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 } } } } });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Null(fake.Seen);
    }

    [Fact]
    public async Task AnUnreachableAiService_Returns503()
    {
        var fake = new FakeRooms { Fail = new RoomDerivationUnavailableException("down") };
        var client = await ClientAsync("rooms-down@plan2space.dev", fake);

        var res = await client.PostAsJsonAsync("/api/rooms/derive", new { walls = new[] { Wall(0, 0, 4, 0) } });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
    }
}
