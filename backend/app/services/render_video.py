"""Helpers for rendering videos from selected segments with ffmpeg."""

from __future__ import annotations

import subprocess
from shutil import rmtree
from pathlib import Path
from typing import Any

from app.services.ffmpeg import FFmpegNotFound


def render_cleaned_video(
    input_path: Path,
    kept_segments: list[dict[str, Any]],
    output_path: Path,
) -> Path:
    """Render the cleaned video from kept segments using ffmpeg."""
    return _render_segments(input_path, kept_segments, output_path, stem="cleaned")


def render_preview_video(
    input_path: Path,
    segments: list[dict[str, Any]],
    output_path: Path,
    *,
    preview_type: str = "preview",
) -> Path | None:
    """Render a preview video from the provided segments using ffmpeg."""
    if not segments:
        return None

    return _render_segments(input_path, segments, output_path, stem=preview_type)


def _render_segments(
    input_path: Path,
    segments: list[dict[str, Any]],
    output_path: Path,
    *,
    stem: str,
) -> Path:
    if not segments:
        raise ValueError("At least one segment is required for rendering")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output_path.parent / f".{stem}_parts"
    temp_dir.mkdir(parents=True, exist_ok=True)
    concat_file = temp_dir / f"{stem}.concat.txt"

    part_paths: list[Path] = []

    try:
        for index, segment in enumerate(segments):
            start = float(segment["start"])
            end = float(segment["end"])
            duration = max(0.0, end - start)
            if duration <= 0:
                continue

            part_path = temp_dir / f"{stem}_{index:04d}.mp4"
            _render_segment_clip(input_path, start, duration, part_path)
            part_paths.append(part_path)

        if not part_paths:
            raise ValueError("No renderable segments were produced")

        concat_file.write_text(
            "\n".join(f"file '{part_path.resolve().as_posix()}'" for part_path in part_paths) + "\n",
            encoding="utf-8",
        )

        _concat_segment_clips(concat_file, output_path)
        return output_path
    finally:
        for part_path in part_paths:
            if part_path.exists():
                part_path.unlink()
        if concat_file.exists():
            concat_file.unlink()
        if temp_dir.exists():
            rmtree(temp_dir, ignore_errors=True)


def _render_segment_clip(
    input_path: Path,
    start: float,
    duration: float,
    output_path: Path,
) -> None:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(start),
                "-i",
                str(input_path),
                "-t",
                str(duration),
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            "ffmpeg was not found. Install FFmpeg and ensure ffmpeg is available on PATH."
        ) from exc


def _concat_segment_clips(concat_file: Path, output_path: Path) -> None:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise FFmpegNotFound(
            "ffmpeg was not found. Install FFmpeg and ensure ffmpeg is available on PATH."
        ) from exc
