from __future__ import annotations

from pathlib import Path

from app.domain.jobs import JobStore, append_job_log
from app.schemas.models import ProcessingOptions


def test_job_store_create_get_update():
    options = ProcessingOptions(whisper_model="small")
    input_path = Path("input.mp4")

    created = JobStore.create(
        "job-1",
        status="queued",
        progress=10,
        input_path=input_path,
        options=options,
    )

    fetched = JobStore.get("job-1")
    assert fetched is created
    assert fetched is not None
    assert fetched.status == "queued"
    assert fetched.progress == 10
    assert fetched.input_path == input_path
    assert fetched.options.whisper_model == "small"

    previous_updated_at = fetched.updated_at
    updated = JobStore.update("job-1", status="running", progress=50)

    assert updated is fetched
    assert updated is not None
    assert updated.status == "running"
    assert updated.progress == 50
    assert updated.updated_at >= previous_updated_at


def test_append_job_log_updates_job_timestamp():
    job = JobStore.create("job-2")
    previous_updated_at = job.updated_at

    append_job_log(job, "Started processing")

    assert job.logs == ["Started processing"]
    assert job.updated_at >= previous_updated_at
