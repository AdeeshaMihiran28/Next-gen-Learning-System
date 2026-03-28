"""Whisper transcription and speech timing helpers."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from app.services.ffmpeg import FFmpegNotFound


def extract_audio_to_wav(video_path: Path, wav_path: Path) -> Path:
    """Extract mono 16 kHz WAV audio from a video using ffmpeg."""
    wav_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(wav_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            "ffmpeg was not found. Install FFmpeg and ensure ffmpeg is available on PATH."
        ) from exc

    return wav_path


def transcribe_wav_with_whisper(
    wav_path: Path,
    transcript_path: Path,
    *,
    model_name: str = "base",
    language: str | None = "en",
) -> tuple[str, list[dict[str, Any]]]:
    """Transcribe a WAV file with local Whisper and persist transcript.json."""
    try:
        import whisper
    except ImportError as exc:
        raise RuntimeError(
            "The 'whisper' package is not installed. Install local Whisper to enable transcription."
        ) from exc

    model = whisper.load_model(model_name)
    result = model.transcribe(
        str(wav_path),
        language=language or None,
        verbose=False,
    )

    transcript_text = (result.get("text") or "").strip()
    speech_segments = _normalize_speech_segments(result.get("segments", []))

    payload = {
        "text": transcript_text,
        "segments": speech_segments,
    }

    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return transcript_text, speech_segments


def merge_nearby_speech_segments(
    speech_segments: list[dict[str, Any]],
    *,
    max_gap: float = 0.2,
) -> list[dict[str, Any]]:
    """Merge speech segments separated by small gaps."""
    if not speech_segments:
        return []

    normalized_segments = sorted(
        (
            {
                "start": float(segment["start"]),
                "end": float(segment["end"]),
                "duration": max(0.0, float(segment["end"]) - float(segment["start"])),
                "text": str(segment.get("text", "")).strip(),
            }
            for segment in speech_segments
        ),
        key=lambda segment: segment["start"],
    )

    merged_segments = [normalized_segments[0]]

    for segment in normalized_segments[1:]:
        current = merged_segments[-1]
        gap = segment["start"] - current["end"]

        if gap <= max_gap:
            current["end"] = max(current["end"], segment["end"])
            current["duration"] = max(0.0, current["end"] - current["start"])
            current_text = current.get("text", "")
            next_text = segment.get("text", "")
            current["text"] = " ".join(part for part in (current_text, next_text) if part).strip()
            continue

        merged_segments.append(segment)

    return merged_segments


def build_no_speech_gaps(
    speech_segments: list[dict[str, Any]],
    total_duration: float,
    *,
    min_gap_duration: float = 0.0,
) -> list[dict[str, float]]:
    """Build no-speech intervals from speech segments and total duration."""
    if total_duration < 0:
        raise ValueError("total_duration must be non-negative")

    merged_segments = merge_nearby_speech_segments(speech_segments, max_gap=0.0)
    gaps: list[dict[str, float]] = []
    cursor = 0.0

    for segment in merged_segments:
        start = max(0.0, float(segment["start"]))
        end = min(total_duration, float(segment["end"]))

        if start > cursor:
            duration = start - cursor
            if duration >= min_gap_duration:
                gaps.append(
                    {
                        "start": cursor,
                        "end": start,
                        "duration": duration,
                    }
                )

        cursor = max(cursor, end)

    if cursor < total_duration:
        duration = total_duration - cursor
        if duration >= min_gap_duration:
            gaps.append(
                {
                    "start": cursor,
                    "end": total_duration,
                    "duration": duration,
                }
            )

    return gaps


def _normalize_speech_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_segments: list[dict[str, Any]] = []

    for segment in segments:
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        normalized_segments.append(
            {
                "start": start,
                "end": end,
                "duration": max(0.0, end - start),
                "text": str(segment.get("text", "")).strip(),
            }
        )

    return normalized_segments
