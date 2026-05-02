"""File and path utilities for job artifacts."""

from __future__ import annotations

import csv
import os
import shutil
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Mapping

from ..domain.jobs import Job


def create_job_dir(base_path: Path, job_id: str) -> Path:
    """Create a job directory under the given base path without allowing escape."""
    base_path.mkdir(parents=True, exist_ok=True)
    base_dir = base_path.resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    job_dir = (base_dir / job_id).resolve()
    try:
        job_dir.relative_to(base_dir)
    except ValueError as exc:
        raise ValueError(f"Invalid job_id path: {job_id}") from exc

    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def write_segments_csv(job_dir: Path, segments: list[dict[str, Any]]) -> Path:
    """Write a segments.csv file for the provided segment dictionaries."""
    job_dir.mkdir(parents=True, exist_ok=True)
    csv_path = job_dir / "segments.csv"

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["start", "end", "duration", "reasons"],
        )
        writer.writeheader()

        for segment in segments:
            writer.writerow(
                {
                    "start": segment.get("start", ""),
                    "end": segment.get("end", ""),
                    "duration": segment.get("duration", ""),
                    "reasons": _serialize_reasons(segment.get("reasons", "")),
                }
            )

    return csv_path


def save_binary_stream(stream: BinaryIO, destination: Path) -> Path:
    """Persist a binary stream to a destination path."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.parent / f".{destination.name}.part"

    try:
        with temp_path.open("wb") as handle:
            shutil.copyfileobj(stream, handle)
        os.replace(temp_path, destination)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)

    return destination


def cleanup_temporary_inputs(job: Job, extra_paths: Iterable[Path]) -> list[Path]:
    """Delete temporary input files and any additional paths if they exist."""
    targets: list[Path] = []

    if job.input_path is not None:
        targets.append(job.input_path)

    targets.extend(extra_paths)

    return cleanup_paths(targets)


def cleanup_paths(paths: Iterable[Path]) -> list[Path]:
    """Delete the provided file or directory paths if they exist."""
    removed_paths: list[Path] = []

    for path in paths:
        candidate = Path(path)
        if _remove_path(candidate):
            removed_paths.append(candidate)

    return removed_paths


def _serialize_reasons(value: Any) -> str:
    if isinstance(value, str):
        return value

    if isinstance(value, Mapping):
        return "; ".join(f"{key}={item}" for key, item in value.items())

    if isinstance(value, Iterable):
        return "; ".join(str(item) for item in value)

    return str(value)


def _remove_path(path: Path) -> bool:
    if not path.exists():
        return False

    try:
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=False)
        else:
            path.unlink()
    except OSError:
        return False

    return True
