using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Geometry;

public class RoomOverlapDetector
{
    public List<(Guid RoomAId, Guid RoomBId)> FindOverlaps(IEnumerable<Room> rooms)
    {
        var list = rooms.ToList();
        var result = new List<(Guid, Guid)>();
        for (int i = 0; i < list.Count; i++)
        for (int j = i + 1; j < list.Count; j++)
        {
            var intersection = list[i].Geometry.Intersection(list[j].Geometry);
            // Shared edges/points have zero area; only a genuine area overlap counts.
            if (!intersection.IsEmpty && intersection.Area > 1e-6)
                result.Add((list[i].Id, list[j].Id));
        }
        return result;
    }
}
