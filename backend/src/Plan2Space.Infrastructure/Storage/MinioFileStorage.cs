using Minio;
using Minio.DataModel.Args;
using Plan2Space.Application.Files;

namespace Plan2Space.Infrastructure.Storage;

public class MinioFileStorage : IFileStorage
{
    public const string Bucket = "plan2space-uploads";

    private readonly IMinioClient _client;
    private readonly SemaphoreSlim _bucketLock = new(1, 1);
    private bool _bucketReady;

    public MinioFileStorage(string endpoint, string accessKey, string secretKey)
    {
        _client = new MinioClient()
            .WithEndpoint(endpoint)
            .WithCredentials(accessKey, secretKey)
            .WithSSL(false)
            .Build();
    }

    public async Task PutObjectAsync(string objectKey, Stream data, long size, string contentType, CancellationToken ct)
    {
        await EnsureBucketAsync(ct);
        await _client.PutObjectAsync(new PutObjectArgs()
            .WithBucket(Bucket)
            .WithObject(objectKey)
            .WithStreamData(data)
            .WithObjectSize(size)
            .WithContentType(contentType), ct);
    }

    private async Task EnsureBucketAsync(CancellationToken ct)
    {
        if (_bucketReady) return;
        await _bucketLock.WaitAsync(ct);
        try
        {
            if (!await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(Bucket), ct))
                await _client.MakeBucketAsync(new MakeBucketArgs().WithBucket(Bucket), ct);
            _bucketReady = true;
        }
        finally { _bucketLock.Release(); }
    }
}
