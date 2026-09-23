using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Plan2Space.Infrastructure.Persistence;

// Lets `dotnet ef` build the context without booting the API host.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<Plan2SpaceDbContext>
{
    public Plan2SpaceDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
                 ?? "Host=127.0.0.1;Port=5433;Database=plan2space;Username=p2s;Password=change_me_dev_only";
        var options = new DbContextOptionsBuilder<Plan2SpaceDbContext>()
            .UseNpgsql(cs, o => o.UseNetTopologySuite())
            .Options;
        return new Plan2SpaceDbContext(options);
    }
}
