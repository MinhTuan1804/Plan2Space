using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Queries;

public record FileContent(Stream Content, string ContentType);

public record GetFileContentQuery(Guid ProjectId, Guid RequestingUserId, Guid FileId) : IRequest<FileContent>;

public class GetFileContentHandler : IRequestHandler<GetFileContentQuery, FileContent>
{
    private readonly IPlan2SpaceDbContext _db;
    private readonly IFileStorage _storage;
    public GetFileContentHandler(IPlan2SpaceDbContext db, IFileStorage storage) { _db = db; _storage = storage; }

    public async Task<FileContent> Handle(GetFileContentQuery q, CancellationToken ct)
    {
        // Only images are served: the editor draws them under the plan; nothing else needs a download.
        var file = await _db.ProjectFiles.AsNoTracking()
            .Where(f => f.Id == q.FileId && f.ProjectId == q.ProjectId && f.Kind == FileKind.RasterImage
                        && f.Project.OwnerId == q.RequestingUserId)
            .FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException();

        var contentType = file.MinioObjectKey.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
        return new FileContent(await _storage.GetObjectAsync(file.MinioObjectKey, ct), contentType);
    }
}
