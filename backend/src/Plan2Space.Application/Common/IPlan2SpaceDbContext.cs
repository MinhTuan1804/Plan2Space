using Microsoft.EntityFrameworkCore;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Common;

// Application-layer view of the database; implemented by Infrastructure's Plan2SpaceDbContext
// so handlers don't reference Infrastructure (which already references Application).
public interface IPlan2SpaceDbContext
{
    DbSet<User> Users { get; }
    DbSet<Project> Projects { get; }
    DbSet<ProjectFile> ProjectFiles { get; }
    DbSet<AiJob> AiJobs { get; }
    DbSet<Wall> Walls { get; }
    DbSet<Room> Rooms { get; }
    DbSet<Opening> Openings { get; }
    DbSet<Asset3D> Assets3D { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
