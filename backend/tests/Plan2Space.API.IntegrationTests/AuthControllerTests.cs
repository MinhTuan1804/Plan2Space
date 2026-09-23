// backend/tests/Plan2Space.API.IntegrationTests/AuthControllerTests.cs
using System.Net;
using System.Net.Http.Json;
using Xunit;

public class AuthControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly HttpClient _client;
    public AuthControllerTests(Plan2SpaceWebApplicationFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task RegisterThenLogin_ReturnsAccessToken()
    {
        var email = $"user{Guid.NewGuid():N}@plan2space.dev";
        var register = await _client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "Str0ngPass!123" });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var login = await _client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "Str0ngPass!123" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.False(string.IsNullOrEmpty(body!.AccessToken));
    }

    [Fact]
    public async Task Login_WithWrongPassword_Returns401()
    {
        var email = $"user{Guid.NewGuid():N}@plan2space.dev";
        await _client.PostAsJsonAsync("/api/auth/register", new { email, password = "Str0ngPass!123" });

        var login = await _client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong" });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var email = $"user{Guid.NewGuid():N}@plan2space.dev";
        await _client.PostAsJsonAsync("/api/auth/register", new { email, password = "Str0ngPass!123" });

        var again = await _client.PostAsJsonAsync("/api/auth/register", new { email, password = "Str0ngPass!123" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    private record LoginResponse(string AccessToken, string RefreshToken, int ExpiresIn);
}
