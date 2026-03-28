"""Silence detection helpers using FFmpeg silencedetect."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from app.services.ffmpeg import FFmpegNotFound


SILENCE_START_PATTERN = re.compile(r"silence_start:\s*(?P<start>\d+(?:\.\d+)?)")
SILENCE_END_PATTERN = re.compile(r"silence_end:\s*(?P<end>\d+(?:\.\d+)?)")


def detect_silence_segments(
    input_path: Path,
    log_path: Path,
    *,
    noise_db: int = -35,
    min_duration: float = 0.5,
) -> list[dict[str, float]]:
    """Run silencedetect and return detected silence segments."""
    log_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-i",
                str(input_path),
                "-af",
                f"silencedetect=n={noise_db}dB:d={min_duration}",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            "ffmpeg was not found. Install FFmpeg and ensure ffmpeg is available on PATH."
        ) from exc

    log_contents = result.stderr.strip() or result.stdout.strip()
    log_path.write_text(f"{log_contents}\n" if log_contents else "", encoding="utf-8")

    return _parse_silencedetect_log(log_contents)


def _parse_silencedetect_log(log_contents: str) -> list[dict[str, float]]:
    segments: list[dict[str, float]] = []
    starts = [float(match.group("start")) for match in SILENCE_START_PATTERN.finditer(log_contents)]
    ends = [float(match.group("end")) for match in SILENCE_END_PATTERN.finditer(log_contents)]

    for start, end in zip(starts, ends):
        segments.append(
            {
                "start": start,
                "end": end,
                "duration": max(0.0, end - start),
            }
        )

    return segments
