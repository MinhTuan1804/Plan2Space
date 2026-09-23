using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Projects.Queries;

public record ListProjectsQuery(Guid RequestingUserId) : IRequest<List<ProjectDto>>;

public class ListProjectsHandler : IRequestHandler<ListProjectsQuery, List<ProjectDto>>
{
    private readonly IPlan2SpaceDbContext _db;
    public ListProjectsHandler(IPlan2SpaceDbContext db) => _db = db;

    public async Task<List<ProjectDto>> Handle(ListProjectsQuery q, CancellationToken ct) =>
        await _db.Projects.Where(p => p.OwnerId == q.RequestingUserId)
            .Select(p => new ProjectDto(p.Id, p.Name, p.CreatedAt, p.UpdatedAt))
            .ToListAsync(ct);
}
