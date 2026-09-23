using System.Text.RegularExpressions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Auth.Commands;

public record RegisterUserCommand(string Email, string Password) : IRequest<Guid>;

public static class Credentials
{
    public const int MinPasswordLength = 8;
    private static readonly Regex EmailShape = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    // One account per address regardless of case/whitespace ("A@x.com" == " a@x.com ").
    public static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();

    public static void Validate(string email, string? password)
    {
        if (email.Length is 0 or > 254 || !EmailShape.IsMatch(email))
            throw new ArgumentException("Enter a valid email address.");
        if ((password ?? "").Length < MinPasswordLength || password!.Length > 128)
            throw new ArgumentException($"Password must be {MinPasswordLength}–128 characters.");
    }
}

public class RegisterUserHandler : IRequestHandler<RegisterUserCommand, Guid>
{
    private readonly IPlan2SpaceDbContext _db;
    public RegisterUserHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<Guid> Handle(RegisterUserCommand cmd, CancellationToken ct)
    {
        var email = Credentials.NormalizeEmail(cmd.Email);
        Credentials.Validate(email, cmd.Password);

        // ToLower() also matches accounts created before emails were normalised.
        if (await _db.Users.AnyAsync(u => u.Email.ToLower() == email, ct))
            throw new InvalidOperationException("Email already registered");

        var user = new User
        {
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.Password)
        };
        _db.Users.Add(user);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost a race with a concurrent registration of the same address (unique index)?
            if (await _db.Users.AnyAsync(u => u.Email == email, ct))
                throw new InvalidOperationException("Email already registered");
            throw;
        }
        return user.Id;
    }
}
