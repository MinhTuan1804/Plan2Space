// backend/tests/Plan2Space.API.IntegrationTests/ExportControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Application.Export;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Infrastructure.Persistence;
using Xunit;

public class ExportControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public ExportControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private static readonly byte[] FakeGlb = "glTF-fake-binary"u8.ToArray();

    // Stands in for the ai-service's /export (contract pinned by test_export_mesh.py).
    private class FakeExportClient : IAiExportClient
    {
        private readonly Func<GeometryDto, string, byte[]> _reply;
        public int Calls;
        public FakeExportClient(Func<GeometryDto, string, byte[]> reply) => _reply = reply;
        public Task<byte[]> ExportAsync(GeometryDto geometry, string format, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(_reply(geometry, format));
        }
    }

    private async Task<(HttpClient Client, Guid ProjectId, FakeExportClient Fake, WebApplicationFactoryHandle Factory)> SetupAsync(
        string email, Func<GeometryDto, string, byte[]> reply)
    {
        var fake = new FakeExportClient(reply);
        var factory = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<IAiExportClient>(fake)));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        var project = await _factory.CreateProjectAsync(client, "Export Test");
        var seed = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", new
        {
            baseVersion = 0,
            walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = Array.Empty<object>(),
            openings = Array.Empty<object>()
        });
        seed.EnsureSuccessStatusCode();
        return (client, project.Id, fake, new WebApplicationFactoryHandle(factory.Services));
    }

    private record WebApplicationFactoryHandle(IServiceProvider Services);

    [Fact]
    public async Task ExportGltf_ReturnsFileAndRecordsAsset()
    {
        string? seenFormat = null;
        var (client, projectId, _, factory) = await SetupAsync("export-user@plan2space.dev", (geo, format) =>
        {
            seenFormat = format;
            Assert.Single(geo.Walls);   // the real plan is sent to the exporter
            return FakeGlb;
        });

        var response = await client.PostAsync($"/api/export/{projectId}?format=glb", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("model/gltf-binary", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(FakeGlb, await response.Content.ReadAsByteArrayAsync());
        Assert.Equal("glb", seenFormat);

        // The Asset3D row must point at an object that really exists in storage.
        using var scope = factory.Services.CreateScope();
        var asset = await scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>().Assets3D
            .SingleAsync(a => a.ProjectId == projectId);
        Assert.Equal("glb", asset.Format);
        Assert.StartsWith($"exports/{projectId}/", asset.MinioObjectKey);
        Assert.Equal(FakeGlb, await _factory.TryReadStoredObjectAsync(asset.MinioObjectKey));
    }

    [Fact]
    public async Task UnsupportedFormat_Returns400WithoutCallingTheExporter()
    {
        var (client, projectId, fake, _) = await SetupAsync("export-badfmt@plan2space.dev", (_, _) => FakeGlb);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/export/{projectId}?format=fbx", null)).StatusCode);
        Assert.Equal(0, fake.Calls);
    }

    [Fact]
    public async Task ExporterRejectingThePlan_Returns422WithItsReason()
    {
        var (client, projectId, _, _) = await SetupAsync("export-empty@plan2space.dev",
            (_, _) => throw new ExportRejectedException("The plan has no walls — nothing to export"));
        var response = await client.PostAsync($"/api/export/{projectId}?format=obj", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("nothing to export", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AiServiceUnavailable_Returns503()
    {
        var (client, projectId, _, _) = await SetupAsync("export-down@plan2space.dev", (_, _) => throw new ExportUnavailableException("down"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsync($"/api/export/{projectId}?format=obj", null)).StatusCode);
    }

    [Fact]
    public async Task SomeoneElsesProject_Returns404()
    {
        var (_, projectId, _, _) = await SetupAsync("export-owner@plan2space.dev", (_, _) => FakeGlb);
        var (intruder, _, fake, _) = await SetupAsync("export-intruder@plan2space.dev", (_, _) => FakeGlb);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.PostAsync($"/api/export/{projectId}?format=glb", null)).StatusCode);
        Assert.Equal(0, fake.Calls);
    }
}
