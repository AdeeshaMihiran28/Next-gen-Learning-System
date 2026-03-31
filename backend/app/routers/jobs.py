"""HTTP endpoints for job upload and status."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status

from app.domain.jobs import Job, JobStore, append_job_log
from app.schemas.models import JobStatusResponse, ProcessingOptions, RunResponse, UploadResponse
from app.services.job_lifecycle import create_job_from_upload, queue_job_for_processing
from app.services.pipeline import run_job_pipeline
from app.utils.artifacts import existing_artifact_url


router = APIRouter()


@router.post("/api/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    auto_start: bool = Form(False),
) -> UploadResponse:
    try:
        job = create_job_from_upload(
            filename=video.filename,
            file_stream=video.file,
        )
    finally:
        await video.close()

    if auto_start:
        append_job_log(job, "Auto-start enabled; job queued in background")
        background_tasks.add_task(run_job_pipeline, job.job_id)

    return UploadResponse(job_id=job.job_id)


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

    updated_job = queue_job_for_processing(job_id, options=options)
    if updated_job is not None:
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
