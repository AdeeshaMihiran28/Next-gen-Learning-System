from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.domain.jobs import JobStore
from app.routers import jobs as jobs_router
from app.utils import artifacts as artifact_utils


def _create_test_client(workspace_tmp_path) -> TestClient:
    jobs_router.UPLOAD_DIR = workspace_tmp_path / "uploads"
    jobs_router.OUTPUT_DIR = workspace_tmp_path / "outputs"
    artifact_utils.OUTPUT_DIR = workspace_tmp_path / "outputs"

    app = FastAPI()
    app.include_router(jobs_router.router)
    return TestClient(app)


def test_upload_endpoint_creates_job_and_saves_file(workspace_tmp_path):
    client = _create_test_client(workspace_tmp_path)

    response = client.post(
        "/api/upload",
        files={"video": ("lecture.mp4", b"video-bytes", "video/mp4")},
        data={"auto_start": "false"},
    )

    assert response.status_code == 201
    payload = response.json()
    job_id = payload["job_id"]
    assert job_id

    job = JobStore.get(job_id)
    assert job is not None
    assert job.status == "queued"
    assert job.input_path == workspace_tmp_path / "uploads" / job_id / "input.mp4"
    assert job.input_path.read_bytes() == b"video-bytes"
    assert (workspace_tmp_path / "outputs" / job_id).is_dir()


def test_job_status_endpoint_returns_output_url_only_when_done(workspace_tmp_path):
    client = _create_test_client(workspace_tmp_path)

    job = JobStore.create(
        "job-status",
        status="done",
        input_path=workspace_tmp_path / "uploads" / "job-status" / "input.mp4",
    )
    cleaned_path = workspace_tmp_path / "outputs" / "job-status" / "cleaned.mp4"
    cleaned_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned_path.write_bytes(b"cleaned-video")

    response = client.get(f"/api/jobs/{job.job_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == "job-status"
    assert payload["status"] == "done"
    assert payload["output_url"] == f"/artifacts/{job.job_id}/cleaned.mp4"
    assert payload["logs"] == []


def test_job_status_endpoint_returns_404_for_unknown_job(workspace_tmp_path):
    client = _create_test_client(workspace_tmp_path)

    response = client.get("/api/jobs/missing-job")

    assert response.status_code == 404
