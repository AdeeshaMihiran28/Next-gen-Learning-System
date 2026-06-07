"""Template storage helpers for buffering detection images."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4

from app.core.config import TEMPLATE_DIR


ALLOWED_TEMPLATE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_TEMPLATE_SIZE_BYTES = 10 * 1024 * 1024


class InvalidTemplateFile(ValueError):
    """Raised when a template file does not pass validation."""


def save_templates(files: Sequence[dict[str, Any]]) -> list[dict[str, object]]:
    """Validate and save template image payloads."""
    saved_templates: list[dict[str, object]] = []

    for file in files:
        filename = str(file.get("filename") or "")
        extension = validate_template_extension(filename)
        content = bytes(file.get("content") or b"")

        if len(content) > MAX_TEMPLATE_SIZE_BYTES:
            raise InvalidTemplateFile(f"File '{filename}' exceeds the 10 MB size limit")

        template_id = uuid4().hex
        saved_path = TEMPLATE_DIR / f"{template_id}{extension}"
        saved_path.write_bytes(content)

        saved_templates.append(
            {
                "template_id": template_id,
                "filename": saved_path.name,
                "content_type": file.get("content_type"),
                "size": len(content),
            }
        )

    return saved_templates


def list_saved_templates() -> list[dict[str, object]]:
    """List stored template image metadata."""
    templates: list[dict[str, object]] = []

    for path in sorted(TEMPLATE_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in ALLOWED_TEMPLATE_EXTENSIONS:
            continue

        templates.append(
            {
                "template_id": path.stem,
                "filename": path.name,
                "size": path.stat().st_size,
            }
        )

    return templates


def delete_saved_template(template_id: str) -> bool:
    """Delete template files matching the provided template ID."""
    matches = [
        path
        for path in TEMPLATE_DIR.iterdir()
        if path.is_file() and path.stem == template_id
    ]

    if not matches:
        return False

    for path in matches:
        path.unlink()

    return True


def validate_template_extension(filename: str | None) -> str:
    """Validate that a template filename uses a supported extension."""
    extension = Path(filename or "").suffix.lower()
    if extension not in ALLOWED_TEMPLATE_EXTENSIONS:
        raise InvalidTemplateFile("Only .png, .jpg, and .jpeg template files are allowed")

    return extension
