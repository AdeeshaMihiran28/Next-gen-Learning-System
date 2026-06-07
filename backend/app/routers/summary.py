"""HTTP endpoints for summary generation and retrieval."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse, Response

from app.domain.jobs import Job, JobStore
from app.services.summary_generation import (
    SummaryGenerationError,
    TranscriptNotFoundError,
    generate_job_summary,
)
from app.utils.artifacts import existing_summary_path, load_json_file


router = APIRouter()


@router.post("/api/jobs/{job_id}/summary")
async def generate_summary(job_id: str) -> JSONResponse:
    job = _get_job_or_404(job_id)
    try:
        generate_job_summary(job)
    except TranscriptNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SummaryGenerationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return JSONResponse(
        content={
            "job_id": job_id,
            "status": "completed",
            "summary_json_url": f"/api/jobs/{job_id}/summary.json",
            "summary_pdf_url": f"/api/jobs/{job_id}/summary.pdf",
        }
    )


@router.get("/api/jobs/{job_id}/summary.pdf")
async def get_summary_pdf(job_id: str) -> FileResponse:
    _get_job_or_404(job_id)
    summary_path = _get_summary_path_or_404(job_id, "summary.pdf")
    return FileResponse(path=summary_path, filename=summary_path.name)


@router.head("/api/jobs/{job_id}/summary.pdf")
async def head_summary_pdf(job_id: str) -> Response:
    _get_job_or_404(job_id)
    _get_summary_path_or_404(job_id, "summary.pdf")
    return Response(status_code=status.HTTP_200_OK)


@router.get("/api/jobs/{job_id}/summary.json")
async def get_summary_json(job_id: str) -> JSONResponse:
    _get_job_or_404(job_id)
    summary_path = _get_summary_path_or_404(job_id, "summary.json")
    return JSONResponse(content=load_json_file(summary_path))


def _get_job_or_404(job_id: str) -> Job:
    job = JobStore.get(job_id)
    if job is None and existing_summary_path(job_id, "summary.json") is None and existing_summary_path(job_id, "summary.pdf") is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _get_summary_path_or_404(job_id: str, filename: str):
    summary_path = existing_summary_path(job_id, filename)
    if summary_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Summary artifact not found")
    return summary_path
