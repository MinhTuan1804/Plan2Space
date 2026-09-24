using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Plan2Space.API.Middleware;

public static class RateLimitPolicies
{
    public const string AiJobs = "ai-jobs";               // POST /api/ai/vectorize
    public const string AiTriggering = "ai-triggering";   // co-pilot, staging, export (each calls the ai-service)
    public const string Auth = "auth";                    // login / register
}

// Spec security table: "100 req/min per user, 5 AI jobs/hour". Every limit is per signed-in user
// (per client IP when anonymous), so one client can't exhaust everybody's budget. Values are configurable.
public static class RateLimitingSetup
{
    public static IServiceCollection AddPlan2SpaceRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        int Setting(string key, int fallback) => config.GetValue($"RateLimiting:{key}", fallback);
        var perUserPerMinute = Setting("PerUserPerMinute", 100);
        var aiJobsPerHour = Setting("AiJobsPerHour", 5);
        var aiCallsPerMinute = Setting("AiCallsPerMinute", 10);
        var authPerMinute = Setting("AuthPerMinute", 10);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
                await context.HttpContext.Response.WriteAsJsonAsync(
                    new { message = "Too many requests — please wait a moment and try again." }, ct);
            };

            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                // The AI worker's service-to-service calls are authenticated separately and not user traffic.
                ctx.Request.Path.StartsWithSegments("/internal")
                    ? RateLimitPartition.GetNoLimiter("internal")
                    : Window(PartitionKey(ctx), perUserPerMinute, TimeSpan.FromMinutes(1)));

            options.AddPolicy(RateLimitPolicies.AiJobs, ctx => Window(PartitionKey(ctx), aiJobsPerHour, TimeSpan.FromHours(1)));
            options.AddPolicy(RateLimitPolicies.AiTriggering, ctx => Window(PartitionKey(ctx), aiCallsPerMinute, TimeSpan.FromMinutes(1)));
            options.AddPolicy(RateLimitPolicies.Auth, ctx => Window("ip:" + ClientIp(ctx), authPerMinute, TimeSpan.FromMinutes(1)));
        });
        return services;
    }

    private static RateLimitPartition<string> Window(string key, int permits, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = window,
            QueueLimit = 0,
        });

    private static string PartitionKey(HttpContext ctx) =>
        ctx.User.FindFirst("sub")?.Value is { } userId ? "user:" + userId : "ip:" + ClientIp(ctx);

    // Behind nginx this is the real client address (UseForwardedHeaders runs first).
    private static string ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
