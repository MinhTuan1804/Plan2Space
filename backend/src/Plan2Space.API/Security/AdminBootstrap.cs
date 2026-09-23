using Microsoft.EntityFrameworkCore;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.API.Security;

// Nothing in the product can create the first admin, so a deployment names one in configuration
// (Admin__Email, optionally Admin__Password to create the account). Runs once at startup.
public static class AdminBootstrap
{
    public static async Task EnsureAdminAsync(IServiceProvider services, IConfiguration config)
    {
        var email = config["Admin:Email"];
        if (string.IsNullOrWhiteSpace(email)) return;

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null)
        {
            var password = config["Admin:Password"];
            if (string.IsNullOrEmpty(password)) return;   // promote-only mode: account must register first
            user = new User { Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(password) };
            db.Users.Add(user);
        }
        user.Role = "Admin";
        await db.SaveChangesAsync();
    }
}
