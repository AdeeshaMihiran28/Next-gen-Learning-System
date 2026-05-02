"""Buffering detection helpers using OpenCV template matching."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2


ALLOWED_TEMPLATE_SUFFIXES = {".png", ".jpg", ".jpeg"}


@dataclass(frozen=True)
class LoadedTemplate:
    path: Path
    image: object


def load_template_images(template_paths: Iterable[Path]) -> list[LoadedTemplate]:
    """Load PNG/JPG/JPEG template images from disk as grayscale images."""
    templates: list[LoadedTemplate] = []

    for template_path in template_paths:
        path = Path(template_path)
        if path.suffix.lower() not in ALLOWED_TEMPLATE_SUFFIXES:
            continue
        if not path.is_file():
            continue

        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            continue

        templates.append(LoadedTemplate(path=path, image=image))

    return templates


def detect_buffering_segments(
    input_path: Path,
    templates: list[LoadedTemplate],
    *,
    sample_fps: int = 1,
    match_threshold: float = 0.9,
    min_duration: float = 1.0,
) -> list[dict[str, float]]:
    """Detect buffering intervals by template matching sampled video frames."""
    if sample_fps <= 0:
        raise ValueError("sample_fps must be greater than 0")
    if not templates:
        return []

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video file '{input_path}'")

    try:
        source_fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        sample_interval = _compute_sample_interval(source_fps, sample_fps)

        segments: list[dict[str, float]] = []
        frame_index = 0
        interval_start: float | None = None
        interval_scores: list[float] = []
        last_sample_time = 0.0

        while True:
            success, frame = capture.read()
            if not success:
                break

            if frame_index % sample_interval != 0:
                frame_index += 1
                continue

            current_time = _frame_time(frame_index, source_fps, sample_fps)
            current_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            score = _best_template_score(current_frame, templates)

            if score >= match_threshold:
                if interval_start is None:
                    interval_start = current_time
                interval_scores.append(score)
            elif interval_start is not None:
                duration = current_time - interval_start
                if duration >= min_duration:
                    segments.append(
                        {
                            "start": interval_start,
                            "end": current_time,
                            "duration": duration,
                            "score": max(interval_scores),
                        }
                    )
                interval_start = None
                interval_scores = []

            last_sample_time = current_time
            frame_index += 1

        if interval_start is not None:
            duration = last_sample_time - interval_start
            if duration >= min_duration:
                segments.append(
                    {
                        "start": interval_start,
                        "end": last_sample_time,
                        "duration": duration,
                        "score": max(interval_scores),
                    }
                )

        return segments
    finally:
        capture.release()


def _best_template_score(frame, templates: list[LoadedTemplate]) -> float:
    best_score = 0.0

    for template in templates:
        template_height, template_width = template.image.shape[:2]
        frame_height, frame_width = frame.shape[:2]
        if template_height > frame_height or template_width > frame_width:
            continue

        result = cv2.matchTemplate(frame, template.image, cv2.TM_CCOEFF_NORMED)
        _, max_score, _, _ = cv2.minMaxLoc(result)
        best_score = max(best_score, float(max_score))

    return best_score


def _compute_sample_interval(source_fps: float, sample_fps: int) -> int:
    if source_fps <= 0:
        return 1
    return max(int(round(source_fps / sample_fps)), 1)


def _frame_time(frame_index: int, source_fps: float, sample_fps: int) -> float:
    if source_fps > 0:
        return frame_index / source_fps
    return frame_index / sample_fps
