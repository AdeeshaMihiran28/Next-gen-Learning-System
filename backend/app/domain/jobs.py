"""In-memory job domain model and store."""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path

from ..schemas.models import ProcessingOptions


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class Job:
    job_id: str
    status: str
    progress: int
    created_at: datetime
    updated_at: datetime
    logs: list[str] = field(default_factory=list)
    error_message: str | None = None
    input_path: Path | None = None
    output_path: Path | None = None
    report_path: Path | None = None
    options: ProcessingOptions = field(default_factory=ProcessingOptions)


JOB_STORE: dict[str, Job] = {}
JOB_FIELDS = {field_.name for field_ in fields(Job)}


class JobStore:
    @classmethod
    def create(
        cls,
        job_id: str,
        *,
        status: str = "created",
        progress: int = 0,
        input_path: Path | None = None,
        output_path: Path | None = None,
        report_path: Path | None = None,
        options: ProcessingOptions | None = None,
        error_message: str | None = None,
    ) -> Job:
        now = _utc_now()
        job = Job(
            job_id=job_id,
            status=status,
            progress=progress,
            created_at=now,
            updated_at=now,
            error_message=error_message,
            input_path=input_path,
            output_path=output_path,
            report_path=report_path,
            options=options or ProcessingOptions(),
        )
        JOB_STORE[job_id] = job
        return job

    @classmethod
    def get(cls, job_id: str) -> Job | None:
        return JOB_STORE.get(job_id)

    @classmethod
    def update(cls, job_id: str, **changes: object) -> Job | None:
        job = cls.get(job_id)
        if job is None:
            return None

        for field_name, value in changes.items():
            if field_name not in JOB_FIELDS:
                raise KeyError(f"Unknown job field '{field_name}'")
            setattr(job, field_name, value)

        job.updated_at = _utc_now()
        return job

    @classmethod
    def delete(cls, job_id: str) -> Job | None:
        return JOB_STORE.pop(job_id, None)


def append_job_log(job: Job, entry: str) -> Job:
    message = entry.strip()
    if not message:
        return job

    job.logs.append(message)
    job.updated_at = _utc_now()
    return job
