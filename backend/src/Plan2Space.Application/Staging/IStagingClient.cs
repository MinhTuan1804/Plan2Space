namespace Plan2Space.Application.Staging;

// Position = item centre [x, y] in project-space metres.
public record StagingItem(string Item, double[] Position, double RotationDeg, double WidthM, double DepthM);

// Wraps the ai-service's internal POST /staging/suggest (constraint-based furniture placement).
public interface IStagingClient
{
    Task<List<StagingItem>> SuggestAsync(List<List<double>> roomPolygon, string roomLabel, CancellationToken ct);
}

public class StagingUnavailableException : Exception
{
    public StagingUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

// The AI service rejected the room (e.g. self-intersecting polygon).
public class StagingRejectedException : Exception
{
    public StagingRejectedException(string message) : base(message) { }
}
