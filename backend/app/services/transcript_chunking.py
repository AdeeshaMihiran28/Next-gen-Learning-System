"""Transcript loading and time-based chunking helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DEFAULT_CHUNK_SIZE_SECONDS = 10 * 60


def load_transcript_segments(transcript_path: Path) -> list[dict[str, Any]]:
    """Load normalized transcript segments from transcript.json."""
    with transcript_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    segments = payload.get("segments", [])
    return [
        {
            "start": float(segment.get("start", 0.0)),
            "end": float(segment.get("end", segment.get("start", 0.0))),
            "text": str(segment.get("text", "")).strip(),
        }
        for segment in segments
    ]


def chunk_transcript_by_time(
    transcript_segments: list[dict[str, Any]],
    *,
    chunk_size_seconds: float = DEFAULT_CHUNK_SIZE_SECONDS,
) -> list[dict[str, Any]]:
    """Split transcript segments into time-based chunks."""
    if chunk_size_seconds <= 0:
        raise ValueError("chunk_size_seconds must be greater than 0")
    if not transcript_segments:
        return []

    sorted_segments = sorted(transcript_segments, key=lambda segment: float(segment["start"]))

    chunks: list[dict[str, Any]] = []
    current_chunk: dict[str, Any] | None = None

    for segment in sorted_segments:
        segment_start = float(segment["start"])
        segment_end = float(segment["end"])
        segment_text = str(segment.get("text", "")).strip()

        if current_chunk is None:
            current_chunk = {
                "start": segment_start,
                "end": segment_end,
                "text_parts": [segment_text] if segment_text else [],
            }
            continue

        if segment_end - current_chunk["start"] <= chunk_size_seconds:
            current_chunk["end"] = max(current_chunk["end"], segment_end)
            if segment_text:
                current_chunk["text_parts"].append(segment_text)
            continue

        chunks.append(_finalize_chunk(current_chunk))
        current_chunk = {
            "start": segment_start,
            "end": segment_end,
            "text_parts": [segment_text] if segment_text else [],
        }

    if current_chunk is not None:
        chunks.append(_finalize_chunk(current_chunk))

    return chunks


def _finalize_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "start": float(chunk["start"]),
        "end": float(chunk["end"]),
        "text": " ".join(part for part in chunk["text_parts"] if part).strip(),
    }
