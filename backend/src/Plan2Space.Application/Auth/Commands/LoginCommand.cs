using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Auth.Commands;

public record LoginResult(string AccessToken, string RefreshToken, int ExpiresIn);
public record LoginCommand(string Email, string Password) : IRequest<LoginResult>;

public class LoginHandler : IRequestHandler<LoginCommand, LoginResult>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IJwtTokenService _jwt;
    public LoginHandler(IPlan2SpaceDbContext db, IJwtTokenService jwt) { _db = db; _jwt = jwt; }

    public async Task<LoginResult> Handle(LoginCommand cmd, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == cmd.Email, ct)
            ?? throw new UnauthorizedAccessException("Invalid credentials");
        if (!BCrypt.Net.BCrypt.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        return new LoginResult(_jwt.GenerateAccessToken(user), _jwt.GenerateRefreshToken(), 1800);
    }
}
