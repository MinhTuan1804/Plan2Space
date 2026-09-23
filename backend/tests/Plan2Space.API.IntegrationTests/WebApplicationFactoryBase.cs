// backend/tests/Plan2Space.API.IntegrationTests/WebApplicationFactoryBase.cs
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using Xunit;

// One PostGIS container per test class; reused by every *.API.IntegrationTests file.
public class Plan2SpaceWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JwtSecret = "integration_test_secret_at_least_32_chars!";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4-alpine")
        .WithDatabase("p2s_it")
        .WithUsername("p2s")
        .WithPassword("p2s")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:Secret", JwtSecret);
    }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>().Database.MigrateAsync();
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}
