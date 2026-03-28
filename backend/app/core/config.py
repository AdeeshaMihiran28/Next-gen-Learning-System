"""Environment-backed configuration for the backend app."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]

load_dotenv(BASE_DIR / ".env")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "data" / "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", BASE_DIR / "data" / "outputs"))
TEMPLATE_DIR = Path(os.getenv("TEMPLATE_DIR", BASE_DIR / "data" / "templates"))

for directory in (UPLOAD_DIR, OUTPUT_DIR, TEMPLATE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_MODEL = os.getenv("GOOGLE_MODEL", "")
