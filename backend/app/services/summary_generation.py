"""Summary generation orchestration for completed jobs."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.domain.jobs import Job, append_job_log
from app.services.llm_summarize import reduce_chunk_summaries, summarize_transcript_chunk
from app.services.summary_pdf import generate_summary_pdf
from app.services.transcript_chunking import chunk_transcript_by_time, load_transcript_segments
from app.utils.artifacts import build_artifact_path, build_summary_path


class SummaryGenerationError(RuntimeError):
    """Raised when summary generation cannot be completed."""


class TranscriptNotFoundError(SummaryGenerationError):
    """Raised when transcript data required for summary generation is missing."""


def generate_job_summary(job: Job) -> dict[str, Any]:
    """Generate summary artifacts for a job and return the structured summary."""
    try:
        transcript_path = build_artifact_path(job.job_id, "transcript_json")
        if not transcript_path.is_file():
            raise TranscriptNotFoundError("Transcript artifact was not found for this job.")

        transcript_segments = load_transcript_segments(transcript_path)
        if not transcript_segments:
            raise SummaryGenerationError("Transcript does not contain any segments to summarize.")

        append_job_log(job, "Loading transcript segments for summary generation")
        transcript_chunks = chunk_transcript_by_time(transcript_segments)
        append_job_log(job, f"Transcript split into {len(transcript_chunks)} chunk(s)")

        chunk_summaries = _summarize_chunks_with_fallback(job, transcript_chunks)
        if not chunk_summaries:
            raise SummaryGenerationError("Transcript chunks did not produce any summaries.")

        append_job_log(job, f"Generated {len(chunk_summaries)} chunk summary/ies")
        final_summary = _reduce_summaries_with_fallback(job, chunk_summaries)
        structured_summary = build_structured_summary(
            transcript_chunks=transcript_chunks,
            chunk_summaries=chunk_summaries,
            final_summary=final_summary,
        )

        summary_json_path = build_summary_path(job.job_id, "summary.json")
        summary_pdf_path = build_summary_path(job.job_id, "summary.pdf")
        _write_summary_json(summary_json_path, structured_summary)
        generate_summary_pdf(structured_summary, summary_pdf_path)

        append_job_log(job, "Summary artifacts generated successfully")
        return structured_summary
    except TranscriptNotFoundError:
        raise
    except SummaryGenerationError:
        raise
    except Exception as exc:
        raise SummaryGenerationError(str(exc)) from exc


def _summarize_chunks_with_fallback(
    job: Job,
    transcript_chunks: list[dict[str, Any]],
) -> list[str]:
    chunk_summaries: list[str] = []
    fallback_used = False

    for chunk in transcript_chunks:
        text = str(chunk.get("text", "")).strip()
        if not text:
            continue

        try:
            chunk_summaries.append(summarize_transcript_chunk(chunk))
        except Exception as exc:
            fallback_used = True
            append_job_log(job, f"Gemini chunk summary failed; using local fallback: {exc}")
            chunk_summaries.append(_local_chunk_summary(chunk))

    if fallback_used:
        append_job_log(job, "Local transcript summary fallback was used")

    return [summary for summary in chunk_summaries if summary.strip()]


def _reduce_summaries_with_fallback(job: Job, chunk_summaries: list[str]) -> str:
    try:
        return reduce_chunk_summaries(chunk_summaries)
    except Exception as exc:
        append_job_log(job, f"Gemini final summary failed; using local fallback: {exc}")
        return _local_final_summary(chunk_summaries)


def _local_chunk_summary(chunk: dict[str, Any]) -> str:
    text = str(chunk.get("text", "")).strip()
    sentences = _extract_sentences(text)
    selected_sentences = sentences[:3]

    if not selected_sentences and text:
        selected_sentences = [text[:500].strip()]

    start = _format_timestamp(float(chunk.get("start", 0.0)))
    end = _format_timestamp(float(chunk.get("end", 0.0)))
    summary_text = " ".join(selected_sentences).strip()
    return f"{start} - {end}: {summary_text}"


def _local_final_summary(chunk_summaries: list[str]) -> str:
    combined = " ".join(summary.strip() for summary in chunk_summaries if summary.strip())
    sentences = _extract_sentences(combined)
    selected_sentences = sentences[:8]

    if selected_sentences:
        return " ".join(selected_sentences)

    return combined[:1500].strip()


def build_structured_summary(
    *,
    transcript_chunks: list[dict[str, Any]],
    chunk_summaries: list[str],
    final_summary: str,
) -> dict[str, Any]:
    """Build a structured summary payload from generated chunk summaries."""
    overview = final_summary.strip()
    summary_sentences = _extract_sentences(overview)
    topic_candidates = _dedupe_preserve_order(
        summary_sentences + [summary.strip() for summary in chunk_summaries if summary.strip()]
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overview": overview,
        "key_topics": topic_candidates[:5],
        "definitions": _extract_definitions(overview)[:5],
        "takeaways": summary_sentences[:5] or topic_candidates[:3],
        "outline": [
            {
                "time_range": f"{_format_timestamp(float(chunk.get('start', 0.0)))} - {_format_timestamp(float(chunk.get('end', 0.0)))}",
                "summary": chunk_summary.strip(),
            }
            for chunk, chunk_summary in zip(transcript_chunks, chunk_summaries, strict=False)
            if chunk_summary.strip()
        ],
    }
def _write_summary_json(output_path: Path, payload: dict[str, Any]) -> Path:
    import json

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return output_path


def _extract_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def _extract_definitions(text: str) -> list[dict[str, str]]:
    definitions: list[dict[str, str]] = []

    for sentence in _extract_sentences(text):
        match = re.match(
            r"(?P<term>[A-Z][A-Za-z0-9\s/-]{1,40})\s+(?:is|are|refers to|means)\s+(?P<definition>.+)",
            sentence,
        )
        if match is None:
            continue

        definitions.append(
            {
                "term": match.group("term").strip(),
                "definition": match.group("definition").strip(),
            }
        )

    return definitions


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []

    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)

    return deduped


def _format_timestamp(seconds: float) -> str:
    total_seconds = max(int(round(seconds)), 0)
    minutes, remaining_seconds = divmod(total_seconds, 60)
    hours, remaining_minutes = divmod(minutes, 60)

    if hours:
        return f"{hours:02d}:{remaining_minutes:02d}:{remaining_seconds:02d}"
    return f"{remaining_minutes:02d}:{remaining_seconds:02d}"
