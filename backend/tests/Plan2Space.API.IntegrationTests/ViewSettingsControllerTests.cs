using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

public class ViewSettingsControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public ViewSettingsControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<(HttpClient Client, ProjectRef Project)> AuthedProjectAsync(string email)
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, email);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, await _factory.CreateProjectAsync(client, "View Test"));
    }

    private static object Body(double lat = 16.054, double lon = 108.202, double north = 30, object[]? views = null) => new
    {
        location = new { lat, lon }, northDeg = north,
        views = views ?? new object[] { new { name = "Phòng khách", level = 0, position = new[] { 1.0, 2.0, 3.0 }, target = new[] { 4.0, 5.0, 1.2 } } },
    };

    [Fact]
    public async Task Defaults_WhenNeverSaved()
    {
        var (client, project) = await AuthedProjectAsync($"vs-def-{Guid.NewGuid():N}@plan2space.dev");
        var s = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/view-settings");
        Assert.Equal(10.776, s.GetProperty("location").GetProperty("lat").GetDouble());
        Assert.Equal(106.700, s.GetProperty("location").GetProperty("lon").GetDouble());
        Assert.Equal(0, s.GetProperty("northDeg").GetDouble());
        Assert.Equal(0, s.GetProperty("views").GetArrayLength());
    }

    [Fact]
    public async Task RoundTrip()
    {
        var (client, project) = await AuthedProjectAsync($"vs-rt-{Guid.NewGuid():N}@plan2space.dev");
        var put = await client.PutAsJsonAsync($"/api/projects/{project.Id}/view-settings", Body());
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        var s = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/view-settings");
        Assert.Equal(16.054, s.GetProperty("location").GetProperty("lat").GetDouble());
        Assert.Equal(30, s.GetProperty("northDeg").GetDouble());
        var view = s.GetProperty("views")[0];
        Assert.Equal("Phòng khách", view.GetProperty("name").GetString());
        Assert.Equal(1.2, view.GetProperty("target")[2].GetDouble());
    }

    public static IEnumerable<object[]> InvalidBodies() => new[]
    {
        new object[] { Body(lat: 91) }, new object[] { Body(lon: -181) }, new object[] { Body(north: 361) },
        new object[] { Body(views: Enumerable.Range(0, 21).Select(i => (object)new { name = $"v{i}", level = 0, position = new[] { 0.0, 0, 0 }, target = new[] { 0.0, 0, 0 } }).ToArray()) },
        new object[] { Body(views: new object[] { new { name = "  ", level = 0, position = new[] { 0.0, 0, 0 }, target = new[] { 0.0, 0, 0 } } }) },
        new object[] { Body(views: new object[] { new { name = new string('a', 61), level = 0, position = new[] { 0.0, 0, 0 }, target = new[] { 0.0, 0, 0 } } }) },
        new object[] { Body(views: new object[] { new { name = "x", level = 10, position = new[] { 0.0, 0, 0 }, target = new[] { 0.0, 0, 0 } } }) },
        new object[] { Body(views: new object[] { new { name = "x", level = 0, position = new[] { 0.0, 0 }, target = new[] { 0.0, 0, 0 } } }) },
        new object[] { Body(views: new object[] { new { name = "x", level = 0, position = new[] { 1e5, 0, 0 }, target = new[] { 0.0, 0, 0 } } }) },
    };

    [Theory]
    [MemberData(nameof(InvalidBodies))]
    public async Task Invalid_Returns400(object body)
    {
        var (client, project) = await AuthedProjectAsync($"vs-bad-{Guid.NewGuid():N}@plan2space.dev");
        var res = await client.PutAsJsonAsync($"/api/projects/{project.Id}/view-settings", body);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task OtherUsersProject_Returns404()
    {
        var (_, project) = await AuthedProjectAsync($"vs-own-{Guid.NewGuid():N}@plan2space.dev");
        var (other, _) = await AuthedProjectAsync($"vs-oth-{Guid.NewGuid():N}@plan2space.dev");
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/projects/{project.Id}/view-settings")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync($"/api/projects/{project.Id}/view-settings", Body())).StatusCode);
    }
}
