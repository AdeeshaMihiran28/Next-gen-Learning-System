"""LLM summarization helpers using Google Generative AI."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from app.core.config import GOOGLE_API_KEY, GOOGLE_MODEL


def summarize_transcript_chunk(chunk: Mapping[str, Any]) -> str:
    """Summarize a single transcript chunk into plain text."""
    start = float(chunk.get("start", 0.0))
    end = float(chunk.get("end", start))
    text = str(chunk.get("text", "")).strip()

    prompt = (
        "Summarize the following lecture transcript chunk in plain text. "
        "Keep it concise, factual, and focused on the key teaching points.\n\n"
        f"Chunk start: {start:.2f} seconds\n"
        f"Chunk end: {end:.2f} seconds\n"
        f"Transcript:\n{text}"
    )
    return _generate_plain_text(prompt)


def reduce_chunk_summaries(chunk_summaries: Sequence[str]) -> str:
    """Reduce multiple chunk summaries into one final plain-text summary."""
    summaries_text = "\n\n".join(
        f"Chunk summary {index + 1}:\n{summary.strip()}"
        for index, summary in enumerate(chunk_summaries)
        if summary.strip()
    )

    prompt = (
        "Combine the following lecture chunk summaries into one final plain-text summary. "
        "Preserve the main ideas, progression, and important conclusions without using markdown.\n\n"
        f"{summaries_text}"
    )
    return _generate_plain_text(prompt)


def _generate_plain_text(prompt: str) -> str:
    if not GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured.")
    if not GOOGLE_MODEL:
        raise RuntimeError("GOOGLE_MODEL is not configured.")

    try:
        from google import genai
    except ImportError as exc:
        raise RuntimeError(
            "The 'google-genai' package is not installed. Install it to enable LLM summarization."
        ) from exc

    client = genai.Client(api_key=GOOGLE_API_KEY)
    response = client.models.generate_content(
        model=GOOGLE_MODEL,
        contents=prompt,
    )

    return (response.text or "").strip()
