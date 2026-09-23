// backend/tests/Plan2Space.API.IntegrationTests/ProjectTestHelpers.cs
using System.Net.Http.Json;

public record ProjectRef(Guid Id, string Name);

public static class ProjectTestHelpers
{
    // Creates a project with the client's current bearer token; reused by Tasks 6/9/21 tests.
    public static async Task<ProjectRef> CreateProjectAsync(
        this Plan2SpaceWebApplicationFactory _, HttpClient client, string name)
    {
        var res = await client.PostAsJsonAsync("/api/projects", new { name });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<ProjectRef>())!;
    }
}
