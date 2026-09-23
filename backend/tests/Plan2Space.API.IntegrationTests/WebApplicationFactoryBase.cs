// backend/tests/Plan2Space.API.IntegrationTests/WebApplicationFactoryBase.cs
using Microsoft.AspNetCore.Hosting;
using Minio;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Plan2Space.Infrastructure.Persistence;
using StackExchange.Redis;
using Testcontainers.Minio;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Testcontainers.Redis;
using Xunit;

// Backing containers (PostGIS, Redis, RabbitMQ, MinIO) are started once per test run and shared by
// every test class; each class still gets its own in-memory API host. Reused by every
// *.API.IntegrationTests file.
public class Plan2SpaceWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JwtSecret = "integration_test_secret_at_least_32_chars!";
    public const string InternalToken = "integration_test_internal_token";
    public const string RabbitUser = "p2s";
    public const string RabbitPass = "p2s";
    private const string MinioUser = "p2s_minio";
    private const string MinioPass = "p2s_minio_secret";

    private static readonly SemaphoreSlim InitLock = new(1, 1);
    private static bool _initialized;

    private static readonly PostgreSqlContainer Postgres = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4-alpine")
        .WithDatabase("p2s_it").WithUsername("p2s").WithPassword("p2s")
        .Build();

    private static readonly RedisContainer Redis = new RedisBuilder().WithImage("redis:7.2-alpine").Build();

    private static readonly RabbitMqContainer Rabbit = new RabbitMqBuilder()
        .WithImage("rabbitmq:3.13-management-alpine")
        .WithUsername(RabbitUser).WithPassword(RabbitPass)
        .Build();

    private static readonly MinioContainer Minio = new MinioBuilder()
        .WithImage("quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z")
        .WithUsername(MinioUser).WithPassword(MinioPass)
        .Build();

    public string ConnectionString => Postgres.GetConnectionString();
    public string RedisConnectionString => Redis.GetConnectionString();
    public int RabbitPort => Rabbit.GetMappedPublicPort(5672);
    public string RabbitHost => Rabbit.Hostname;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:Secret", JwtSecret);
        builder.UseSetting("Internal:ServiceToken", InternalToken);
        builder.UseSetting("Redis:ConnectionString", RedisConnectionString);
        builder.UseSetting("RabbitMq:Host", RabbitHost);
        builder.UseSetting("RabbitMq:Port", RabbitPort.ToString());
        builder.UseSetting("RabbitMq:User", RabbitUser);
        builder.UseSetting("RabbitMq:Pass", RabbitPass);
        builder.UseSetting("Minio:Endpoint", $"{Minio.Hostname}:{Minio.GetMappedPublicPort(9000)}");
        builder.UseSetting("Minio:AccessKey", MinioUser);
        builder.UseSetting("Minio:SecretKey", MinioPass);
        // Many tests share one host and one client IP; RateLimitingTests re-applies the spec's limits.
        builder.UseSetting("RateLimiting:PerUserPerMinute", "100000");
        builder.UseSetting("RateLimiting:AiJobsPerHour", "100000");
        builder.UseSetting("RateLimiting:AiCallsPerMinute", "100000");
        builder.UseSetting("RateLimiting:AuthPerMinute", "100000");
    }

    public async Task InitializeAsync()
    {
        await InitLock.WaitAsync();
        try
        {
            if (_initialized) return;
            await Task.WhenAll(Postgres.StartAsync(), Redis.StartAsync(), Rabbit.StartAsync(), Minio.StartAsync());
            using var scope = Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<Plan2SpaceDbContext>().Database.MigrateAsync();
            _initialized = true;
        }
        finally { InitLock.Release(); }
    }

    // Simulates a Celery worker (Task 9): persist current state, then publish the live update.
    public async Task SetJobProgressInRedisAsync(Guid jobId, string status, int percent)
    {
        await using var redis = await ConnectionMultiplexer.ConnectAsync(RedisConnectionString);
        var value = $"{status}|{percent}";
        await redis.GetDatabase().StringSetAsync($"job:{jobId}:progress", value);
        await redis.GetSubscriber().PublishAsync(RedisChannel.Literal($"job:{jobId}:updates"), value);
    }

    // Reads an object back from the test MinIO (bucket used by MinioFileStorage); null if it doesn't exist.
    public async Task<byte[]?> TryReadStoredObjectAsync(string objectKey)
    {
        var client = new Minio.MinioClient()
            .WithEndpoint($"{Minio.Hostname}:{Minio.GetMappedPublicPort(9000)}")
            .WithCredentials(MinioUser, MinioPass).WithSSL(false).Build();
        using var buffer = new MemoryStream();
        try
        {
            await client.GetObjectAsync(new Minio.DataModel.Args.GetObjectArgs()
                .WithBucket(Plan2Space.Infrastructure.Storage.MinioFileStorage.Bucket).WithObject(objectKey)
                .WithCallbackStream(s => s.CopyTo(buffer)));
        }
        catch (Minio.Exceptions.MinioException) { return null; }
        return buffer.ToArray();
    }

    // Simulates a worker reporting why a job failed (Task 12's report_error).
    public async Task SetJobErrorInRedisAsync(Guid jobId, string message)
    {
        await using var redis = await ConnectionMultiplexer.ConnectAsync(RedisConnectionString);
        await redis.GetDatabase().StringSetAsync($"job:{jobId}:error", message);
    }

    // Containers are shared across classes and reaped by Testcontainers' resource reaper at process exit.
    public new Task DisposeAsync() => base.DisposeAsync().AsTask();
}
