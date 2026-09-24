using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Auth.Commands;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.API.Security;

// Nothing in the product can create the first admin, so a deployment names one in configuration
// (Admin__Email + Admin__Password). Runs once at startup. The configured password is the proof of ownership:
// a missing account is created with it, and an existing account is promoted only if it uses that password —
// otherwise whoever registered the configured address first would become admin.
public static class AdminBootstrap
{
    public static async Task EnsureAdminAsync(IServiceProvider services, IConfiguration config)
    {
        var email = Credentials.NormalizeEmail(config["Admin:Email"]);
        if (email.Length == 0) return;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(AdminBootstrap));
        var password = config["Admin:Password"];
        if (string.IsNullOrEmpty(password))
        {
            logger.LogWarning("Admin:Email is set but Admin:Password is not; no admin account was bootstrapped");
            return;
        }

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user is null)
        {
            user = new User { Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(password) };
            db.Users.Add(user);
        }
        else if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
        {
            logger.LogWarning("Account {Email} exists with a different password; not promoting it to Admin", email);
            return;
        }
        user.Role = "Admin";
        await db.SaveChangesAsync();
    }
}
