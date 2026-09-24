// backend/tests/Plan2Space.API.IntegrationTests/UnderlayTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

// The editor draws the imported image under the plan; it needs the worker's pixel-to-metre mapping.
public class UnderlayTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public UnderlayTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private const string ImageResult = "{\"underlay\":{\"metresPerPixel\":0.02,\"widthPx\":300,\"heightPx\":200}}";

    private HttpClient Service()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Internal-Token", Plan2SpaceWebApplicationFactory.InternalToken);
        return client;
    }

    private async Task<(HttpClient Client, Guid ProjectId)> OwnerAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return (client, (await _factory.CreateProjectAsync(client, "Underlay")).Id);
    }

    private async Task<(Guid FileId, Guid JobId)> ImportAsync(HttpClient client, Guid projectId)
    {
        var fileId = await _factory.UploadFixtureFileAsync(client, projectId, "fixtures/blank.png");
        var res = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId, fileId });
        return (fileId, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid());
    }

    [Fact]
    public async Task AnImageImport_ExposesItsPixelToMetreMapping()
    {
        var (client, projectId) = await OwnerAsync("underlay-png@plan2space.dev");
        var (fileId, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var res = await client.GetAsync($"/api/projects/{projectId}/underlay");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(fileId, body.GetProperty("fileId").GetGuid());
        Assert.Equal(0.02, body.GetProperty("metresPerPixel").GetDouble());
        Assert.Equal(300, body.GetProperty("widthPx").GetInt32());
        Assert.Equal(200, body.GetProperty("heightPx").GetInt32());
    }

    [Fact]
    public async Task WhenTheLatestImportHadNoUnderlay_NoOlderImageIsServed()
    {
        // An image import, then a DXF import (which reports no underlay): the old image must not sit under the DXF plan.
        var (client, projectId) = await OwnerAsync("underlay-then-dxf@plan2space.dev");
        var (_, imageJob) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{imageJob}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });
        var (_, dxfJob) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{dxfJob}/state", new { status = "Completed", progressPercent = 100 });

        var res = await client.GetAsync($"/api/projects/{projectId}/underlay");

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    [Fact]
    public async Task AProjectNeverImported_HasNoUnderlay()
    {
        var (client, projectId) = await OwnerAsync("underlay-none@plan2space.dev");

        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync($"/api/projects/{projectId}/underlay")).StatusCode);
    }

    [Fact]
    public async Task SomeoneElsesProject_Returns404()
    {
        var (_, projectId) = await OwnerAsync("underlay-owner@plan2space.dev");
        var (stranger, _) = await OwnerAsync("underlay-stranger@plan2space.dev");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{projectId}/underlay")).StatusCode);
    }

    [Fact]
    public async Task ACorrectedScale_ReplacesTheImportsMapping()
    {
        var (client, projectId) = await OwnerAsync("underlay-scale@plan2space.dev");
        var (_, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.0152 });

        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        var body = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{projectId}/underlay");
        Assert.Equal(0.0152, body.GetProperty("metresPerPixel").GetDouble());
        Assert.Equal(300, body.GetProperty("widthPx").GetInt32());
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-0.02)]
    public async Task ANonPositiveScale_Returns400(double value)
    {
        var (client, projectId) = await OwnerAsync($"underlay-bad-scale-{Guid.NewGuid():N}@plan2space.dev");
        var (_, jobId) = await ImportAsync(client, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = value });

        Assert.Equal(HttpStatusCode.BadRequest, put.StatusCode);
    }

    [Fact]
    public async Task ScalingAProjectWithoutAnUnderlay_Returns404()
    {
        var (client, projectId) = await OwnerAsync("underlay-scale-none@plan2space.dev");

        var put = await client.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.02 });

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
    }

    [Fact]
    public async Task ScalingSomeoneElsesUnderlay_Returns404()
    {
        var (owner, projectId) = await OwnerAsync("underlay-scale-owner@plan2space.dev");
        var (_, jobId) = await ImportAsync(owner, projectId);
        await Service().PutAsJsonAsync($"/internal/ai/jobs/{jobId}/state",
            new { status = "Completed", progressPercent = 100, result = ImageResult });
        var (stranger, _) = await OwnerAsync("underlay-scale-stranger@plan2space.dev");

        var put = await stranger.PutAsJsonAsync($"/api/projects/{projectId}/underlay", new { metresPerPixel = 0.02 });

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
    }
}
