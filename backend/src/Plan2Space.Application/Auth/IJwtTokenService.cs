using Plan2Space.Domain.Entities;
namespace Plan2Space.Application.Auth;

public interface IJwtTokenService
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken();
}
