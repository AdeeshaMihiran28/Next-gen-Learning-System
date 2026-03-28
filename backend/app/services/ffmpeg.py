"""Helpers for interacting with ffmpeg and ffprobe."""

from __future__ import annotations

import subprocess
from pathlib import Path


class FFmpegNotFound(RuntimeError):
    """Raised when ffmpeg or ffprobe is not available on PATH."""


def get_video_duration(video_path: Path) -> float:
    """Return the total video duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            "ffprobe was not found. Install FFmpeg and ensure ffprobe is available on PATH."
        ) from exc

    output = result.stdout.strip()
    if not output:
        raise ValueError(f"ffprobe did not return a duration for '{video_path}'")

    return float(output)


def validate_rendered_video(video_path: Path, log_path: Path) -> bool:
    """Validate a rendered video with ffmpeg and write command output to a log file."""
    log_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(video_path),
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

    log_contents = result.stderr.strip() or result.stdout.strip() or "Validation passed with no ffmpeg errors."
    log_path.write_text(f"{log_contents}\n", encoding="utf-8")

    return result.returncode == 0
