// backend/tests/Plan2Space.API.IntegrationTests/FileContentTests.cs
using System.Net;
using System.Net.Http.Headers;
using Xunit;

public class FileContentTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public FileContentTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<HttpClient> UserAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await _factory.RegisterAndLoginAsync(client, email));
        return client;
    }

    [Fact]
    public async Task UploadedImage_IsServedBackToItsOwner()
    {
        var client = await UserAsync("content-owner@plan2space.dev");
        var project = await _factory.CreateProjectAsync(client, "Content");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        var res = await client.GetAsync($"/api/projects/{project.Id}/files/{fileId}/content");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("image/png", res.Content.Headers.ContentType?.MediaType);
        var expected = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "fixtures/blank.png"));
        Assert.Equal(expected, await res.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task AnotherUser_CannotReadTheImage()
    {
        var owner = await UserAsync("content-private@plan2space.dev");
        var project = await _factory.CreateProjectAsync(owner, "Private");
        var fileId = await _factory.UploadFixtureFileAsync(owner, project.Id, "fixtures/blank.png");
        var stranger = await UserAsync("content-stranger@plan2space.dev");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{project.Id}/files/{fileId}/content")).StatusCode);
    }

    [Fact]
    public async Task AFileOfAnotherProject_IsNotServedUnderThisOne()
    {
        var client = await UserAsync("content-two-projects@plan2space.dev");
        var a = await _factory.CreateProjectAsync(client, "A");
        var b = await _factory.CreateProjectAsync(client, "B");
        var fileOfA = await _factory.UploadFixtureFileAsync(client, a.Id, "fixtures/blank.png");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{b.Id}/files/{fileOfA}/content")).StatusCode);
    }
}
