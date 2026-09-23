using Plan2Space.Application.Ai;
using StackExchange.Redis;

namespace Plan2Space.Infrastructure.Messaging;

// Workers (Celery, Task 9) write current state to key "job:{id}:progress" as "status|percent"
// AND publish to channel "job:{id}:updates" for live pushes. Reconnecting clients read the key
// first (catch-up), then receive further pushes — this is what satisfies the
// Review Focus reconnect requirement.
public class RedisJobProgressSubscriber : IJobProgressReader
{
    private readonly IConnectionMultiplexer _redis;
    public RedisJobProgressSubscriber(IConnectionMultiplexer redis) => _redis = redis;

    public async Task<(string Status, int Percent)?> GetCurrentStateAsync(Guid jobId)
    {
        var value = await _redis.GetDatabase().StringGetAsync($"job:{jobId}:progress");
        return value.IsNullOrEmpty ? null : TryParse(value.ToString());
    }

    public ISubscriber Subscriber => _redis.GetSubscriber();
    public RedisChannel ChannelFor(Guid jobId) => RedisChannel.Literal($"job:{jobId}:updates");

    public static (string Status, int Percent)? TryParse(string raw)
    {
        var parts = raw.Split('|');
        return parts.Length == 2 && int.TryParse(parts[1], out var pct) ? (parts[0], pct) : null;
    }

    // Accepts both the compose-style URL ("redis://redis:6379/0") and StackExchange's "host:port" form.
    public static string ToConfigurationString(string connectionString)
    {
        if (!connectionString.StartsWith("redis://", StringComparison.OrdinalIgnoreCase))
            return connectionString;
        var uri = new Uri(connectionString);
        var db = uri.AbsolutePath.Trim('/');
        var port = uri.Port > 0 ? uri.Port : 6379;
        return $"{uri.Host}:{port}" + (db.Length > 0 ? $",defaultDatabase={db}" : "");
    }
}
