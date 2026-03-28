"""Pydantic response models for the backend API."""

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    job_id: str


class RunResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    created_at: str
    updated_at: str
    logs: list[str]
    output_url: str | None
    error_message: str | None


class ProcessingOptions(BaseModel):
    black_d: float = 0.2
    black_pix_th: float = 0.98
    silence_noise_db: int = -35
    silence_d: float = 0.5
    freeze_enabled: bool = True
    freeze_sampling_fps: int = 2
    freeze_diff_threshold: float = 0.01
    freeze_min_duration: float = 1.0
    generate_kept_preview: bool = False
    enable_buffering_detect: bool = True
    buffering_sample_fps: int = 1
    buffering_match_thresh: float = 0.9
    buffering_min_d: float = 1.0
    buffering_template_ids: list[str] = Field(default_factory=list)
    whisper_model: str = "base"
    whisper_language: str = "en"
    no_speech_min_d: float = 0.75
    freeze_min_no_speech_overlap: float = 0.5
    freeze_force_remove_sec: float = 3.0
    strict_no_cut_speech: bool = True
    speech_overlap_threshold_sec: float = 0.2
