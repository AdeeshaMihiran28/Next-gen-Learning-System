"""HTTP endpoints for template image management."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.services.template_store import (
    InvalidTemplateFile,
    delete_saved_template,
    list_saved_templates,
    save_templates,
)


router = APIRouter()


@router.post("/api/templates/upload", status_code=status.HTTP_201_CREATED)
async def upload_templates(files: list[UploadFile] = File(...)) -> dict[str, list[dict[str, object]]]:
    file_payloads: list[dict[str, object]] = []
    for file in files:
        content = await file.read()
        await file.close()
        file_payloads.append(
            {
                "filename": file.filename,
                "content_type": file.content_type,
                "content": content,
            }
        )

    try:
        saved_templates = save_templates(file_payloads)
    except InvalidTemplateFile as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {"templates": saved_templates}


@router.get("/api/templates")
async def list_templates() -> dict[str, list[dict[str, object]]]:
    return {"templates": list_saved_templates()}


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: str) -> dict[str, str]:
    if not delete_saved_template(template_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    return {"template_id": template_id, "status": "deleted"}
