"""Artifact path and URL helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from ..core.config import OUTPUT_DIR


ArtifactKey = Literal[
    "cleaned",
    "report",
    "removed_preview",
    "kept_preview",
    "segments_csv",
    "black_log",
    "silence_log",
    "freeze_json",
    "buffering_json",
    "transcript_json",
]

ARTIFACT_FILENAMES: dict[ArtifactKey, str] = {
    "cleaned": "cleaned.mp4",
    "report": "report.json",
    "removed_preview": "removed_preview.mp4",
    "kept_preview": "kept_preview.mp4",
    "segments_csv": "segments.csv",
    "black_log": "black_log.json",
    "silence_log": "silence_log.json",
    "freeze_json": "freeze.json",
    "buffering_json": "buffering.json",
    "transcript_json": "transcript.json",
}


def build_artifact_url(job_id: str, artifact_key: ArtifactKey) -> str:
    route_map: dict[ArtifactKey, str] = {
        "cleaned": f"/api/jobs/{job_id}/download",
        "report": f"/api/jobs/{job_id}/report",
        "removed_preview": f"/api/jobs/{job_id}/removed-preview",
        "kept_preview": f"/api/jobs/{job_id}/kept-preview",
        "segments_csv": f"/api/jobs/{job_id}/segments.csv",
        "black_log": f"/api/jobs/{job_id}/logs/black",
        "silence_log": f"/api/jobs/{job_id}/logs/silence",
        "freeze_json": f"/api/jobs/{job_id}/logs/freeze",
        "buffering_json": f"/api/jobs/{job_id}/logs/buffering",
        "transcript_json": f"/api/jobs/{job_id}/logs/transcript",
    }
    return route_map[artifact_key]


def build_artifact_path(job_id: str, artifact_key: ArtifactKey) -> Path:
    return OUTPUT_DIR / job_id / ARTIFACT_FILENAMES[artifact_key]


def existing_artifact_path(job_id: str, artifact_key: ArtifactKey) -> Path | None:
    artifact_path = build_artifact_path(job_id, artifact_key)
    if artifact_path.is_file():
        return artifact_path
    return None


def existing_artifact_url(job_id: str, artifact_key: ArtifactKey) -> str | None:
    if existing_artifact_path(job_id, artifact_key) is not None:
        return build_artifact_url(job_id, artifact_key)
    return None


def build_artifact_urls(job_id: str) -> dict[ArtifactKey, str]:
    return {
        artifact_key: build_artifact_url(job_id, artifact_key)
        for artifact_key in ARTIFACT_FILENAMES
    }


def build_existing_artifact_urls(job_id: str) -> dict[ArtifactKey, str | None]:
    return {
        artifact_key: existing_artifact_url(job_id, artifact_key)
        for artifact_key in ARTIFACT_FILENAMES
    }


def build_summary_path(job_id: str, filename: str) -> Path:
    return OUTPUT_DIR / job_id / filename


def existing_summary_path(job_id: str, filename: str) -> Path | None:
    summary_path = build_summary_path(job_id, filename)
    if summary_path.is_file():
        return summary_path
    return None


def load_json_file(path: Path) -> dict | list:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
