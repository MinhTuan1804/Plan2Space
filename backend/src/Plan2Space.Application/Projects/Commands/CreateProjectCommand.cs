using MediatR;
using Plan2Space.Application.Common;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Projects.Commands;

public record CreateProjectCommand(Guid OwnerId, string Name) : IRequest<Guid>;

public class CreateProjectHandler : IRequestHandler<CreateProjectCommand, Guid>
{
    private readonly IPlan2SpaceDbContext _db;
    public CreateProjectHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<Guid> Handle(CreateProjectCommand cmd, CancellationToken ct)
    {
        var project = new Project { Name = cmd.Name, OwnerId = cmd.OwnerId };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync(ct);
        return project.Id;
    }
}
