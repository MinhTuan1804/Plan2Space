namespace Plan2Space.Application.Files;

public interface IFileStorage
{
    Task PutObjectAsync(string objectKey, Stream data, long size, string contentType, CancellationToken ct);
    Task<Stream> GetObjectAsync(string objectKey, CancellationToken ct);
}
