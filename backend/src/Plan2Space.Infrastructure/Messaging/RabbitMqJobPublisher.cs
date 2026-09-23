using System.Text;
using System.Text.Json;
using Plan2Space.Application.Ai;
using RabbitMQ.Client;

namespace Plan2Space.Infrastructure.Messaging;

public class RabbitMqJobPublisher : IJobPublisher, IDisposable
{
    public const string QueueName = "ai.vectorize.jobs";

    private readonly IConnection _connection;
    private readonly IModel _channel;
    private readonly object _publishLock = new();   // IModel is not thread-safe

    public RabbitMqJobPublisher(string host, int port, string user, string pass)
    {
        var factory = new ConnectionFactory { HostName = host, Port = port, UserName = user, Password = pass };
        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();
        _channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false);
    }

    public Task PublishVectorizeJobAsync(Guid jobId, Guid projectId, string fileObjectKey, CancellationToken ct)
    {
        // Exact shape the Celery consumer (Task 9) reads.
        var payload = JsonSerializer.Serialize(new
        {
            job_id = jobId.ToString(),
            project_id = projectId.ToString(),
            file_object_key = fileObjectKey
        });
        var body = Encoding.UTF8.GetBytes(payload);
        lock (_publishLock)
        {
            var props = _channel.CreateBasicProperties();
            props.Persistent = true;
            props.ContentType = "application/json";
            _channel.BasicPublish(exchange: "", routingKey: QueueName, basicProperties: props, body: body);
        }
        return Task.CompletedTask;
    }

    public void Dispose() { _channel.Dispose(); _connection.Dispose(); }
}
