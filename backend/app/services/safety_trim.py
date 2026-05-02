"""Helpers for trimming removal segments to avoid cutting speech."""

from __future__ import annotations

from typing import Any


def trim_removal_segments_for_speech(
    removal_segments: list[dict[str, Any]],
    speech_segments: list[dict[str, Any]],
    *,
    overlap_threshold: float = 0.2,
    min_kept_segment_duration: float = 0.1,
) -> tuple[list[dict[str, float]], dict[str, float | int], list[dict[str, float]]]:
    """Trim or split removal segments so speech is not cut."""
    safe_segments: list[dict[str, float]] = []
    overlap_violations: list[dict[str, float]] = []

    normalized_speech = sorted(
        (
            {
                "start": float(segment["start"]),
                "end": float(segment["end"]),
            }
            for segment in speech_segments
        ),
        key=lambda segment: segment["start"],
    )

    for removal_segment in removal_segments:
        original_start = float(removal_segment["start"])
        original_end = float(removal_segment["end"])
        if original_end <= original_start:
            continue

        candidate_segments = [{"start": original_start, "end": original_end}]

        for speech_segment in normalized_speech:
            speech_start = speech_segment["start"]
            speech_end = speech_segment["end"]

            overlap_start = max(original_start, speech_start)
            overlap_end = min(original_end, speech_end)
            overlap_duration = max(0.0, overlap_end - overlap_start)

            if overlap_duration <= 0:
                continue

            if overlap_duration > overlap_threshold:
                overlap_violations.append(
                    {
                        "start": original_start,
                        "end": original_end,
                        "duration": original_end - original_start,
                        "speech_start": speech_start,
                        "speech_end": speech_end,
                        "overlap": overlap_duration,
                    }
                )

            next_candidates: list[dict[str, float]] = []
            for candidate in candidate_segments:
                next_candidates.extend(
                    _subtract_interval(
                        candidate["start"],
                        candidate["end"],
                        speech_start,
                        speech_end,
                    )
                )
            candidate_segments = next_candidates

            if not candidate_segments:
                break

        for candidate in candidate_segments:
            duration = candidate["end"] - candidate["start"]
            if duration >= min_kept_segment_duration:
                safe_segments.append(
                    {
                        "start": candidate["start"],
                        "end": candidate["end"],
                        "duration": duration,
                    }
                )

    safe_segments.sort(key=lambda segment: segment["start"])

    original_total_duration = sum(
        max(0.0, float(segment["end"]) - float(segment["start"]))
        for segment in removal_segments
    )
    safe_total_duration = sum(segment["duration"] for segment in safe_segments)

    safety_statistics: dict[str, float | int] = {
        "input_segment_count": len(removal_segments),
        "safe_segment_count": len(safe_segments),
        "violation_count": len(overlap_violations),
        "original_total_duration": original_total_duration,
        "safe_total_duration": safe_total_duration,
        "trimmed_duration": max(0.0, original_total_duration - safe_total_duration),
    }

    return safe_segments, safety_statistics, overlap_violations


def _subtract_interval(
    segment_start: float,
    segment_end: float,
    block_start: float,
    block_end: float,
) -> list[dict[str, float]]:
    if block_end <= segment_start or block_start >= segment_end:
        return [{"start": segment_start, "end": segment_end}]

    pieces: list[dict[str, float]] = []

    if block_start > segment_start:
        pieces.append({"start": segment_start, "end": min(block_start, segment_end)})

    if block_end < segment_end:
        pieces.append({"start": max(block_end, segment_start), "end": segment_end})

    return [piece for piece in pieces if piece["end"] > piece["start"]]
