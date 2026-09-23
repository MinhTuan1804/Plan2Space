// backend/tests/Plan2Space.Application.Tests/Geometry/RoomOverlapDetectorTests.cs
using NetTopologySuite.Geometries;
using Plan2Space.Application.Geometry;
using Plan2Space.Domain.Entities;
using Xunit;

public class RoomOverlapDetectorTests
{
    private static Polygon Square(double x, double y, double size)
    {
        var factory = new GeometryFactory();
        return factory.CreatePolygon(new[]
        {
            new Coordinate(x, y), new Coordinate(x + size, y),
            new Coordinate(x + size, y + size), new Coordinate(x, y + size),
            new Coordinate(x, y)
        });
    }

    [Fact]
    public void TwoOverlappingRooms_AreFlagged()
    {
        var roomA = new Room { Id = Guid.NewGuid(), Geometry = Square(0, 0, 4) };
        var roomB = new Room { Id = Guid.NewGuid(), Geometry = Square(2, 0, 4) }; // overlaps roomA by 2x4

        var overlaps = new RoomOverlapDetector().FindOverlaps(new[] { roomA, roomB });

        Assert.Single(overlaps);
    }

    [Fact]
    public void TwoAdjacentNonOverlappingRooms_AreNotFlagged()
    {
        var roomA = new Room { Id = Guid.NewGuid(), Geometry = Square(0, 0, 4) };
        var roomB = new Room { Id = Guid.NewGuid(), Geometry = Square(4, 0, 4) }; // shares an edge only

        var overlaps = new RoomOverlapDetector().FindOverlaps(new[] { roomA, roomB });

        Assert.Empty(overlaps);
    }
}
