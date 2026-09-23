# ai-service/tests/test_vectorize_performance.py
# Final review C1: real plans (text, dimension lines) produce tens of thousands of skeleton segments;
# the collinear merge must stay near-linear and the job must fail fast / time out instead of hanging.
import time
from unittest.mock import patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from pipeline.vectorize import MAX_SEGMENTS, VectorizationTooComplexError, _merge_collinear


def _broken_lines(n_lines: int, pieces: int):
    """n_lines horizontal lines, each drawn as `pieces` touching 10px pieces (like a skeleton contour)."""
    segments = []
    for line in range(n_lines):
        y = 20.0 * line
        for k in range(pieces):
            segments.append(((10.0 * k, y), (10.0 * k + 10.0, y)))
    return segments


def test_merging_thousands_of_segments_is_fast_and_correct():
    segments = _broken_lines(n_lines=60, pieces=100)          # 6,000 segments -> 60 walls
    start = time.perf_counter()
    merged = _merge_collinear(segments)
    elapsed = time.perf_counter() - start

    assert len(merged) == 60
    assert all(abs((b[0] - a[0]) - 1000.0) < 1e-6 for a, b in merged)
    assert elapsed < 3.0, f"merge took {elapsed:.1f}s"


def test_absurd_segment_counts_fail_fast_with_a_clear_message():
    too_many = _broken_lines(n_lines=1, pieces=MAX_SEGMENTS + 1)
    with pytest.raises(VectorizationTooComplexError, match="too complex"):
        _merge_collinear(too_many)


def test_vectorize_job_has_time_limits_and_late_acks():
    from workers.tasks import vectorize_job
    assert vectorize_job.soft_time_limit and vectorize_job.time_limit > vectorize_job.soft_time_limit
    assert vectorize_job.acks_late is True
    assert vectorize_job.reject_on_worker_lost is True


def test_hitting_the_soft_time_limit_reports_a_readable_failure():
    from workers.celery_app import celery_app
    from workers.tasks import vectorize_job
    celery_app.conf.task_always_eager = True
    with patch("workers.tasks.download_from_minio", side_effect=SoftTimeLimitExceeded()), \
         patch("workers.tasks.report_progress") as progress, \
         patch("workers.tasks.report_error") as error, \
         patch("workers.tasks.report_final_state"):
        vectorize_job.delay(job_id="j", project_id="p", file_object_key="k.png").get()
    assert progress.call_args_list[-1][0][1] == "Failed"
    assert "too long" in error.call_args[0][1]
