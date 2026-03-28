"""HTTP endpoints for template image management."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import TEMPLATE_DIR


router = APIRouter()

ALLOWED_TEMPLATE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_TEMPLATE_SIZE_BYTES = 10 * 1024 * 1024


@router.post("/api/templates/upload", status_code=status.HTTP_201_CREATED)
async def upload_templates(files: list[UploadFile] = File(...)) -> dict[str, list[dict[str, object]]]:
    saved_templates: list[dict[str, object]] = []

    for file in files:
        extension = _validate_template_extension(file.filename)
        content = await file.read()
        await file.close()

        if len(content) > MAX_TEMPLATE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{file.filename}' exceeds the 10 MB size limit",
            )

        template_id = uuid4().hex
        saved_path = TEMPLATE_DIR / f"{template_id}{extension}"
        saved_path.write_bytes(content)

        saved_templates.append(
            {
                "template_id": template_id,
                "filename": saved_path.name,
                "content_type": file.content_type,
                "size": len(content),
            }
        )

    return {"templates": saved_templates}


@router.get("/api/templates")
async def list_templates() -> dict[str, list[dict[str, object]]]:
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

    return {"templates": templates}


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: str) -> dict[str, str]:
    matches = [
        path
        for path in TEMPLATE_DIR.iterdir()
        if path.is_file() and path.stem == template_id
    ]

    if not matches:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    for path in matches:
        path.unlink()

    return {"template_id": template_id, "status": "deleted"}


def _validate_template_extension(filename: str | None) -> str:
    extension = Path(filename or "").suffix.lower()
    extension = extension.lower()
    if extension not in ALLOWED_TEMPLATE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .png, .jpg, and .jpeg template files are allowed",
        )

    return extension
