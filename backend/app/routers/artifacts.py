"""HTTP endpoints for job artifacts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse

from app.domain.jobs import Job, JobStore
from app.utils.artifacts import (
    ArtifactKey,
    build_existing_artifact_urls,
    existing_artifact_path,
    load_json_file,
)


router = APIRouter()


@router.get("/api/jobs/{job_id}/download")
async def download_cleaned_video(job_id: str) -> FileResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "cleaned")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/report")
async def get_job_report(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "report")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/artifacts")
async def list_job_artifacts(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    return JSONResponse(
        content={
            "job_id": job_id,
            "artifacts": build_existing_artifact_urls(job_id),
        }
    )


@router.get("/api/jobs/{job_id}/removed-preview")
async def download_removed_preview(job_id: str) -> FileResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "removed_preview")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/kept-preview")
async def download_kept_preview(job_id: str) -> FileResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "kept_preview")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/segments.csv")
async def download_segments_csv(job_id: str) -> FileResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "segments_csv")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/logs/black")
async def get_black_log(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "black_log")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/silence")
async def get_silence_log(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "silence_log")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/freeze")
async def get_freeze_log(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "freeze_json")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/buffering")
async def get_buffering_log(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "buffering_json")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/transcript")
async def get_transcript_log(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job, "transcript_json")
    return JSONResponse(content=load_json_file(artifact_path))


def _get_job_or_404(job_id: str) -> Job:
    job = JobStore.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _get_artifact_path_or_404(job: Job, artifact_key: ArtifactKey):
    artifact_path = existing_artifact_path(job.job_id, artifact_key)
    if artifact_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return artifact_path
