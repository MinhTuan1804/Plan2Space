namespace Plan2Space.Application.Geometry;

// Points are [x, y] in project-space metres; the polygon is closed.
public record DerivedRoom(List<double[]> Points, string Label);

// Wraps the ai-service's internal POST /rooms/derive: the same room finder the import uses.
public interface IRoomDerivationClient
{
    Task<List<DerivedRoom>> DeriveAsync(List<List<double[]>> walls, CancellationToken ct);
}

public class RoomDerivationUnavailableException : Exception
{
    public RoomDerivationUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}
