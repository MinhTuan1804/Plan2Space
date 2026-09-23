// backend/tests/Plan2Space.API.IntegrationTests/AiJobFlowTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using Xunit;

public class AiJobFlowTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public AiJobFlowTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    private async Task<(HttpClient Client, string Token, ProjectRef Project)> AuthedProjectAsync(string email, string name)
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, email);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, token, await _factory.CreateProjectAsync(client, name));
    }

    private static async Task<Guid> EnqueueAsync(HttpClient client, Guid projectId, Guid fileId)
    {
        var enqueue = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId, fileId });
        Assert.Equal(HttpStatusCode.Accepted, enqueue.StatusCode);
        return (await enqueue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid();
    }

    private async Task<WebSocket> ConnectWsAsync(Guid jobId, string token)
    {
        var ws = _factory.Server.CreateWebSocketClient();
        // Browsers cannot set Authorization on a WebSocket handshake; the token rides in the query string.
        return await ws.ConnectAsync(new Uri(_factory.Server.BaseAddress, $"/ws/job/{jobId}?access_token={token}"), CancellationToken.None);
    }

    private static async Task<JsonElement> ReceiveJsonAsync(WebSocket socket)
    {
        var buffer = new byte[1024];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
        return JsonSerializer.Deserialize<JsonElement>(Encoding.UTF8.GetString(buffer, 0, result.Count));
    }

    [Fact]
    public async Task EnqueueJob_ReturnsJobId_AndStatusIsQueryable()
    {
        var (client, _, project) = await AuthedProjectAsync("ai-user@plan2space.dev", "AI Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        var jobId = await EnqueueAsync(client, project.Id, fileId);

        var status = await client.GetAsync($"/api/ai/job/{jobId}/status");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        var statusBody = await status.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Queued", statusBody.GetProperty("status").GetString());
    }

    [Fact]
    public async Task EnqueueJob_PublishesMessageInTheShapeTheWorkerReads()
    {
        var (client, _, project) = await AuthedProjectAsync("ai-msg@plan2space.dev", "Msg Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var jobId = await EnqueueAsync(client, project.Id, fileId);

        var cf = new ConnectionFactory
        {
            HostName = _factory.RabbitHost, Port = _factory.RabbitPort,
            UserName = Plan2SpaceWebApplicationFactory.RabbitUser, Password = Plan2SpaceWebApplicationFactory.RabbitPass
        };
        using var conn = cf.CreateConnection();
        using var channel = conn.CreateModel();
        JsonElement? mine = null;
        for (var i = 0; i < 50 && mine is null; i++)
        {
            var got = channel.BasicGet("ai.vectorize.jobs", autoAck: true);
            if (got is null) { await Task.Delay(100); continue; }
            var msg = JsonSerializer.Deserialize<JsonElement>(Encoding.UTF8.GetString(got.Body.Span));
            if (msg.GetProperty("job_id").GetString() == jobId.ToString()) mine = msg;
        }

        Assert.NotNull(mine);
        Assert.Equal(project.Id.ToString(), mine!.Value.GetProperty("project_id").GetString());
        Assert.StartsWith($"projects/{project.Id}/", mine.Value.GetProperty("file_object_key").GetString());
    }

    [Fact]
    public async Task WebSocket_ReconnectAfterProgressUpdate_ReceivesCurrentStateImmediately()
    {
        // Simulates the Review Focus scenario: client disconnects mid-job, reconnects,
        // and must catch up from the last known Redis-persisted state rather than
        // waiting indefinitely for a new pub/sub message it already missed.
        var (client, token, project) = await AuthedProjectAsync("ws-user@plan2space.dev", "WS Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var jobId = await EnqueueAsync(client, project.Id, fileId);

        // Simulate a worker having already pushed 40% progress to Redis before any client connects.
        await _factory.SetJobProgressInRedisAsync(jobId, "Running", 40);

        using var socket = await ConnectWsAsync(jobId, token);
        var msg = await ReceiveJsonAsync(socket);

        Assert.Equal(40, msg.GetProperty("progressPercent").GetInt32());
    }

    [Fact]
    public async Task WebSocket_ReceivesLiveUpdates_AndClosesWhenJobCompletes()
    {
        var (client, token, project) = await AuthedProjectAsync("ws-live@plan2space.dev", "WS Live");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var jobId = await EnqueueAsync(client, project.Id, fileId);

        using var socket = await ConnectWsAsync(jobId, token);
        var first = await ReceiveJsonAsync(socket);                       // catch-up frame (Queued, from DB)
        Assert.Equal("Queued", first.GetProperty("status").GetString());

        await _factory.SetJobProgressInRedisAsync(jobId, "Completed", 100);
        var done = await ReceiveJsonAsync(socket);
        Assert.Equal("Completed", done.GetProperty("status").GetString());

        var buffer = new byte[64];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var close = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
    }

    [Fact]
    public async Task JobStatus_ReflectsWorkerProgressFromRedis()
    {
        var (client, _, project) = await AuthedProjectAsync("ai-progress@plan2space.dev", "Progress");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var jobId = await EnqueueAsync(client, project.Id, fileId);

        await _factory.SetJobProgressInRedisAsync(jobId, "Running", 65);

        var body = await client.GetFromJsonAsync<JsonElement>($"/api/ai/job/{jobId}/status");
        Assert.Equal("Running", body.GetProperty("status").GetString());
        Assert.Equal(65, body.GetProperty("progressPercent").GetInt32());
    }

    [Fact]
    public async Task OtherUser_CannotEnqueueOrReadJob()
    {
        var (owner, _, project) = await AuthedProjectAsync("ai-owner@plan2space.dev", "Owned");
        var fileId = await _factory.UploadFixtureFileAsync(owner, project.Id, "fixtures/blank.png");
        var jobId = await EnqueueAsync(owner, project.Id, fileId);

        var (intruder, intruderToken, _) = await AuthedProjectAsync("ai-intruder@plan2space.dev", "Other");
        var enqueue = await intruder.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });
        Assert.Equal(HttpStatusCode.NotFound, enqueue.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.GetAsync($"/api/ai/job/{jobId}/status")).StatusCode);

        var ws = _factory.Server.CreateWebSocketClient();
        await Assert.ThrowsAnyAsync<Exception>(() =>
            ws.ConnectAsync(new Uri(_factory.Server.BaseAddress, $"/ws/job/{jobId}?access_token={intruderToken}"), CancellationToken.None));
    }

    [Fact]
    public async Task Upload_RejectsFileWhoseBytesDoNotMatchItsExtension()
    {
        var (client, _, project) = await AuthedProjectAsync("ai-upload@plan2space.dev", "Upload");
        var res = await ProjectTestHelpers.UploadFileAsync(client, project.Id, "fixtures/fake.png");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
