using MediatR;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Auth.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;
    public AuthController(IMediator mediator) => _mediator = mediator;

    public record RegisterRequest(string Email, string Password);
    public record LoginRequest(string Email, string Password);

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        try
        {
            var id = await _mediator.Send(new RegisterUserCommand(req.Email, req.Password));
            return Created($"/api/users/{id}", new { userId = id, email = req.Email });
        }
        catch (InvalidOperationException) { return Conflict(new { error = "Email already registered" }); }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        try
        {
            var result = await _mediator.Send(new LoginCommand(req.Email, req.Password));
            return Ok(new { accessToken = result.AccessToken, refreshToken = result.RefreshToken, expiresIn = result.ExpiresIn });
        }
        catch (UnauthorizedAccessException) { return Unauthorized(new { error = "Invalid credentials" }); }
    }
}
