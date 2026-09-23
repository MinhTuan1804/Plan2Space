using Plan2Space.Application.Ai.Queries;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Ai;

public record AiJobOptions(TimeSpan JobTimeout);

// One place deciding what a job's state is: the final state the worker persisted in the AiJobs row wins;
// otherwise the live Redis progress; and a job still unfinished after JobTimeout is reported as Failed so
// clients stop waiting (the worker's hard time limit is minutes, so this only catches lost/crashed jobs).
public static class JobStatusResolver
{
    public const string TimedOutMessage = "The AI job did not finish in time and was abandoned. Please try again.";

    public static async Task<JobStatusDto> ResolveAsync(
        Guid jobId, AiJobStatus dbStatus, int dbPercent, string? dbError, DateTimeOffset createdAt,
        IJobProgressReader progress, AiJobOptions options, DateTimeOffset now)
    {
        if (dbStatus is AiJobStatus.Completed or AiJobStatus.Failed)
            return new JobStatusDto(dbStatus.ToString(), dbPercent, dbError);

        var live = await progress.GetCurrentStateAsync(jobId);
        var error = await progress.GetErrorAsync(jobId) ?? dbError;
        var (status, percent) = live ?? (dbStatus.ToString(), dbPercent);

        if (status is not ("Completed" or "Failed") && now - createdAt > options.JobTimeout)
            return new JobStatusDto("Failed", percent, TimedOutMessage);
        return new JobStatusDto(status, percent, error);
    }
}
