"""Main processing pipeline orchestration for lecture video cleaning."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import OUTPUT_DIR, TEMPLATE_DIR
from app.domain.jobs import Job, JobStore, append_job_log
from app.services.buffering_detect import detect_buffering_segments, load_template_images
from app.services.confidence import add_confidence_to_segments
from app.services.detect_black import detect_black_segments
from app.services.detect_silence import detect_silence_segments
from app.services.ffmpeg import get_video_duration, validate_rendered_video
from app.services.freeze_detect import detect_freeze_segments
from app.services.merge_segments import (
    apply_freeze_rules,
    build_good_segments,
    merge_bad_segments,
    normalize_segments,
)
from app.services.render_video import render_cleaned_video, render_preview_video
from app.services.safety_trim import trim_removal_segments_for_speech
from app.services.segment_gating import gate_freeze_segments
from app.services.whisper_speech import (
    build_no_speech_gaps,
    extract_audio_to_wav,
    merge_nearby_speech_segments,
    transcribe_wav_with_whisper,
)
from app.utils.artifacts import build_artifact_path
from app.utils.files import cleanup_paths, create_job_dir, write_segments_csv


def run_job_pipeline(job_id: str) -> Job:
    """Run the full processing pipeline for a stored job."""
    job = JobStore.get(job_id)
    if job is None:
        raise ValueError(f"Job '{job_id}' was not found")
    if job.input_path is None:
        raise ValueError(f"Job '{job_id}' has no input video")

    output_dir = create_job_dir(OUTPUT_DIR, job_id)
    options = job.options

    black_log_path = output_dir / "black.log"
    silence_log_path = output_dir / "silence.log"
    validation_log_path = output_dir / "validation.log"
    audio_path = output_dir / "audio.wav"

    black_json_path = build_artifact_path(job_id, "black_log")
    silence_json_path = build_artifact_path(job_id, "silence_log")
    freeze_json_path = build_artifact_path(job_id, "freeze_json")
    buffering_json_path = build_artifact_path(job_id, "buffering_json")
    transcript_json_path = build_artifact_path(job_id, "transcript_json")
    segments_csv_path = build_artifact_path(job_id, "segments_csv")
    removed_preview_path = build_artifact_path(job_id, "removed_preview")
    kept_preview_path = build_artifact_path(job_id, "kept_preview")
    cleaned_video_path = build_artifact_path(job_id, "cleaned")
    report_path = build_artifact_path(job_id, "report")

    artifacts: dict[str, str | None] = {
        "black_log": str(black_json_path.name),
        "silence_log": str(silence_json_path.name),
        "freeze_json": str(freeze_json_path.name),
        "buffering_json": str(buffering_json_path.name),
        "transcript_json": str(transcript_json_path.name),
        "segments_csv": str(segments_csv_path.name),
        "removed_preview": None,
        "kept_preview": None,
        "cleaned": str(cleaned_video_path.name),
        "report": str(report_path.name),
        "validation_log": str(validation_log_path.name),
    }

    try:
        _update_job(job, status="running", progress=5, error_message=None)
        append_job_log(job, "Pipeline started")

        total_duration = get_video_duration(job.input_path)
        append_job_log(job, f"Video duration detected: {total_duration:.2f} seconds")

        _update_job(job, progress=10)
        append_job_log(job, "Running black detection")
        black_segments = detect_black_segments(
            job.input_path,
            black_log_path,
            black_duration=options.black_d,
            pixel_threshold=options.black_pix_th,
        )
        _write_json(black_json_path, black_segments)
        append_job_log(job, f"Black detection found {len(black_segments)} segment(s)")

        _update_job(job, progress=18)
        buffering_segments: list[dict[str, Any]] = []
        if options.enable_buffering_detect:
            append_job_log(job, "Running buffering detection")
            template_paths = _resolve_template_paths(options.buffering_template_ids)
            templates = load_template_images(template_paths)
            buffering_segments = detect_buffering_segments(
                job.input_path,
                templates,
                sample_fps=options.buffering_sample_fps,
                match_threshold=options.buffering_match_thresh,
                min_duration=options.buffering_min_d,
            )
            append_job_log(
                job,
                f"Buffering detection used {len(templates)} template(s) and found {len(buffering_segments)} segment(s)",
            )
        else:
            append_job_log(job, "Buffering detection disabled")
        _write_json(buffering_json_path, buffering_segments)

        _update_job(job, progress=28)
        append_job_log(job, "Running silence detection")
        silence_segments = detect_silence_segments(
            job.input_path,
            silence_log_path,
            noise_db=options.silence_noise_db,
            min_duration=options.silence_d,
        )
        _write_json(silence_json_path, silence_segments)
        append_job_log(job, f"Silence detection found {len(silence_segments)} segment(s)")

        _update_job(job, progress=36)
        freeze_segments: list[dict[str, Any]] = []
        if options.freeze_enabled:
            append_job_log(job, "Running freeze detection")
            freeze_segments = detect_freeze_segments(
                job.input_path,
                sampling_fps=options.freeze_sampling_fps,
                diff_threshold=options.freeze_diff_threshold,
                min_freeze_duration=options.freeze_min_duration,
            )
            append_job_log(job, f"Freeze detection found {len(freeze_segments)} segment(s)")
        else:
            append_job_log(job, "Freeze detection disabled")
        _write_json(freeze_json_path, freeze_segments)

        _update_job(job, progress=48)
        append_job_log(job, "Extracting audio and running Whisper transcription")
        extract_audio_to_wav(job.input_path, audio_path)
        transcript_text, raw_speech_segments = transcribe_wav_with_whisper(
            audio_path,
            transcript_json_path,
            model_name=options.whisper_model,
            language=options.whisper_language,
        )
        append_job_log(job, f"Whisper produced {len(raw_speech_segments)} speech segment(s)")

        _update_job(job, progress=58)
        append_job_log(job, "Building speech segments and no-speech gaps")
        speech_segments = merge_nearby_speech_segments(
            raw_speech_segments,
            max_gap=options.speech_overlap_threshold_sec,
        )
        no_speech_segments = build_no_speech_gaps(
            speech_segments,
            total_duration,
            min_gap_duration=options.no_speech_min_d,
        )
        append_job_log(
            job,
            f"Built {len(speech_segments)} merged speech segment(s) and {len(no_speech_segments)} no-speech gap(s)",
        )

        _update_job(job, progress=64)
        append_job_log(job, "Gating freeze detections against speech")
        gated_freeze_segments = gate_freeze_segments(
            freeze_segments,
            no_speech_segments,
            min_no_speech_overlap=options.freeze_min_no_speech_overlap,
            force_remove_threshold=options.freeze_force_remove_sec,
        )
        gated_freeze_segments = apply_freeze_rules(
            _attach_reason_and_metadata(gated_freeze_segments, "freeze"),
            min_duration=options.freeze_min_duration,
        )
        append_job_log(job, f"Freeze gating kept {len(gated_freeze_segments)} removable freeze segment(s)")

        _update_job(job, progress=72)
        append_job_log(job, "Normalizing and merging bad segments")
        all_bad_segments = []
        all_bad_segments.extend(_attach_reason_and_metadata(black_segments, "black"))
        all_bad_segments.extend(_attach_reason_and_metadata(silence_segments, "silence"))
        all_bad_segments.extend(_attach_reason_and_metadata(buffering_segments, "buffering"))
        all_bad_segments.extend(gated_freeze_segments)

        normalized_bad_segments = _normalize_bad_segments(all_bad_segments)
        merged_bad_segments = merge_bad_segments(normalized_bad_segments)
        append_job_log(
            job,
            f"Merged {len(normalized_bad_segments)} raw bad segment(s) into {len(merged_bad_segments)} segment(s)",
        )

        _update_job(job, progress=78)
        append_job_log(job, "Applying speech-safe trimming")
        overlap_threshold = 0.0 if options.strict_no_cut_speech else options.speech_overlap_threshold_sec
        safe_removal_segments, safety_statistics, overlap_violations = trim_removal_segments_for_speech(
            merged_bad_segments,
            speech_segments,
            overlap_threshold=overlap_threshold,
            min_kept_segment_duration=0.1,
        )
        append_job_log(
            job,
            f"Speech-safe trimming kept {len(safe_removal_segments)} removal segment(s) with {len(overlap_violations)} overlap violation(s)",
        )

        _update_job(job, progress=82)
        append_job_log(job, "Assigning confidence to removal segments")
        confident_removal_segments = add_confidence_to_segments(safe_removal_segments)
        append_job_log(job, f"Assigned confidence to {len(confident_removal_segments)} removal segment(s)")

        _update_job(job, progress=86)
        append_job_log(job, "Building kept segments")
        good_segments = build_good_segments(confident_removal_segments, total_duration)
        if not good_segments:
            raise RuntimeError("No kept segments remain after filtering")
        append_job_log(job, f"Built {len(good_segments)} kept segment(s)")

        append_job_log(job, "Writing segments.csv")
        written_segments_csv = write_segments_csv(output_dir, confident_removal_segments)
        if written_segments_csv != segments_csv_path:
            segments_csv_path.write_text(written_segments_csv.read_text(encoding="utf-8"), encoding="utf-8")
            written_segments_csv.unlink(missing_ok=True)

        _update_job(job, progress=90)
        append_job_log(job, "Rendering removed preview")
        removed_preview = render_preview_video(
            job.input_path,
            confident_removal_segments,
            removed_preview_path,
            preview_type="removed_preview",
        )
        artifacts["removed_preview"] = removed_preview.name if removed_preview is not None else None

        kept_preview = None
        if options.generate_kept_preview:
            append_job_log(job, "Rendering kept preview")
            kept_preview = render_preview_video(
                job.input_path,
                good_segments,
                kept_preview_path,
                preview_type="kept_preview",
            )
        artifacts["kept_preview"] = kept_preview.name if kept_preview is not None else None

        _update_job(job, progress=94)
        append_job_log(job, "Rendering final cleaned video")
        render_cleaned_video(job.input_path, good_segments, cleaned_video_path)

        _update_job(job, progress=97)
        append_job_log(job, "Validating rendered output")
        output_is_valid = validate_rendered_video(cleaned_video_path, validation_log_path)

        append_job_log(job, "Writing report.json")
        report = _build_report(
            job,
            status="done" if output_is_valid else "failed_validation",
            duration_seconds=total_duration,
            transcript_text=transcript_text,
            speech_segments=speech_segments,
            no_speech_segments=no_speech_segments,
            detections={
                "black": black_segments,
                "buffering": buffering_segments,
                "silence": silence_segments,
                "freeze": freeze_segments,
                "gated_freeze": gated_freeze_segments,
            },
            removed_segments=confident_removal_segments,
            kept_segments=good_segments,
            safety_statistics=safety_statistics,
            overlap_violations=overlap_violations,
            artifacts=artifacts,
            output_valid=output_is_valid,
        )
        _write_json(report_path, report)

        final_status = "done" if output_is_valid else "failed"
        final_error = None if output_is_valid else "Rendered output failed ffmpeg validation"
        _update_job(
            job,
            status=final_status,
            progress=100,
            output_path=cleaned_video_path,
            report_path=report_path,
            error_message=final_error,
        )
        append_job_log(job, f"Pipeline completed with status '{final_status}'")
        return job
    except Exception as exc:
        _update_job(job, status="failed", error_message=str(exc))
        append_job_log(job, f"Pipeline failed: {exc}")
        error_report = _build_report(
            job,
            status="failed",
            error_message=str(exc),
            artifacts=artifacts,
        )
        _write_json(report_path, error_report)
        raise
    finally:
        cleanup_paths([audio_path])


def _update_job(job: Job, **changes: object) -> Job:
    updated_job = JobStore.update(job.job_id, **changes)
    if updated_job is None:
        raise ValueError(f"Job '{job.job_id}' was not found during update")
    return updated_job


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _build_report(
    job: Job,
    *,
    status: str,
    error_message: str | None = None,
    duration_seconds: float | None = None,
    transcript_text: str = "",
    speech_segments: list[dict[str, Any]] | None = None,
    no_speech_segments: list[dict[str, Any]] | None = None,
    detections: dict[str, Any] | None = None,
    removed_segments: list[dict[str, Any]] | None = None,
    kept_segments: list[dict[str, Any]] | None = None,
    safety_statistics: dict[str, Any] | None = None,
    overlap_violations: list[dict[str, Any]] | None = None,
    artifacts: dict[str, str | None] | None = None,
    output_valid: bool | None = None,
) -> dict[str, Any]:
    return {
        "job_id": job.job_id,
        "status": status,
        "error_message": error_message,
        "duration_seconds": duration_seconds,
        "transcript_text": transcript_text,
        "speech_segments": speech_segments or [],
        "no_speech_segments": no_speech_segments or [],
        "detections": detections or {},
        "removed_segments": removed_segments or [],
        "kept_segments": kept_segments or [],
        "safety_statistics": safety_statistics or {},
        "overlap_violations": overlap_violations or [],
        "artifacts": artifacts or {},
        "output_valid": output_valid,
        "logs": list(job.logs),
    }


def _resolve_template_paths(template_ids: list[str]) -> list[Path]:
    if template_ids:
        return [
            path
            for template_id in template_ids
            for path in TEMPLATE_DIR.glob(f"{template_id}.*")
            if path.suffix.lower() in {".png", ".jpg", ".jpeg"}
        ]

    return [
        path
        for path in TEMPLATE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg"}
    ]


def _attach_reason_and_metadata(
    segments: list[dict[str, Any]],
    reason: str,
) -> list[dict[str, Any]]:
    enriched_segments: list[dict[str, Any]] = []

    for segment in segments:
        enriched_segment = dict(segment)
        enriched_segment["reasons"] = [reason]
        enriched_segment["source_metadata"] = {
            "evidence_count": 1,
        }
        if "score" in segment:
            enriched_segment["source_metadata"]["score"] = float(segment["score"])
        enriched_segments.append(enriched_segment)

    return enriched_segments


def _normalize_bad_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for segment in segments:
        reason = str(segment.get("reasons", ["unknown"])[0])
        base = normalize_segments([segment], reason=reason)[0]
        base["source_metadata"] = dict(segment.get("source_metadata", {}))
        normalized.append(base)

    return normalized
