using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.Application.Export;

// Wraps the ai-service's internal POST /export (Trimesh-based mesh export).
public interface IAiExportClient
{
    Task<byte[]> ExportAsync(GeometryDto geometry, string format, CancellationToken ct);
}

public class ExportUnavailableException : Exception
{
    public ExportUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

// The exporter refused the plan (e.g. no walls).
public class ExportRejectedException : Exception
{
    public ExportRejectedException(string message) : base(message) { }
}

public static class ExportFormats
{
    // format -> (file extension, content type).
    public static readonly IReadOnlyDictionary<string, (string Extension, string ContentType)> Mesh =
        new Dictionary<string, (string, string)>
        {
            ["gltf"] = ("gltf", "model/gltf+json"),
            ["glb"] = ("glb", "model/gltf-binary"),
            ["obj"] = ("obj", "model/obj"),
        };
}
