"""Black screen detection helpers using FFmpeg blackdetect."""

from __future__ import annotations

import re
from pathlib import Path

from app.services.ffmpeg import run_ffmpeg_command


BLACK_SEGMENT_PATTERN = re.compile(
    r"black_start:(?P<start>\d+(?:\.\d+)?)\s+"
    r"black_end:(?P<end>\d+(?:\.\d+)?)"
)


def detect_black_segments(
    input_path: Path,
    log_path: Path,
    *,
    black_duration: float = 0.2,
    pixel_threshold: float = 0.98,
) -> list[dict[str, float]]:
    """Run blackdetect and return detected black screen segments."""
    log_path.parent.mkdir(parents=True, exist_ok=True)

    result = run_ffmpeg_command(
        [
            "-hide_banner",
            "-i",
            str(input_path),
            "-vf",
            f"blackdetect=d={black_duration}:pix_th={pixel_threshold}",
            "-an",
            "-f",
            "null",
            "-",
        ],
        check=False,
    )

    log_contents = result.stderr.strip() or result.stdout.strip()
    log_path.write_text(f"{log_contents}\n" if log_contents else "", encoding="utf-8")

    return _parse_blackdetect_log(log_contents)


def _parse_blackdetect_log(log_contents: str) -> list[dict[str, float]]:
    segments: list[dict[str, float]] = []

    for match in BLACK_SEGMENT_PATTERN.finditer(log_contents):
        start = float(match.group("start"))
        end = float(match.group("end"))
        segments.append(
            {
                "start": start,
                "end": end,
                "duration": max(0.0, end - start),
            }
        )

    return segments
