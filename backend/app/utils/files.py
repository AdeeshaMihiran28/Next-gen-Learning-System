"""File and path utilities for job artifacts."""

from __future__ import annotations

import csv
import shutil
from pathlib import Path
from typing import Any, Iterable, Mapping

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


def cleanup_temporary_inputs(job: Job, extra_paths: Iterable[Path]) -> list[Path]:
    """Delete temporary input files and any additional paths if they exist."""
    removed_paths: list[Path] = []
    targets: list[Path] = []

    if job.input_path is not None:
        targets.append(job.input_path)

    targets.extend(extra_paths)

    for path in targets:
        candidate = Path(path)
        if not candidate.exists():
            continue

        if candidate.is_dir():
            shutil.rmtree(candidate)
        else:
            candidate.unlink()

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
