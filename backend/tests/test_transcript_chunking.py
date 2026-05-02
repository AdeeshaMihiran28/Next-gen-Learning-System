from __future__ import annotations

import json

from app.services.transcript_chunking import chunk_transcript_by_time, load_transcript_segments


def test_load_transcript_segments_normalizes_values(workspace_tmp_path):
    transcript_path = workspace_tmp_path / "transcript.json"
    transcript_path.write_text(
        json.dumps(
            {
                "segments": [
                    {"start": 0, "end": 5, "text": " Intro "},
                    {"start": 5, "end": 12.5, "text": "Topic A"},
                ]
            }
        ),
        encoding="utf-8",
    )

    segments = load_transcript_segments(transcript_path)

    assert segments == [
        {"start": 0.0, "end": 5.0, "text": "Intro"},
        {"start": 5.0, "end": 12.5, "text": "Topic A"},
    ]


def test_chunk_transcript_by_time_groups_segments_into_time_windows():
    chunks = chunk_transcript_by_time(
        [
            {"start": 0.0, "end": 120.0, "text": "Intro"},
            {"start": 200.0, "end": 260.0, "text": "Part one"},
            {"start": 700.0, "end": 760.0, "text": "Part two"},
        ],
        chunk_size_seconds=600,
    )

    assert chunks == [
        {"start": 0.0, "end": 260.0, "text": "Intro Part one"},
        {"start": 700.0, "end": 760.0, "text": "Part two"},
    ]
