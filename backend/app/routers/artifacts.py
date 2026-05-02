"""HTTP endpoints for job artifacts."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import OUTPUT_DIR
from app.domain.jobs import Job, JobStore
from app.utils.artifacts import (
    ArtifactKey,
    build_existing_artifact_urls,
    existing_artifact_path,
    load_json_file,
)


router = APIRouter()


@router.get("/api/gallery")
async def list_gallery_items() -> JSONResponse:
    items: list[dict[str, object]] = []

    for job_dir in sorted(OUTPUT_DIR.iterdir(), key=_path_updated_at, reverse=True):
        if not job_dir.is_dir():
            continue

        cleaned_path = job_dir / "cleaned.mp4"
        report_path = job_dir / "report.json"
        if not cleaned_path.is_file():
            continue

        report = load_json_file(report_path) if report_path.is_file() else {}
        if not isinstance(report, dict):
            report = {}

        job_id = job_dir.name
        removed_segments = report.get("removed_segments", [])
        total_removed = _sum_removed_duration(removed_segments)

        items.append(
            {
                "job_id": job_id,
                "title": f"Lecture {job_id[:8]}",
                "created_at": _format_file_timestamp(cleaned_path),
                "duration_seconds": report.get("duration_seconds"),
                "total_removed_seconds": total_removed,
                "video_url": build_existing_artifact_urls(job_id).get("cleaned"),
                "summary_pdf_url": f"/api/jobs/{job_id}/summary.pdf" if (job_dir / "summary.pdf").is_file() else None,
            }
        )

    return JSONResponse(content={"items": items})


@router.get("/api/jobs/{job_id}/download")
async def download_cleaned_video(job_id: str) -> FileResponse:
    artifact_path = _get_artifact_path_or_404(job_id, "cleaned")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/report")
async def get_job_report(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "report")
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
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "removed_preview")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/kept-preview")
async def download_kept_preview(job_id: str) -> FileResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "kept_preview")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/segments.csv")
async def download_segments_csv(job_id: str) -> FileResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "segments_csv")
    return FileResponse(path=artifact_path, filename=artifact_path.name)


@router.get("/api/jobs/{job_id}/logs/black")
async def get_black_log(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "black_log")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/silence")
async def get_silence_log(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "silence_log")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/freeze")
async def get_freeze_log(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "freeze_json")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/buffering")
async def get_buffering_log(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "buffering_json")
    return JSONResponse(content=load_json_file(artifact_path))


@router.get("/api/jobs/{job_id}/logs/transcript")
async def get_transcript_log(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    artifact_path = _get_artifact_path_or_404(job_id, "transcript_json")
    return JSONResponse(content=load_json_file(artifact_path))


def _get_job_or_404(job_id: str) -> Job:
    job = JobStore.get(job_id)
    if job is None and not (OUTPUT_DIR / job_id).is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _get_artifact_path_or_404(job_id: str, artifact_key: ArtifactKey) -> Path:
    artifact_path = existing_artifact_path(job_id, artifact_key)
    if artifact_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return artifact_path


def _path_updated_at(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def _format_file_timestamp(path: Path) -> str:
    from datetime import datetime

    return datetime.fromtimestamp(_path_updated_at(path)).isoformat()


def _sum_removed_duration(removed_segments: object) -> float:
    if not isinstance(removed_segments, list):
        return 0.0

    total = 0.0
    for segment in removed_segments:
        if isinstance(segment, dict):
            total += float(segment.get("duration") or 0.0)
    return total
