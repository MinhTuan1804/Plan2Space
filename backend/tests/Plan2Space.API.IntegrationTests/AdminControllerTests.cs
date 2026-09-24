// backend/tests/Plan2Space.API.IntegrationTests/AdminControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Xunit;

public class AdminControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public AdminControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task StandardUser_IsForbiddenFromAdminEndpoints()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "regular-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.GetAsync("/api/admin/users");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminUser_CanListUsers()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsAdminAsync(client, "admin@plan2space.dev"); // test helper promoting role in DB
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.GetAsync("/api/admin/users");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Admin_SeesEveryUsersProjectsAndJobs_WithoutPasswordHashes()
    {
        var owner = _factory.CreateClient();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsync(owner, "admin-view-owner@plan2space.dev"));
        var project = await _factory.CreateProjectAsync(owner, "Someone's house");
        var fileId = await _factory.UploadFixtureFileAsync(owner, project.Id, "fixtures/blank.png");
        await owner.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });

        var admin = _factory.CreateClient();
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsAdminAsync(admin, "admin-view@plan2space.dev"));

        var users = await admin.GetStringAsync("/api/admin/users");
        Assert.Contains("admin-view-owner@plan2space.dev", users);
        Assert.DoesNotContain("passwordHash", users, StringComparison.OrdinalIgnoreCase);
        var projects = await admin.GetFromJsonAsync<JsonElement>("/api/admin/projects");
        var listed = projects.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == project.Id);
        Assert.Equal("admin-view-owner@plan2space.dev", listed.GetProperty("ownerEmail").GetString());
        var jobs = await admin.GetFromJsonAsync<JsonElement>("/api/admin/jobs");
        Assert.Contains(jobs.EnumerateArray(), j => j.GetProperty("projectId").GetGuid() == project.Id);
    }

    [Fact]
    public async Task Unauthenticated_Returns401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/admin/jobs")).StatusCode);
    }

    [Fact]
    public async Task AdminAccount_IsBootstrappedFromConfiguration()
    {
        // No UI can create the first admin; deployments set Admin:Email / Admin:Password.
        var email = $"bootstrap-{Guid.NewGuid():N}@plan2space.dev";
        var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Admin:Email", email);
            b.UseSetting("Admin:Password", "B00tstrap!Pass");
        });
        var client = host.CreateClient();

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "B00tstrap!Pass" });
        login.EnsureSuccessStatusCode();
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/users")).StatusCode);
    }
}
