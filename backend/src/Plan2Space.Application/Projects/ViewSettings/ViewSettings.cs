using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Plan2Space.Application.Common;

namespace Plan2Space.Application.Projects.ViewSettings;

public record LocationDto(double Lat, double Lon);
public record SavedViewDto(string Name, int Level, double[] Position, double[] Target);

// How a project is presented: where the house stands, which way north is, and the viewpoints saved in 3D.
public record ViewSettingsDto(LocationDto Location, double NorthDeg, List<SavedViewDto> Views)
{
    public static ViewSettingsDto Default => new(new LocationDto(10.776, 106.700), 0, new List<SavedViewDto>());
    private const int MaxViews = 20;
    private const int MaxNameLength = 60;
    private const double MaxCoordinate = 10_000;

    public string? Validate()
    {
        if (Location is null || !double.IsFinite(Location.Lat) || Location.Lat is < -90 or > 90) return "Latitude must be between -90 and 90.";
        if (!double.IsFinite(Location.Lon) || Location.Lon is < -180 or > 180) return "Longitude must be between -180 and 180.";
        if (!double.IsFinite(NorthDeg) || NorthDeg is < 0 or > 360) return "North must be between 0 and 360 degrees.";
        if (Views is null || Views.Count > MaxViews) return $"At most {MaxViews} saved views.";
        foreach (var v in Views)
        {
            var name = v.Name?.Trim() ?? "";
            if (name.Length is 0 or > MaxNameLength) return $"A view needs a name of 1-{MaxNameLength} characters.";
            if (v.Level is < 0 or > 9) return "A view's level must be between 0 and 9.";
            foreach (var xyz in new[] { v.Position, v.Target })
                if (xyz is null || xyz.Length != 3 || xyz.Any(c => !double.IsFinite(c) || Math.Abs(c) > MaxCoordinate))
                    return "A view's position and target are three coordinates within ±10 000 m.";
        }
        return null;
    }
}

public class ViewSettingsValidationException(string message) : Exception(message);

internal static class ViewSettingsJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}

public record GetViewSettingsQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<ViewSettingsDto?>;

public class GetViewSettingsHandler(IPlan2SpaceDbContext db) : IRequestHandler<GetViewSettingsQuery, ViewSettingsDto?>
{
    public async Task<ViewSettingsDto?> Handle(GetViewSettingsQuery q, CancellationToken ct)
    {
        var project = await db.Projects.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == q.ProjectId && p.OwnerId == q.RequestingUserId, ct);
        if (project is null) return null;
        if (project.ViewSettings is null) return ViewSettingsDto.Default;
        try
        {
            var saved = JsonSerializer.Deserialize<ViewSettingsDto>(project.ViewSettings, ViewSettingsJson.Options);
            return saved is not null && saved.Validate() is null ? saved : ViewSettingsDto.Default;
        }
        catch (JsonException) { return ViewSettingsDto.Default; }
    }
}

// Returns false when the project is missing or someone else's.
public record SaveViewSettingsCommand(Guid ProjectId, Guid RequestingUserId, ViewSettingsDto Settings) : IRequest<bool>;

public class SaveViewSettingsHandler(IPlan2SpaceDbContext db) : IRequestHandler<SaveViewSettingsCommand, bool>
{
    public async Task<bool> Handle(SaveViewSettingsCommand c, CancellationToken ct)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == c.ProjectId && p.OwnerId == c.RequestingUserId, ct);
        if (project is null) return false;
        if (c.Settings.Validate() is { } error) throw new ViewSettingsValidationException(error);
        project.ViewSettings = JsonSerializer.Serialize(c.Settings, ViewSettingsJson.Options);
        await db.SaveChangesAsync(ct);
        return true;
    }
}
