"""HTTP endpoints for job upload and status."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from app.domain.jobs import Job, JobStore, append_job_log
from app.schemas.models import JobStatusResponse, ProcessingOptions, RunResponse, UploadResponse
from app.services.job_lifecycle import create_job_from_upload, queue_job_for_processing
from app.services.pipeline import run_job_pipeline
from app.utils.artifacts import existing_artifact_url
import logging

logger = logging.getLogger(__name__)


def _processing_options_from_form(
    black_d: float = Form(0.2),
    black_pix_th: float = Form(0.98),
    silence_noise_db: int = Form(-35),
    silence_d: float = Form(0.5),
    freeze_enabled: bool = Form(True),
    freeze_sampling_fps: int = Form(2),
    freeze_diff_threshold: float = Form(0.01),
    freeze_min_duration: float = Form(1.0),
    generate_kept_preview: bool = Form(False),
    enable_buffering_detect: bool = Form(True),
    buffering_sample_fps: int = Form(1),
    buffering_match_thresh: float = Form(0.9),
    buffering_min_d: float = Form(1.0),
    buffering_template_ids: list[str] | None = Form(None),
    whisper_model: str = Form("base"),
    whisper_language: str = Form("en"),
    no_speech_min_d: float = Form(0.75),
    freeze_min_no_speech_overlap: float = Form(0.5),
    freeze_force_remove_sec: float = Form(3.0),
    strict_no_cut_speech: bool = Form(True),
    speech_overlap_threshold_sec: float = Form(0.2),
) -> ProcessingOptions:
    return ProcessingOptions(
        black_d=black_d,
        black_pix_th=black_pix_th,
        silence_noise_db=silence_noise_db,
        silence_d=silence_d,
        freeze_enabled=freeze_enabled,
        freeze_sampling_fps=freeze_sampling_fps,
        freeze_diff_threshold=freeze_diff_threshold,
        freeze_min_duration=freeze_min_duration,
        generate_kept_preview=generate_kept_preview,
        enable_buffering_detect=enable_buffering_detect,
        buffering_sample_fps=buffering_sample_fps,
        buffering_match_thresh=buffering_match_thresh,
        buffering_min_d=buffering_min_d,
        buffering_template_ids=buffering_template_ids or [],
        whisper_model=whisper_model,
        whisper_language=whisper_language,
        no_speech_min_d=no_speech_min_d,
        freeze_min_no_speech_overlap=freeze_min_no_speech_overlap,
        freeze_force_remove_sec=freeze_force_remove_sec,
        strict_no_cut_speech=strict_no_cut_speech,
        speech_overlap_threshold_sec=speech_overlap_threshold_sec,
    )


router = APIRouter()


def _run_job_pipeline_safe(job_id: str) -> None:
    """Run pipeline in background without bubbling exceptions to ASGI layer."""
    try:
        run_job_pipeline(job_id)
    except Exception as exc:
        logger.exception("Background pipeline failed for job %s: %s", job_id, exc)


@router.post("/api/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    background_tasks: BackgroundTasks,
    options: Annotated[ProcessingOptions, Depends(_processing_options_from_form)],
    video: UploadFile = File(...),
    auto_start: bool = Form(False),
) -> UploadResponse:
    try:
        job = create_job_from_upload(
            filename=video.filename,
            file_stream=video.file,
            options=options,
        )
    finally:
        await video.close()

    if auto_start:
        append_job_log(job, "Auto-start enabled; job queued in background")
        background_tasks.add_task(_run_job_pipeline_safe, job.job_id)

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
        background_tasks.add_task(_run_job_pipeline_safe, job_id)

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
