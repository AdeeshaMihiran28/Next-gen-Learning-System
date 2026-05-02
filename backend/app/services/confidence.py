"""Confidence scoring helpers for removal segments."""

from __future__ import annotations

from typing import Any


def add_confidence_to_segments(
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Assign a confidence label to each removal segment."""
    scored_segments: list[dict[str, Any]] = []

    for segment in segments:
        updated_segment = dict(segment)
        updated_segment["confidence"] = _score_segment_confidence(segment)
        scored_segments.append(updated_segment)

    return scored_segments


def _score_segment_confidence(segment: dict[str, Any]) -> str:
    reasons = [str(reason).lower() for reason in segment.get("reasons", [])]
    source_metadata = segment.get("source_metadata", {})
    score = 0

    if len(reasons) >= 2:
        score += 2
    elif len(reasons) == 1:
        score += 1

    high_signal_reasons = {
        "black",
        "silence",
        "freeze",
        "buffering",
        "no_speech",
    }
    score += sum(1 for reason in reasons if reason in high_signal_reasons)

    if isinstance(source_metadata, dict):
        evidence_count = int(source_metadata.get("evidence_count", 0) or 0)
        score += min(evidence_count, 2)

        detector_score = source_metadata.get("score")
        if isinstance(detector_score, (int, float)):
            if detector_score >= 0.9:
                score += 2
            elif detector_score >= 0.75:
                score += 1

    if score >= 4:
        return "high"
    if score >= 2:
        return "medium"
    return "low"
