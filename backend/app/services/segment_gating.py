"""Speech-based gating for freeze segments."""

from __future__ import annotations

from typing import Any


def gate_freeze_segments(
    freeze_segments: list[dict[str, Any]],
    no_speech_segments: list[dict[str, Any]],
    *,
    min_no_speech_overlap: float = 0.5,
    force_remove_threshold: float = 3.0,
) -> list[dict[str, float]]:
    """Filter freeze segments to those considered safe to remove."""
    removable_segments: list[dict[str, float]] = []

    for freeze_segment in freeze_segments:
        start = float(freeze_segment["start"])
        end = float(freeze_segment["end"])
        duration = max(0.0, float(freeze_segment.get("duration", end - start)))

        if duration >= force_remove_threshold:
            removable_segments.append(
                {
                    "start": start,
                    "end": end,
                    "duration": duration,
                }
            )
            continue

        no_speech_overlap = _compute_total_overlap(
            start,
            end,
            no_speech_segments,
        )

        if no_speech_overlap >= min_no_speech_overlap:
            removable_segments.append(
                {
                    "start": start,
                    "end": end,
                    "duration": duration,
                }
            )

    return removable_segments


def _compute_total_overlap(
    segment_start: float,
    segment_end: float,
    reference_segments: list[dict[str, Any]],
) -> float:
    total_overlap = 0.0

    for reference in reference_segments:
        reference_start = float(reference["start"])
        reference_end = float(reference["end"])
        overlap_start = max(segment_start, reference_start)
        overlap_end = min(segment_end, reference_end)

        if overlap_end > overlap_start:
            total_overlap += overlap_end - overlap_start

    return total_overlap
