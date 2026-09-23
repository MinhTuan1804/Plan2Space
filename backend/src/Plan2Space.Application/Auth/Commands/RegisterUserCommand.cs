using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Auth.Commands;

public record RegisterUserCommand(string Email, string Password) : IRequest<Guid>;

public class RegisterUserHandler : IRequestHandler<RegisterUserCommand, Guid>
{
    private readonly IPlan2SpaceDbContext _db;
    public RegisterUserHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<Guid> Handle(RegisterUserCommand cmd, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == cmd.Email, ct))
            throw new InvalidOperationException("Email already registered");

        var user = new User
        {
            Email = cmd.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.Password)
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user.Id;
    }
}
