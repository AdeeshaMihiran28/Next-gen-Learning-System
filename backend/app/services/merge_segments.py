"""Helpers for normalizing and merging detected segments."""

from __future__ import annotations

from typing import Any, Iterable


def normalize_segments(
    segments: Iterable[dict[str, Any]],
    *,
    reason: str,
) -> list[dict[str, Any]]:
    """Normalize detected segments into a common format."""
    normalized_segments: list[dict[str, Any]] = []

    for segment in segments:
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        normalized_segments.append(
            {
                "start": start,
                "end": end,
                "duration": max(0.0, end - start),
                "reasons": [reason],
            }
        )

    return normalized_segments


def apply_freeze_rules(
    freeze_segments: Iterable[dict[str, Any]],
    *,
    min_duration: float = 0.0,
) -> list[dict[str, Any]]:
    """Filter and normalize freeze segments prior to merge."""
    filtered_segments: list[dict[str, Any]] = []

    for segment in freeze_segments:
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        duration = max(0.0, float(segment.get("duration", end - start)))

        if duration < min_duration:
            continue

        filtered_segments.append(
            {
                "start": start,
                "end": end,
                "duration": duration,
                "reasons": list(segment.get("reasons", ["freeze"])),
            }
        )

    return filtered_segments


def merge_bad_segments(
    segments: Iterable[dict[str, Any]],
    *,
    adjacency_tolerance: float = 0.0,
) -> list[dict[str, Any]]:
    """Merge overlapping or adjacent bad segments."""
    sorted_segments = sorted(
        (
            {
                "start": float(segment["start"]),
                "end": float(segment["end"]),
                "duration": max(0.0, float(segment["end"]) - float(segment["start"])),
                "reasons": list(segment.get("reasons", [])),
            }
            for segment in segments
        ),
        key=lambda segment: segment["start"],
    )

    if not sorted_segments:
        return []

    merged_segments = [sorted_segments[0]]

    for segment in sorted_segments[1:]:
        current = merged_segments[-1]
        if segment["start"] <= current["end"] + adjacency_tolerance:
            current["end"] = max(current["end"], segment["end"])
            current["duration"] = max(0.0, current["end"] - current["start"])
            current["reasons"] = sorted(set(current["reasons"] + segment["reasons"]))
            continue

        merged_segments.append(segment)

    return merged_segments


def build_good_segments(
    removed_segments: Iterable[dict[str, Any]],
    total_duration: float,
) -> list[dict[str, float]]:
    """Build kept segments from removed segments and total video duration."""
    if total_duration < 0:
        raise ValueError("total_duration must be non-negative")

    merged_removed_segments = merge_bad_segments(removed_segments)
    good_segments: list[dict[str, float]] = []
    cursor = 0.0

    for segment in merged_removed_segments:
        start = max(0.0, float(segment["start"]))
        end = min(total_duration, float(segment["end"]))

        if start > cursor:
            good_segments.append(
                {
                    "start": cursor,
                    "end": start,
                    "duration": start - cursor,
                }
            )

        cursor = max(cursor, end)

    if cursor < total_duration:
        good_segments.append(
            {
                "start": cursor,
                "end": total_duration,
                "duration": total_duration - cursor,
            }
        )

    return good_segments
