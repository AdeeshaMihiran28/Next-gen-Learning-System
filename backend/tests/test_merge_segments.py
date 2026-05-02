from __future__ import annotations

from app.services.merge_segments import (
    apply_freeze_rules,
    build_good_segments,
    merge_bad_segments,
    normalize_segments,
)


def test_normalize_segments_sets_common_fields():
    normalized = normalize_segments(
        [{"start": 1, "end": 3, "source_metadata": {"score": 0.9}}],
        reason="black",
    )

    assert normalized == [
        {
            "start": 1.0,
            "end": 3.0,
            "duration": 2.0,
            "reasons": ["black"],
            "source_metadata": {"score": 0.9},
        }
    ]


def test_merge_bad_segments_combines_ranges_and_reasons():
    merged = merge_bad_segments(
        [
            {
                "start": 0.0,
                "end": 2.0,
                "reasons": ["black"],
                "source_metadata": {"evidence_count": 1, "score": 0.7},
            },
            {
                "start": 1.5,
                "end": 4.0,
                "reasons": ["silence"],
                "source_metadata": {"evidence_count": 1, "score": 0.95},
            },
        ]
    )

    assert merged == [
        {
            "start": 0.0,
            "end": 4.0,
            "duration": 4.0,
            "reasons": ["black", "silence"],
            "source_metadata": {"score": 0.95, "evidence_count": 2},
        }
    ]


def test_build_good_segments_inverts_removed_ranges():
    good_segments = build_good_segments(
        [
            {"start": 2.0, "end": 4.0, "reasons": ["black"], "source_metadata": {}},
            {"start": 6.0, "end": 7.0, "reasons": ["silence"], "source_metadata": {}},
        ],
        total_duration=10.0,
    )

    assert good_segments == [
        {"start": 0.0, "end": 2.0, "duration": 2.0},
        {"start": 4.0, "end": 6.0, "duration": 2.0},
        {"start": 7.0, "end": 10.0, "duration": 3.0},
    ]


def test_apply_freeze_rules_filters_short_segments():
    filtered = apply_freeze_rules(
        [
            {"start": 0.0, "end": 0.5, "duration": 0.5, "reasons": ["freeze"]},
            {"start": 1.0, "end": 3.0, "duration": 2.0, "reasons": ["freeze"]},
        ],
        min_duration=1.0,
    )

    assert filtered == [
        {
            "start": 1.0,
            "end": 3.0,
            "duration": 2.0,
            "reasons": ["freeze"],
            "source_metadata": {},
        }
    ]
