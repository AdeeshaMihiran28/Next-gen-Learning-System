"""Helpers for interacting with ffmpeg and ffprobe."""

from __future__ import annotations

import subprocess
from pathlib import Path


class FFmpegNotFound(RuntimeError):
    """Raised when ffmpeg or ffprobe is not available on PATH."""


def run_ffmpeg_command(
    args: list[str],
    *,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    """Run an ffmpeg command with consistent error handling."""
    return _run_binary("ffmpeg", args, check=check)


def run_ffprobe_command(
    args: list[str],
    *,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    """Run an ffprobe command with consistent error handling."""
    return _run_binary("ffprobe", args, check=check)


def get_video_duration(video_path: Path) -> float:
    """Return the total video duration in seconds using ffprobe."""
    result = run_ffprobe_command(
        [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
    )

    output = result.stdout.strip()
    if not output:
        raise ValueError(f"ffprobe did not return a duration for '{video_path}'")

    try:
        return float(output)
    except ValueError as exc:
        raise ValueError(f"ffprobe returned an invalid duration for '{video_path}': {output}") from exc


def validate_rendered_video(video_path: Path, log_path: Path) -> bool:
    """Validate a rendered video with ffmpeg and write command output to a log file."""
    log_path.parent.mkdir(parents=True, exist_ok=True)

    result = run_ffmpeg_command(
        [
            "-v",
            "error",
            "-i",
            str(video_path),
            "-f",
            "null",
            "-",
        ],
        check=False,
    )

    log_contents = result.stderr.strip() or result.stdout.strip() or "Validation passed with no ffmpeg errors."
    log_path.write_text(f"{log_contents}\n", encoding="utf-8")

    return result.returncode == 0


def _run_binary(
    binary_name: str,
    args: list[str],
    *,
    check: bool,
) -> subprocess.CompletedProcess[str]:
    command = [binary_name, *args]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            f"{binary_name} was not found. Install FFmpeg and ensure {binary_name} is available on PATH."
        ) from exc

    if check and result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or "No process output captured."
        raise RuntimeError(f"{binary_name} command failed: {details}")

    return result
