using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Application.Files;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Export.Commands;

public record ExportFile(byte[] Content, string ContentType, string FileName);
public record RequestExportCommand(Guid ProjectId, Guid RequestingUserId, string Format) : IRequest<ExportFile>;

public class RequestExportHandler : IRequestHandler<RequestExportCommand, ExportFile>
{
    private readonly IMediator _mediator;
    private readonly IAiExportClient _aiExportClient;
    private readonly IPlan2SpaceDbContext _db;
    private readonly IFileStorage _storage;

    public RequestExportHandler(IMediator mediator, IAiExportClient aiExportClient, IPlan2SpaceDbContext db, IFileStorage storage)
    { _mediator = mediator; _aiExportClient = aiExportClient; _db = db; _storage = storage; }

    public async Task<ExportFile> Handle(RequestExportCommand cmd, CancellationToken ct)
    {
        if (!ExportFormats.Supported.TryGetValue(cmd.Format, out var fmt))
            throw new ArgumentException($"Unsupported export format '{cmd.Format}'");

        var geometry = await _mediator.Send(new GetGeometryQuery(cmd.ProjectId, cmd.RequestingUserId), ct)
            ?? throw new KeyNotFoundException();
        var projectName = await _db.Projects.Where(p => p.Id == cmd.ProjectId).Select(p => p.Name).FirstAsync(ct);

        var bytes = await _aiExportClient.ExportAsync(geometry, cmd.Format, ct);

        // Keep the exported file so the Asset3D row points at a real object.
        var asset = new Asset3D { ProjectId = cmd.ProjectId, Format = cmd.Format };
        asset.MinioObjectKey = $"exports/{cmd.ProjectId}/{asset.Id}.{fmt.Extension}";
        using (var stream = new MemoryStream(bytes))
            await _storage.PutObjectAsync(asset.MinioObjectKey, stream, bytes.Length, fmt.ContentType, ct);
        _db.Assets3D.Add(asset);
        await _db.SaveChangesAsync(ct);

        return new ExportFile(bytes, fmt.ContentType, $"{FileNames.Slug(projectName)}.{fmt.Extension}");
    }
}

public static class FileNames
{
    public static string Slug(string name)
    {
        var chars = name.Trim().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray();
        var slug = string.Join("-", new string(chars).Split('-', StringSplitOptions.RemoveEmptyEntries));
        return slug.Length == 0 ? "plan2space-export" : slug;
    }
}
