"""Freeze detection helpers using OpenCV frame differencing."""

from __future__ import annotations

from pathlib import Path

import cv2


def detect_freeze_segments(
    input_path: Path,
    *,
    sampling_fps: int = 2,
    diff_threshold: float = 0.01,
    min_freeze_duration: float = 1.0,
) -> list[dict[str, float]]:
    """Detect freeze periods by sampling frames and comparing consecutive samples."""
    if sampling_fps <= 0:
        raise ValueError("sampling_fps must be greater than 0")

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video file '{input_path}'")

    try:
        source_fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        sample_interval = _compute_sample_interval(source_fps, sampling_fps)

        segments: list[dict[str, float]] = []
        previous_frame = None
        previous_time = 0.0
        frame_index = 0
        freeze_start: float | None = None
        last_sample_time = 0.0

        while True:
            success, frame = capture.read()
            if not success:
                break

            if frame_index % sample_interval != 0:
                frame_index += 1
                continue

            current_time = _frame_time(frame_index, source_fps, sampling_fps)
            current_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if previous_frame is not None:
                frame_diff = _normalized_frame_difference(previous_frame, current_frame)

                if frame_diff <= diff_threshold:
                    if freeze_start is None:
                        freeze_start = previous_time
                elif freeze_start is not None:
                    duration = current_time - freeze_start
                    if duration >= min_freeze_duration:
                        segments.append(
                            {
                                "start": freeze_start,
                                "end": current_time,
                                "duration": duration,
                            }
                        )
                    freeze_start = None

            previous_frame = current_frame
            previous_time = current_time
            last_sample_time = current_time
            frame_index += 1

        if freeze_start is not None:
            duration = last_sample_time - freeze_start
            if duration >= min_freeze_duration:
                segments.append(
                    {
                        "start": freeze_start,
                        "end": last_sample_time,
                        "duration": duration,
                    }
                )

        return segments
    finally:
        capture.release()


def _compute_sample_interval(source_fps: float, sampling_fps: int) -> int:
    if source_fps <= 0:
        return 1
    return max(int(round(source_fps / sampling_fps)), 1)


def _frame_time(frame_index: int, source_fps: float, sampling_fps: int) -> float:
    if source_fps > 0:
        return frame_index / source_fps
    return frame_index / sampling_fps


def _normalized_frame_difference(previous_frame, current_frame) -> float:
    diff = cv2.absdiff(previous_frame, current_frame)
    return float(diff.mean()) / 255.0
