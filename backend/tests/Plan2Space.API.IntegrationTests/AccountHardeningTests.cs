// backend/tests/Plan2Space.API.IntegrationTests/AccountHardeningTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Xunit;

// Final review I6: registration validation/normalisation and a safe admin bootstrap.
public class AccountHardeningTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public AccountHardeningTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private static string Unique(string name) => $"{name}-{Guid.NewGuid():N}@Plan2Space.dev";

    [Fact]
    public async Task Emails_AreCaseAndWhitespaceInsensitive()
    {
        var client = _factory.CreateClient();
        var email = Unique("Mixed.Case");

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/auth/register", new { email = $"  {email} ", password = "Str0ngPass!123" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/auth/register", new { email = email.ToUpperInvariant(), password = "Str0ngPass!123" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email = email.ToLowerInvariant(), password = "Str0ngPass!123" })).StatusCode);
    }

    [Theory]
    [InlineData("not-an-email", "Str0ngPass!123")]
    [InlineData("", "Str0ngPass!123")]
    [InlineData("valid@plan2space.dev", "")]
    [InlineData("valid@plan2space.dev", "short")]
    public async Task InvalidEmailOrWeakPassword_Returns400(string email, string password)
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task ConcurrentRegistrationsOfOneEmail_GiveOneAccountAndConflicts_NotServerErrors()
    {
        var email = Unique("race");
        var client = _factory.CreateClient();
        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ =>
            client.PostAsJsonAsync("/api/auth/register", new { email, password = "Str0ngPass!123" })));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.All(results.Where(r => r.StatusCode != HttpStatusCode.Created), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    private async Task<HttpStatusCode> AdminEndpointStatusAsync(HttpClient client, string email, string password)
    {
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (await client.GetAsync("/api/admin/users")).StatusCode;
    }

    [Fact]
    public async Task AdminEmailWithoutPassword_PromotesNobody()
    {
        // Otherwise whoever registers the configured address first becomes admin at the next restart.
        var email = Unique("squatter");
        await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password = "Squatter!123" });

        var host = _factory.WithWebHostBuilder(b => b.UseSetting("Admin:Email", email));
        Assert.Equal(HttpStatusCode.Forbidden, await AdminEndpointStatusAsync(host.CreateClient(), email, "Squatter!123"));
    }

    [Fact]
    public async Task ExistingAccount_IsPromotedOnlyWhenItsPasswordMatchesTheConfiguredOne()
    {
        var email = Unique("preexisting");
        await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password = "Someone!Else1" });

        var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Admin:Email", email);
            b.UseSetting("Admin:Password", "The-Real-Admin-Pass1");
        });
        Assert.Equal(HttpStatusCode.Forbidden, await AdminEndpointStatusAsync(host.CreateClient(), email, "Someone!Else1"));
    }
}
