// backend/tests/Plan2Space.API.IntegrationTests/RateLimitingTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Copilot;
using Plan2Space.Application.Geometry.Queries;
using Xunit;

// The shared test factory raises every limit so other suites aren't throttled; these tests run a host with the
// spec's limits: 100 req/min per user, 5 AI jobs/hour per user, 10 AI calls/min per user, 10 auth calls/min per IP.
public class RateLimitingTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly WebApplicationFactory<Program> _host;
    private readonly Plan2SpaceWebApplicationFactory _factory;

    private class UnknownIntent : ICopilotIntentClient
    {
        public Task<CopilotIntent> ParseIntentAsync(string message, GeometryDto g, CancellationToken ct) =>
            Task.FromResult(new CopilotIntent("unknown", JsonSerializer.SerializeToElement(new { })));
    }

    public RateLimitingTests(Plan2SpaceWebApplicationFactory factory)
    {
        _factory = factory;
        _host = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimiting:PerUserPerMinute", "100");
            b.UseSetting("RateLimiting:AiJobsPerHour", "5");
            b.UseSetting("RateLimiting:AiCallsPerMinute", "10");
            b.UseSetting("RateLimiting:AuthPerMinute", "10");
            b.ConfigureTestServices(s => s.AddSingleton<ICopilotIntentClient>(new UnknownIntent()));
        });
    }

    private async Task<HttpClient> UserAsync(string email)
    {
        // Register/login through the permissive factory so these calls don't spend the auth budget under test.
        var setup = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(setup, email);
        var client = _host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task ExceedingVectorizeRateLimit_Returns429()
    {
        var client = await UserAsync("rate-user@plan2space.dev");
        var project = await _factory.CreateProjectAsync(client, "Rate Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        var codes = new List<HttpStatusCode>();
        for (int i = 0; i < 6; i++)   // spec: 5 AI jobs/hour per user
            codes.Add((await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId })).StatusCode);

        Assert.All(codes.Take(5), c => Assert.Equal(HttpStatusCode.Accepted, c));
        Assert.Equal(HttpStatusCode.TooManyRequests, codes[5]);
    }

    [Fact]
    public async Task AiJobLimit_IsPerUser_NotShared()
    {
        var greedy = await UserAsync("rate-greedy@plan2space.dev");
        var p1 = await _factory.CreateProjectAsync(greedy, "Greedy");
        var f1 = await _factory.UploadFixtureFileAsync(greedy, p1.Id, "fixtures/blank.png");
        for (int i = 0; i < 6; i++) await greedy.PostAsJsonAsync("/api/ai/vectorize", new { projectId = p1.Id, fileId = f1 });

        var other = await UserAsync("rate-other@plan2space.dev");
        var p2 = await _factory.CreateProjectAsync(other, "Other");
        var f2 = await _factory.UploadFixtureFileAsync(other, p2.Id, "fixtures/blank.png");

        Assert.Equal(HttpStatusCode.Accepted, (await other.PostAsJsonAsync("/api/ai/vectorize", new { projectId = p2.Id, fileId = f2 })).StatusCode);
    }

    [Fact]
    public async Task CopilotCalls_AreRateLimited()
    {
        var client = await UserAsync("rate-copilot@plan2space.dev");
        var project = await _factory.CreateProjectAsync(client, "Copilot Rate");

        HttpStatusCode last = HttpStatusCode.OK;
        for (int i = 0; i < 11; i++)
            last = (await client.PostAsJsonAsync("/api/copilot/message", new { projectId = project.Id, message = "hi" })).StatusCode;

        Assert.Equal(HttpStatusCode.TooManyRequests, last);
    }

    [Fact]
    public async Task EveryEndpoint_HasAPerUserRequestBudget()
    {
        var client = await UserAsync("rate-global@plan2space.dev");
        var codes = new List<HttpStatusCode>();
        for (int i = 0; i < 101; i++)
            codes.Add((await client.GetAsync("/api/projects")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, codes[99]);
        Assert.Equal(HttpStatusCode.TooManyRequests, codes[100]);
    }

    [Fact]
    public async Task RepeatedLoginAttempts_AreThrottled()
    {
        var client = _host.CreateClient();
        HttpStatusCode last = HttpStatusCode.OK;
        for (int i = 0; i < 11; i++)
            last = (await client.PostAsJsonAsync("/api/auth/login", new { email = "victim@plan2space.dev", password = $"guess{i}" })).StatusCode;

        Assert.Equal(HttpStatusCode.TooManyRequests, last);
    }
}
