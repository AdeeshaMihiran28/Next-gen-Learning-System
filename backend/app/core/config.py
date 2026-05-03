"""Environment-backed configuration for the backend app."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]

load_dotenv(BASE_DIR / ".env")

def _resolve_env_path(name: str, default: Path) -> Path:
    raw_value = os.getenv(name)
    candidate = Path(raw_value) if raw_value else default
    if not candidate.is_absolute():
        candidate = BASE_DIR / candidate
    return candidate.resolve()


UPLOAD_DIR = _resolve_env_path("UPLOAD_DIR", BASE_DIR / "data" / "uploads")
OUTPUT_DIR = _resolve_env_path("OUTPUT_DIR", BASE_DIR / "data" / "outputs")
TEMPLATE_DIR = _resolve_env_path("TEMPLATE_DIR", BASE_DIR / "data" / "templates")

for directory in (UPLOAD_DIR, OUTPUT_DIR, TEMPLATE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

_default_cors_origins = "http://localhost:5173,http://127.0.0.1:5173"
_raw_cors_origins = os.getenv("CORS_ORIGINS")
_effective_cors_origins = _raw_cors_origins if _raw_cors_origins and _raw_cors_origins.strip() else _default_cors_origins

CORS_ORIGINS = [
    origin.strip()
    for origin in _effective_cors_origins.split(",")
    if origin.strip()
]

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")
GOOGLE_MODEL = os.getenv("GOOGLE_MODEL") or os.getenv("GEMINI_MODEL_NAME", "")
