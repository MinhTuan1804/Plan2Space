using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Infrastructure.Messaging;

namespace Plan2Space.API.WebSockets;

public class JobProgressHub
{
    private readonly RedisJobProgressSubscriber _subscriber;
    public JobProgressHub(RedisJobProgressSubscriber subscriber) => _subscriber = subscriber;

    private static bool IsTerminal(string status) => status is "Completed" or "Failed";

    public async Task HandleAsync(HttpContext context, Guid jobId)
    {
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }

        var userId = Guid.Parse(context.User.FindFirst("sub")!.Value);
        var db = context.RequestServices.GetRequiredService<IPlan2SpaceDbContext>();
        var job = await db.AiJobs.AsNoTracking()
            .Where(j => j.Id == jobId && j.Project.OwnerId == userId)
            .Select(j => new { j.Status, j.ProgressPercent })
            .FirstOrDefaultAsync(context.RequestAborted);
        if (job is null) { context.Response.StatusCode = 404; return; }

        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var sendLock = new SemaphoreSlim(1, 1);
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        // Subscribe BEFORE reading the catch-up state so an update published in between is not lost
        // (a duplicate frame is harmless: every frame is the full current state).
        var queue = await _subscriber.Subscriber.SubscribeAsync(_subscriber.ChannelFor(jobId));
        try
        {
            // Catch-up: send whatever state already exists before waiting for pushes,
            // so a reconnecting client never blocks on a message it already missed.
            var current = await _subscriber.GetCurrentStateAsync(jobId) ?? (job.Status.ToString(), job.ProgressPercent);
            await SendAsync(socket, sendLock, current.Status, current.Percent);
            if (IsTerminal(current.Status))
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "job finished", CancellationToken.None);
                return;
            }

            queue.OnMessage(async message =>
            {
                if (RedisJobProgressSubscriber.TryParse(message.Message.ToString()) is not { } state) return;
                try { await SendAsync(socket, sendLock, state.Status, state.Percent); }
                catch (WebSocketException) { finished.TrySetResult(); return; }
                if (IsTerminal(state.Status)) finished.TrySetResult();
            });

            var clientClosed = WaitForClientCloseAsync(socket, context.RequestAborted);
            var first = await Task.WhenAny(finished.Task, clientClosed);
            if (first == finished.Task && socket.State == WebSocketState.Open)
            {
                await sendLock.WaitAsync();
                try { await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "job finished", CancellationToken.None); }
                finally { sendLock.Release(); }
            }
        }
        finally
        {
            await queue.UnsubscribeAsync();   // no leaked subscriptions when the client drops mid-job
        }
    }

    private static async Task WaitForClientCloseAsync(WebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[256];
        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close) return;
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
    }

    private static async Task SendAsync(WebSocket socket, SemaphoreSlim sendLock, string status, int percent)
    {
        var json = JsonSerializer.Serialize(new { status, progressPercent = percent });
        await sendLock.WaitAsync();
        try
        {
            if (socket.State == WebSocketState.Open)
                await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        finally { sendLock.Release(); }
    }
}
