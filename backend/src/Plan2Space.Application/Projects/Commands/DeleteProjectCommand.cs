using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Projects.Commands;

public record DeleteProjectCommand(Guid ProjectId, Guid RequestingUserId) : IRequest<bool>;

public class DeleteProjectHandler : IRequestHandler<DeleteProjectCommand, bool>
{
    private readonly IPlan2SpaceDbContext _db;
    public DeleteProjectHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<bool> Handle(DeleteProjectCommand cmd, CancellationToken ct)
    {
        var p = await _db.Projects.FirstOrDefaultAsync(x => x.Id == cmd.ProjectId && x.OwnerId == cmd.RequestingUserId, ct);
        if (p is null) return false;
        _db.Projects.Remove(p);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
