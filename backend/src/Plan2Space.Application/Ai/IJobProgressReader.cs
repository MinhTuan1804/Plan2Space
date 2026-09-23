namespace Plan2Space.Application.Ai;

// Live job state written by the AI workers (Redis key "job:{id}:progress" = "Status|Percent").
public interface IJobProgressReader
{
    Task<(string Status, int Percent)?> GetCurrentStateAsync(Guid jobId);
}
