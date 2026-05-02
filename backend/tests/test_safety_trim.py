from __future__ import annotations

from app.services.safety_trim import trim_removal_segments_for_speech


def test_trim_removal_segments_for_speech_splits_on_speech_overlap():
    safe_segments, stats, violations = trim_removal_segments_for_speech(
        removal_segments=[{"start": 0.0, "end": 10.0}],
        speech_segments=[{"start": 3.0, "end": 5.0}],
        overlap_threshold=0.1,
        min_kept_segment_duration=0.5,
    )

    assert safe_segments == [
        {"start": 0.0, "end": 3.0, "duration": 3.0},
        {"start": 5.0, "end": 10.0, "duration": 5.0},
    ]
    assert stats["input_segment_count"] == 1
    assert stats["safe_segment_count"] == 2
    assert stats["violation_count"] == 1
    assert violations == [
        {
            "start": 0.0,
            "end": 10.0,
            "duration": 10.0,
            "speech_start": 3.0,
            "speech_end": 5.0,
            "overlap": 2.0,
        }
    ]


def test_trim_removal_segments_drops_short_remaining_pieces():
    safe_segments, stats, _ = trim_removal_segments_for_speech(
        removal_segments=[{"start": 0.0, "end": 1.0}],
        speech_segments=[{"start": 0.4, "end": 0.7}],
        overlap_threshold=0.0,
        min_kept_segment_duration=0.45,
    )

    assert safe_segments == []
    assert stats["safe_segment_count"] == 0
