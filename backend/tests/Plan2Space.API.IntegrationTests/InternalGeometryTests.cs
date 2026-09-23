// backend/tests/Plan2Space.API.IntegrationTests/InternalGeometryTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

// The AI worker (Task 12) writes results through /internal/*, authenticated by a shared service
// token instead of a user JWT; nginx never proxies /internal/.
public class InternalGeometryTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public InternalGeometryTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private static object Payload(uint baseVersion) => new
    {
        baseVersion,
        walls = new[] { new { id = Guid.NewGuid(), points = new[] { new { x = 0.0, y = 0.0 }, new { x = 4.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
        rooms = Array.Empty<object>(),
        openings = Array.Empty<object>()
    };

    private HttpClient ServiceClient(string? token = Plan2SpaceWebApplicationFactory.InternalToken)
    {
        var client = _factory.CreateClient();
        if (token is not null) client.DefaultRequestHeaders.Add("X-Internal-Token", token);
        return client;
    }

    [Fact]
    public async Task MissingOrWrongServiceToken_Returns401()
    {
        var project = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized, (await ServiceClient(null).GetAsync($"/internal/projects/{project}/geometry/version")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ServiceClient("wrong").PutAsJsonAsync($"/internal/projects/{project}/geometry", Payload(0))).StatusCode);
    }

    [Fact]
    public async Task Worker_SavesGeometryOnTopOfCurrentVersion_AndOwnerSeesIt()
    {
        var owner = _factory.CreateClient();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsync(owner, "internal-owner@plan2space.dev"));
        var project = await _factory.CreateProjectAsync(owner, "AI target");
        var service = ServiceClient();

        var version = await service.GetFromJsonAsync<JsonElement>($"/internal/projects/{project.Id}/geometry/version");
        Assert.Equal(0u, version.GetProperty("version").GetUInt32());

        var save = await service.PutAsJsonAsync($"/internal/projects/{project.Id}/geometry", Payload(0));
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var geo = await owner.GetFromJsonAsync<JsonElement>($"/api/projects/{project.Id}/geometry");
        Assert.Equal(1, geo.GetProperty("walls").GetArrayLength());
        Assert.Equal(1u, geo.GetProperty("version").GetUInt32());
    }

    [Fact]
    public async Task UnknownProject_Returns404()
    {
        var res = await ServiceClient().GetAsync($"/internal/projects/{Guid.NewGuid()}/geometry/version");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
