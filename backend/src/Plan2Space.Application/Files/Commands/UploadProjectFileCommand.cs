using System.Text;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Files.Commands;

public class FileValidationException : Exception
{
    public FileValidationException(string message) : base(message) { }
}

public record UploadedFileDto(Guid FileId, string Kind, long SizeBytes);

public record UploadProjectFileCommand(
    Guid ProjectId, Guid RequestingUserId, string FileName, long SizeBytes, Func<Stream> OpenStream)
    : IRequest<UploadedFileDto>;

public class UploadProjectFileHandler : IRequestHandler<UploadProjectFileCommand, UploadedFileDto>
{
    public const long MaxBytes = 60L * 1024 * 1024;

    private readonly IPlan2SpaceDbContext _db;
    private readonly IFileStorage _storage;
    public UploadProjectFileHandler(IPlan2SpaceDbContext db, IFileStorage storage) { _db = db; _storage = storage; }

    public async Task<UploadedFileDto> Handle(UploadProjectFileCommand cmd, CancellationToken ct)
    {
        if (!await _db.Projects.AnyAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct))
            throw new KeyNotFoundException();

        if (cmd.SizeBytes <= 0 || cmd.SizeBytes > MaxBytes)
            throw new FileValidationException("File must be between 1 byte and 60MB");

        var ext = Path.GetExtension(cmd.FileName).ToLowerInvariant();
        var (kind, contentType) = ext switch
        {
            ".png" => (FileKind.RasterImage, "image/png"),
            ".jpg" or ".jpeg" => (FileKind.RasterImage, "image/jpeg"),
            ".pdf" => (FileKind.Pdf, "application/pdf"),
            ".dxf" => (FileKind.Dxf, "application/dxf"),
            ".dwg" => (FileKind.Dwg, "application/acad"),
            _ => throw new FileValidationException($"Unsupported file type '{ext}'")
        };

        var header = new byte[64];
        int read;
        await using (var s = cmd.OpenStream())
            read = await s.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        if (!MagicBytesMatch(ext, header.AsSpan(0, read)))
            throw new FileValidationException($"File content does not match its '{ext}' extension");

        var fileId = Guid.NewGuid();
        var objectKey = $"projects/{cmd.ProjectId}/{fileId}{ext}";
        await using (var s = cmd.OpenStream())
            await _storage.PutObjectAsync(objectKey, s, cmd.SizeBytes, contentType, ct);

        _db.ProjectFiles.Add(new ProjectFile
        {
            Id = fileId, ProjectId = cmd.ProjectId, MinioObjectKey = objectKey, Kind = kind, SizeBytes = cmd.SizeBytes
        });
        await _db.SaveChangesAsync(ct);
        return new UploadedFileDto(fileId, kind.ToString(), cmd.SizeBytes);
    }

    private static bool MagicBytesMatch(string ext, ReadOnlySpan<byte> h) => ext switch
    {
        ".png" => h.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
        ".jpg" or ".jpeg" => h.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }),
        ".pdf" => h.StartsWith("%PDF"u8),
        ".dwg" => h.StartsWith("AC10"u8),
        // ASCII DXF opens with group code 0 + SECTION; binary DXF has a fixed sentinel.
        ".dxf" => h.StartsWith("AutoCAD Binary DXF"u8)
                  || Encoding.ASCII.GetString(h).TrimStart().StartsWith("0") && Encoding.ASCII.GetString(h).Contains("SECTION"),
        _ => false
    };
}
