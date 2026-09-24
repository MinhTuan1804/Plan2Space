using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Projects.Queries;

public record ProjectDto(Guid Id, string Name, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public record GetProjectByIdQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<ProjectDto?>;

public class GetProjectByIdHandler : IRequestHandler<GetProjectByIdQuery, ProjectDto?>
{
    private readonly IPlan2SpaceDbContext _db;
    public GetProjectByIdHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<ProjectDto?> Handle(GetProjectByIdQuery q, CancellationToken ct)
    {
        var p = await _db.Projects.FirstOrDefaultAsync(x => x.Id == q.ProjectId && x.OwnerId == q.RequestingUserId, ct);
        return p is null ? null : new ProjectDto(p.Id, p.Name, p.CreatedAt, p.UpdatedAt);
    }
}
