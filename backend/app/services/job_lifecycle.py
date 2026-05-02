"""Job intake and queueing helpers."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from app.core.config import OUTPUT_DIR, UPLOAD_DIR
from app.domain.jobs import Job, JobStore, append_job_log
from app.schemas.models import ProcessingOptions
from app.utils.artifacts import build_artifact_path
from app.utils.files import create_job_dir, save_binary_stream


def create_job_from_upload(
    *,
    filename: str | None,
    file_stream: BinaryIO,
    options: ProcessingOptions | None = None,
) -> Job:
    """Persist an uploaded video and create its initial queued job record."""
    normalized_options = options or ProcessingOptions()
    job_id = str(uuid4())
    upload_dir = create_job_dir(UPLOAD_DIR, job_id)
    create_job_dir(OUTPUT_DIR, job_id)

    original_extension = Path(filename or "input").suffix
    input_path = upload_dir / f"input{original_extension}"
    save_binary_stream(file_stream, input_path)

    job = JobStore.create(
        job_id,
        status="queued",
        input_path=input_path,
        output_path=build_artifact_path(job_id, "cleaned"),
        report_path=build_artifact_path(job_id, "report"),
        options=normalized_options,
    )
    append_job_log(job, f"Uploaded file saved to {input_path.name}")
    return job


def queue_job_for_processing(
    job_id: str,
    *,
    options: ProcessingOptions | None = None,
) -> Job | None:
    """Queue an existing job for background processing."""
    job = JobStore.get(job_id)
    if job is None:
        return None

    if job.status == "running":
        return job

    updated_job = JobStore.update(
        job_id,
        status="queued",
        options=options or job.options,
    )
    if updated_job is None:
        return None

    append_job_log(updated_job, "Job queued for processing")
    return updated_job
