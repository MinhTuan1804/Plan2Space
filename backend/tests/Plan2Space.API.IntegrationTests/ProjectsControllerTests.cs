// backend/tests/Plan2Space.API.IntegrationTests/ProjectsControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class ProjectsControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public ProjectsControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task CreateThenGet_ReturnsProject()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "proj-owner@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var create = await client.PostAsJsonAsync("/api/projects", new { name = "My House" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ProjectDto>();

        var get = await client.GetAsync($"/api/projects/{created!.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var fetched = await get.Content.ReadFromJsonAsync<ProjectDto>();
        Assert.Equal("My House", fetched!.Name);
    }

    [Fact]
    public async Task OtherUser_CannotSeeOrDeleteProject()
    {
        var owner = _factory.CreateClient();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsync(owner, "owner-a@plan2space.dev"));
        var created = await (await owner.PostAsJsonAsync("/api/projects", new { name = "Private" }))
            .Content.ReadFromJsonAsync<ProjectDto>();

        var intruder = _factory.CreateClient();
        intruder.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            await _factory.RegisterAndLoginAsync(intruder, "intruder@plan2space.dev"));

        Assert.Equal(HttpStatusCode.NotFound, (await intruder.GetAsync($"/api/projects/{created!.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.DeleteAsync($"/api/projects/{created.Id}")).StatusCode);
        Assert.Empty((await intruder.GetFromJsonAsync<List<ProjectDto>>("/api/projects"))!);
    }

    [Fact]
    public async Task Unauthenticated_Returns401()
    {
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/projects")).StatusCode);
    }

    private record ProjectDto(Guid Id, string Name, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
}
