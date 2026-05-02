"""PDF generation helpers for structured summaries."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer


def generate_summary_pdf(structured_summary: dict[str, Any], output_path: Path) -> Path:
    """Generate a summary PDF from structured summary data."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    styles = _build_styles()
    story = [
        Paragraph("Lecture Summary", styles["title"]),
        Spacer(1, 6 * mm),
    ]

    story.extend(_build_section("Overview", structured_summary.get("overview"), styles))
    story.extend(_build_section("Key Topics", structured_summary.get("key_topics"), styles))
    story.extend(_build_section("Definitions", structured_summary.get("definitions"), styles))
    story.extend(_build_section("Takeaways", structured_summary.get("takeaways"), styles))
    story.extend(_build_section("Outline", structured_summary.get("outline"), styles))

    document = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    document.build(story)
    return output_path


def _build_styles() -> dict[str, ParagraphStyle]:
    stylesheet = getSampleStyleSheet()

    return {
        "title": ParagraphStyle(
            "SummaryTitle",
            parent=stylesheet["Title"],
            fontSize=20,
            leading=24,
            spaceAfter=8,
        ),
        "heading": ParagraphStyle(
            "SummaryHeading",
            parent=stylesheet["Heading2"],
            fontSize=14,
            leading=18,
            spaceBefore=10,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "SummaryBody",
            parent=stylesheet["BodyText"],
            fontSize=10,
            leading=14,
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "SummaryBullet",
            parent=stylesheet["BodyText"],
            fontSize=10,
            leading=13,
            leftIndent=0,
        ),
    }


def _build_section(
    title: str,
    content: Any,
    styles: dict[str, ParagraphStyle],
) -> list[Any]:
    section: list[Any] = [Paragraph(title, styles["heading"])]

    if not content:
        section.append(Paragraph("Not available.", styles["body"]))
        section.append(Spacer(1, 3 * mm))
        return section

    if isinstance(content, str):
        section.append(Paragraph(_escape_text(content), styles["body"]))
        section.append(Spacer(1, 3 * mm))
        return section

    if isinstance(content, list):
        section.extend(_build_list_content(content, styles))
        section.append(Spacer(1, 3 * mm))
        return section

    if isinstance(content, dict):
        section.extend(_build_dict_content(content, styles))
        section.append(Spacer(1, 3 * mm))
        return section

    section.append(Paragraph(_escape_text(str(content)), styles["body"]))
    section.append(Spacer(1, 3 * mm))
    return section


def _build_list_content(items: list[Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    bullet_items: list[ListItem] = []

    for item in items:
        if isinstance(item, dict):
            bullet_items.append(ListItem(Paragraph(_escape_text(_format_mapping_line(item)), styles["bullet"])))
        else:
            bullet_items.append(ListItem(Paragraph(_escape_text(str(item)), styles["bullet"])))

    return [ListFlowable(bullet_items, bulletType="bullet", leftIndent=12)]


def _build_dict_content(items: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    content: list[Any] = []

    for key, value in items.items():
        heading = Paragraph(f"<b>{_escape_text(str(key).replace('_', ' ').title())}</b>", styles["body"])
        content.append(heading)

        if isinstance(value, list):
            content.extend(_build_list_content(value, styles))
        elif isinstance(value, dict):
            content.append(Paragraph(_escape_text(_format_mapping_line(value)), styles["body"]))
        else:
            content.append(Paragraph(_escape_text(str(value)), styles["body"]))

    return content


def _format_mapping_line(mapping: dict[str, Any]) -> str:
    return "; ".join(f"{key}: {value}" for key, value in mapping.items())


def _escape_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
