// backend/tests/Plan2Space.API.IntegrationTests/AuthTestHelpers.cs
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;

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

    // Registers, promotes the user to Admin directly in the database, then logs in (the token carries role=Admin).
    public static async Task<string> RegisterAndLoginAsAdminAsync(
        this Plan2SpaceWebApplicationFactory factory, HttpClient client, string email, string password = "Str0ngPass!123")
    {
        await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Plan2Space.Infrastructure.Persistence.Plan2SpaceDbContext>();
            var user = db.Users.Single(u => u.Email == email);
            user.Role = "Admin";
            await db.SaveChangesAsync();
        }
        return await factory.RegisterAndLoginAsync(client, email, password);
    }

    private record TokenBody(string AccessToken);
}
