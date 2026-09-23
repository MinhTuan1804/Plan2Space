// backend/tests/Plan2Space.API.IntegrationTests/ProjectTestHelpers.cs
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

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

    public static Task<HttpResponseMessage> UploadFileAsync(HttpClient client, Guid projectId, string fixturePath)
    {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, fixturePath));
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(file, "file", Path.GetFileName(fixturePath));
        return client.PostAsync($"/api/projects/{projectId}/files", content);
    }

    // Uploads a file from the test output's fixtures/ folder; returns the new ProjectFile id.
    public static async Task<Guid> UploadFixtureFileAsync(
        this Plan2SpaceWebApplicationFactory _, HttpClient client, Guid projectId, string fixturePath)
    {
        var res = await UploadFileAsync(client, projectId, fixturePath);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("fileId").GetGuid();
    }
}
