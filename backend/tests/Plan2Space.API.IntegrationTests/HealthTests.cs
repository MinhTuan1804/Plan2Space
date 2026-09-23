// backend/tests/Plan2Space.API.IntegrationTests/HealthTests.cs
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

// Readiness probe for the compose healthcheck and the full-stack smoke test (Task 27).
public class HealthTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public HealthTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_IsAnonymousAndReportsTheDatabase()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", body.GetProperty("status").GetString());
        Assert.Equal("ok", body.GetProperty("database").GetString());
    }
}
