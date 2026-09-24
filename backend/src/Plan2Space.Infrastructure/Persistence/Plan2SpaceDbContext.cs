using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Infrastructure.Persistence;

public class Plan2SpaceDbContext : DbContext, IPlan2SpaceDbContext
{
    public Plan2SpaceDbContext(DbContextOptions<Plan2SpaceDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectFile> ProjectFiles => Set<ProjectFile>();
    public DbSet<AiJob> AiJobs => Set<AiJob>();
    public DbSet<Wall> Walls => Set<Wall>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Opening> Openings => Set<Opening>();
    public DbSet<Asset3D> Assets3D => Set<Asset3D>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("postgis");

        b.Entity<User>().HasIndex(u => u.Email).IsUnique();

        b.Entity<Project>().Property(p => p.GeometryVersion).IsConcurrencyToken();

        b.Entity<Wall>().Property(w => w.Geometry).HasColumnType("geometry (LineString)");
        b.Entity<Wall>().Property(w => w.Version).IsConcurrencyToken();

        b.Entity<Room>().Property(r => r.Geometry).HasColumnType("geometry (Polygon)");
        b.Entity<Room>().Property(r => r.Version).IsConcurrencyToken();

        b.Entity<Opening>().Property(o => o.Position).HasColumnType("geometry (Point)");
        b.Entity<Opening>().Property(o => o.Version).IsConcurrencyToken();

        b.Entity<Project>().HasMany(p => p.Walls).WithOne(w => w.Project).HasForeignKey(w => w.ProjectId);
        b.Entity<Project>().HasMany(p => p.Rooms).WithOne(r => r.Project).HasForeignKey(r => r.ProjectId);
        b.Entity<Project>().HasMany(p => p.Openings).WithOne(o => o.Project).HasForeignKey(o => o.ProjectId);
        b.Entity<Project>().HasMany(p => p.Files).WithOne(f => f.Project).HasForeignKey(f => f.ProjectId);
    }
}
