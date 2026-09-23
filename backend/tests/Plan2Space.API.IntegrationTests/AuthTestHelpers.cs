// backend/tests/Plan2Space.API.IntegrationTests/AuthTestHelpers.cs
using System.Net.Http.Json;

public static class AuthTestHelpers
{
    // Registers (ignoring "already registered") then logs in; returns the access token.
    public static async Task<string> RegisterAndLoginAsync(
        this Plan2SpaceWebApplicationFactory _, HttpClient client, string email, string password = "Str0ngPass!123")
    {
        await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<TokenBody>();
        return body!.AccessToken;
    }

    private record TokenBody(string AccessToken);
}
