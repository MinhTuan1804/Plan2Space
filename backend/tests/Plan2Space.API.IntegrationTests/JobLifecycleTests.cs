// backend/tests/Plan2Space.API.IntegrationTests/JobLifecycleTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Infrastructure.Persistence;
using Xunit;

// Final review I2: job state must not live only in Redis, and a job that stops reporting must end.
public class JobLifecycleTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public JobLifecycleTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<(HttpClient Client, Guid JobId)> JobAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        var project = await _factory.CreateProjectAsync(client, "Jobs");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var res = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });
        return (client, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid());
    }

    private HttpClient Service()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Internal-Token", Plan2SpaceWebApplicationFactory.InternalToken);
        return client;
    }

    [Fact]
    public async Task WorkerFinalState_IsStoredInTheDatabase_AndServedWithoutRedis()
    {
        var (client, jobId) = await JobAsync("job-final@plan2space.dev");

        var put = await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Failed", progressPercent = 30, error = "No walls found" });
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        // Nothing was written to Redis for this job: the answer comes from the AiJobs row.
        var body = await client.GetFromJsonAsync<JsonElement>($"/api/ai/job/{jobId}/status");
        Assert.Equal("Failed", body.GetProperty("status").GetString());
        Assert.Equal(30, body.GetProperty("progressPercent").GetInt32());
        Assert.Equal("No walls found", body.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var job = await scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>().AiJobs.SingleAsync(j => j.Id == jobId);
        Assert.NotNull(job.CompletedAt);
    }

    [Fact]
    public async Task DatabaseFinalState_WinsOverStaleRedisProgress()
    {
        var (client, jobId) = await JobAsync("job-stale@plan2space.dev");
        await _factory.SetJobProgressInRedisAsync(jobId, "Running", 80);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state", new { status = "Completed", progressPercent = 100 });

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/ai/job/{jobId}/status");
        Assert.Equal("Completed", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task JobThatStopsReporting_TimesOutAsFailed()
    {
        var (client, jobId) = await JobAsync("job-stuck@plan2space.dev");
        await _factory.SetJobProgressInRedisAsync(jobId, "Running", 30);   // worker died here
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>();
            var job = await db.AiJobs.SingleAsync(j => j.Id == jobId);
            job.CreatedAt = DateTimeOffset.UtcNow.AddHours(-1);
            await db.SaveChangesAsync();
        }

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/ai/job/{jobId}/status");
        Assert.Equal("Failed", body.GetProperty("status").GetString());
        Assert.Contains("did not finish", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task FinalStateEndpoint_RequiresTheServiceToken_AndAValidStatus()
    {
        var (_, jobId) = await JobAsync("job-auth@plan2space.dev");
        var anonymous = await _factory.CreateClient().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state", new { status = "Completed", progressPercent = 100 });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var bad = await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state", new { status = "Exploded", progressPercent = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var unknown = await Service().PutAsJsonAsync($"/internal/ai/jobs/{Guid.NewGuid()}/state", new { status = "Completed", progressPercent = 100 });
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }
}
