using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Plan2Space.API.WebSockets;
using Plan2Space.Application.Ai;
using Plan2Space.Application.Auth;
using Plan2Space.Application.Common;
using Plan2Space.Application.Copilot;
using Plan2Space.Infrastructure.Copilot;
using Plan2Space.Application.Staging;
using Plan2Space.Infrastructure.Staging;
using Plan2Space.Application.Files;
using Plan2Space.Infrastructure.Auth;
using Plan2Space.Infrastructure.Messaging;
using Plan2Space.Infrastructure.Persistence;
using Plan2Space.Infrastructure.Storage;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

var jwtSecret = config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret missing");

builder.Services.AddDbContext<Plan2SpaceDbContext>(o =>
    o.UseNpgsql(config.GetConnectionString("Default"), npg => npg.UseNetTopologySuite()));
builder.Services.AddScoped<IPlan2SpaceDbContext>(sp => sp.GetRequiredService<Plan2SpaceDbContext>());

builder.Services.AddSingleton<IJwtTokenService>(new JwtTokenService(jwtSecret));

// Redis / RabbitMQ / MinIO clients connect lazily on first use, so the API boots even if one is still starting.
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(
    RedisJobProgressSubscriber.ToConfigurationString(config["Redis:ConnectionString"] ?? "localhost:6379")));
builder.Services.AddSingleton<RedisJobProgressSubscriber>();
builder.Services.AddSingleton<IJobProgressReader>(sp => sp.GetRequiredService<RedisJobProgressSubscriber>());
builder.Services.AddSingleton<IJobPublisher>(_ => new RabbitMqJobPublisher(
    config["RabbitMq:Host"] ?? "localhost",
    int.TryParse(config["RabbitMq:Port"], out var rabbitPort) ? rabbitPort : 5672,
    config["RabbitMq:User"] ?? "guest",
    config["RabbitMq:Pass"] ?? "guest"));
builder.Services.AddSingleton<IFileStorage>(_ => new MinioFileStorage(
    config["Minio:Endpoint"] ?? "localhost:9000",
    config["Minio:AccessKey"] ?? throw new InvalidOperationException("Minio:AccessKey missing"),
    config["Minio:SecretKey"] ?? throw new InvalidOperationException("Minio:SecretKey missing")));
builder.Services.AddSingleton<JobProgressHub>();
// Service-to-service clients for the ai-service (internal network, shared token).
void ConfigureAiClient(HttpClient c)
{
    c.BaseAddress = new Uri((config["Ai:InternalUrl"] ?? "http://ai:8000").TrimEnd('/') + "/");
    c.DefaultRequestHeaders.Add("X-Internal-Token", config["Internal:ServiceToken"] ?? "");
    c.Timeout = TimeSpan.FromSeconds(30);   // covers the co-pilot's LLM round-trip
}
builder.Services.AddHttpClient<ICopilotIntentClient, CopilotIntentHttpClient>(ConfigureAiClient);
builder.Services.AddHttpClient<IStagingClient, StagingHttpClient>(ConfigureAiClient);

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
        // Browsers cannot send an Authorization header on a WebSocket handshake.
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (ctx.Request.Path.StartsWithSegments("/ws") && ctx.Request.Query.TryGetValue("access_token", out var t))
                    ctx.Token = t;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddControllers();

var app = builder.Build();

if (config.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>().Database.MigrateAsync();
}

app.UseWebSockets();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Map("/ws/job/{jobId:guid}", (HttpContext ctx, Guid jobId, JobProgressHub hub) => hub.HandleAsync(ctx, jobId))
    .RequireAuthorization();
app.Run();

public partial class Program { }  // exposed for WebApplicationFactory<Program> in tests
