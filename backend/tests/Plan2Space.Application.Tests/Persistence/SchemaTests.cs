// backend/tests/Plan2Space.Application.Tests/Persistence/SchemaTests.cs
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;
using Xunit;

public class SchemaTests
{
    private static Plan2SpaceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<Plan2SpaceDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=5433;Database=p2s_test;Username=p2s;Password=change_me_dev_only",
                o => o.UseNetTopologySuite())
            .Options;
        return new Plan2SpaceDbContext(options);
    }

    [Fact]
    public async Task CanInsertProjectWithWallGeometry()
    {
        await using var db = CreateContext();
        await db.Database.MigrateAsync();

        // Unique email per run: Users.Email has a unique index and the test DB persists between runs.
        var user = new User { Email = $"test-{Guid.NewGuid():N}@plan2space.dev", PasswordHash = "hash" };
        var project = new Project { Name = "Test House", Owner = user };
        var wall = new Wall
        {
            Project = project,
            Geometry = new LineString(new[] { new Coordinate(0, 0), new Coordinate(5, 0) }),
            ThicknessMeters = 0.2,
            HeightMeters = 2.8,
            Version = 1
        };
        db.Users.Add(user);
        db.Projects.Add(project);
        db.Walls.Add(wall);
        await db.SaveChangesAsync();

        var saved = await db.Walls.FirstAsync(w => w.Id == wall.Id);
        Assert.Equal(5.0, saved.Geometry.Length, 3);
    }
}
