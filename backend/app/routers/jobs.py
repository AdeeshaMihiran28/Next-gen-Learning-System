"""HTTP endpoints for job upload and status."""

from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status

from app.core.config import OUTPUT_DIR, UPLOAD_DIR
from app.domain.jobs import Job, JobStore, append_job_log
from app.schemas.models import JobStatusResponse, ProcessingOptions, RunResponse, UploadResponse
from app.services.pipeline import run_job_pipeline
from app.utils.artifacts import build_artifact_path, existing_artifact_url
from app.utils.files import create_job_dir


router = APIRouter()


@router.post("/api/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    auto_start: bool = Form(False),
) -> UploadResponse:
    job_id = str(uuid4())
    upload_dir = create_job_dir(UPLOAD_DIR, job_id)
    create_job_dir(OUTPUT_DIR, job_id)

    original_extension = Path(video.filename or "input").suffix
    input_path = upload_dir / f"input{original_extension}"

    try:
        with input_path.open("wb") as handle:
            shutil.copyfileobj(video.file, handle)
    finally:
        await video.close()

    job = JobStore.create(
        job_id,
        status="queued",
        input_path=input_path,
        output_path=build_artifact_path(job_id, "cleaned"),
        report_path=build_artifact_path(job_id, "report"),
    )
    append_job_log(job, f"Uploaded file saved to {input_path.name}")

    if auto_start:
        append_job_log(job, "Auto-start enabled; job queued in background")
        background_tasks.add_task(run_job_pipeline, job_id)

    return UploadResponse(job_id=job_id)


@router.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    job = JobStore.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return _serialize_job_status(job)


@router.post("/api/jobs/{job_id}/run", response_model=RunResponse)
async def run_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    options: ProcessingOptions | None = None,
) -> RunResponse:
    job = JobStore.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status == "running":
        return RunResponse(job_id=job.job_id, status="running")

    updated_job = JobStore.update(
        job_id,
        status="queued",
        options=options or job.options,
    )
    if updated_job is not None:
        append_job_log(updated_job, "Job queued for processing")
        background_tasks.add_task(run_job_pipeline, job_id)

    return RunResponse(job_id=job.job_id, status="queued")


def _serialize_job_status(job: Job) -> JobStatusResponse:
    output_url = None
    if job.status == "done":
        output_url = existing_artifact_url(job.job_id, "cleaned")

    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        logs=job.logs,
        output_url=output_url,
        error_message=job.error_message,
    )
