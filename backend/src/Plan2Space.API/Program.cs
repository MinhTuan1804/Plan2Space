using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Plan2Space.Application.Auth;
using Plan2Space.Application.Common;
using Plan2Space.Infrastructure.Auth;
using Plan2Space.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret missing");

builder.Services.AddDbContext<Plan2SpaceDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default"), npg => npg.UseNetTopologySuite()));
builder.Services.AddScoped<IPlan2SpaceDbContext>(sp => sp.GetRequiredService<Plan2SpaceDbContext>());

builder.Services.AddSingleton<IJwtTokenService>(new JwtTokenService(jwtSecret));

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(Plan2Space.Application.Auth.Commands.RegisterUserCommand).Assembly));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;   // keep "sub"/"role" as issued; controllers read User.FindFirst("sub")
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            RoleClaimType = "role"
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddControllers();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program { }  // exposed for WebApplicationFactory<Program> in tests
