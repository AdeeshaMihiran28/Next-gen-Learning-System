"""Summary generation orchestration for completed jobs."""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.domain.jobs import Job, append_job_log
from app.services.llm_summarize import reduce_chunk_summaries, summarize_transcript_chunk
from app.services.summary_pdf import generate_summary_pdf
from app.services.transcript_chunking import chunk_transcript_by_time, load_transcript_segments
from app.utils.artifacts import build_artifact_path, build_summary_path


class SummaryGenerationError(RuntimeError):
    """Raised when summary generation cannot be completed."""


class TranscriptNotFoundError(SummaryGenerationError):
    """Raised when transcript data required for summary generation is missing."""


def generate_job_summary(job: Job) -> dict[str, Any]:
    """Generate summary artifacts for a job and return the structured summary."""
    try:
        transcript_path = build_artifact_path(job.job_id, "transcript_json")
        if not transcript_path.is_file():
            raise TranscriptNotFoundError("Transcript artifact was not found for this job.")

        transcript_segments = load_transcript_segments(transcript_path)
        if not transcript_segments:
            raise SummaryGenerationError("Transcript does not contain any segments to summarize.")

        append_job_log(job, "Loading transcript segments for summary generation")
        transcript_chunks = chunk_transcript_by_time(transcript_segments)
        append_job_log(job, f"Transcript split into {len(transcript_chunks)} chunk(s)")

        chunk_summaries = _summarize_chunks_with_fallback(job, transcript_chunks)
        if not chunk_summaries:
            raise SummaryGenerationError("Transcript chunks did not produce any summaries.")

        append_job_log(job, f"Generated {len(chunk_summaries)} chunk summary/ies")
        final_summary = _reduce_summaries_with_fallback(job, chunk_summaries)
        structured_summary = build_structured_summary(
            transcript_chunks=transcript_chunks,
            chunk_summaries=chunk_summaries,
            final_summary=final_summary,
        )

        summary_json_path = build_summary_path(job.job_id, "summary.json")
        summary_pdf_path = build_summary_path(job.job_id, "summary.pdf")
        _write_summary_json(summary_json_path, structured_summary)
        generate_summary_pdf(structured_summary, summary_pdf_path)

        append_job_log(job, "Summary artifacts generated successfully")
        return structured_summary
    except TranscriptNotFoundError:
        raise
    except SummaryGenerationError:
        raise
    except Exception as exc:
        raise SummaryGenerationError(str(exc)) from exc


def _summarize_chunks_with_fallback(
    job: Job,
    transcript_chunks: list[dict[str, Any]],
) -> list[str]:
    chunk_summaries: list[str] = []
    fallback_used = False

    for chunk in transcript_chunks:
        text = str(chunk.get("text", "")).strip()
        if not text:
            continue

        try:
            chunk_summaries.append(summarize_transcript_chunk(chunk))
        except Exception as exc:
            fallback_used = True
            append_job_log(job, f"Gemini chunk summary failed; using local fallback: {exc}")
            chunk_summaries.append(_local_chunk_summary(chunk))

    if fallback_used:
        append_job_log(job, "Local transcript summary fallback was used")

    return [summary for summary in chunk_summaries if summary.strip()]


def _reduce_summaries_with_fallback(job: Job, chunk_summaries: list[str]) -> str:
    try:
        return reduce_chunk_summaries(chunk_summaries)
    except Exception as exc:
        append_job_log(job, f"Gemini final summary failed; using local fallback: {exc}")
        return _local_final_summary(chunk_summaries)


def _local_chunk_summary(chunk: dict[str, Any]) -> str:
    text = str(chunk.get("text", "")).strip()
    text = _clean_transcript_text(text)
    sentences = _extract_sentences(text)
    selected_sentences = _select_useful_sentences(sentences, limit=3)

    if not selected_sentences and text:
        selected_sentences = [text[:500].strip()]

    start = _format_timestamp(float(chunk.get("start", 0.0)))
    end = _format_timestamp(float(chunk.get("end", 0.0)))
    summary_text = " ".join(selected_sentences).strip()
    return f"{start} - {end}: {summary_text}" if summary_text else ""


def _local_final_summary(chunk_summaries: list[str]) -> str:
    combined = _clean_transcript_text(" ".join(summary.strip() for summary in chunk_summaries if summary.strip()))
    sentences = _extract_sentences(combined)
    selected_sentences = _select_useful_sentences(sentences, limit=5)

    if selected_sentences:
        return " ".join(selected_sentences)

    return combined[:1500].strip()


def build_structured_summary(
    *,
    transcript_chunks: list[dict[str, Any]],
    chunk_summaries: list[str],
    final_summary: str,
) -> dict[str, Any]:
    """Build a structured summary payload from generated chunk summaries."""
    cleaned_chunk_summaries = [
        _strip_time_prefix(_clean_transcript_text(summary)).strip()
        for summary in chunk_summaries
        if _strip_time_prefix(_clean_transcript_text(summary)).strip()
    ]
    combined_source = " ".join([final_summary, *cleaned_chunk_summaries]).strip()

    source_sentences = _extract_sentences(_clean_transcript_text(combined_source))
    overview_sentences = _select_useful_sentences(source_sentences, limit=4)
    overview = " ".join(overview_sentences).strip() or _clean_transcript_text(final_summary).strip()

    summary_sentences = _extract_sentences(overview)
    topic_candidates = _build_key_topics(overview, cleaned_chunk_summaries)
    takeaways = _build_takeaways(source_sentences, topic_candidates)
    definitions = _extract_definitions(combined_source)[:4]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overview": overview,
        "key_topics": topic_candidates[:6],
        "definitions": definitions,
        "takeaways": takeaways[:5],
        "outline": [
            _strip_time_prefix(_clean_transcript_text(chunk_summary)).strip()
            for chunk, chunk_summary in zip(transcript_chunks, chunk_summaries, strict=False)
            if _strip_time_prefix(_clean_transcript_text(chunk_summary)).strip()
        ],
    }
def _write_summary_json(output_path: Path, payload: dict[str, Any]) -> Path:
    import json

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return output_path


def _extract_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def _extract_definitions(text: str) -> list[dict[str, str]]:
    definitions: list[dict[str, str]] = []

    for sentence in _extract_sentences(text):
        if _is_low_value_sentence(sentence):
            continue
        match = re.match(
            r"(?P<term>[A-Z][A-Za-z0-9\s/-]{1,50})\s+(?:is|are|refers to|means)\s+(?P<definition>.+)",
            sentence,
        )
        if match is None:
            continue

        term = match.group("term").strip()
        definition = match.group("definition").strip()
        if len(term.split()) > 5 or len(definition.split()) < 4:
            continue

        definitions.append(
            {
                "term": term,
                "definition": definition,
            }
        )

    return definitions


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []

    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)

    return deduped


def _format_timestamp(seconds: float) -> str:
    total_seconds = max(int(round(seconds)), 0)
    minutes, remaining_seconds = divmod(total_seconds, 60)
    hours, remaining_minutes = divmod(minutes, 60)

    if hours:
        return f"{hours:02d}:{remaining_minutes:02d}:{remaining_seconds:02d}"
    return f"{remaining_minutes:02d}:{remaining_seconds:02d}"


def _clean_transcript_text(text: str) -> str:
    cleaned = re.sub(
        r"\b\d{2}:\d{2}(?::\d{2})?\s*-\s*\d{2}:\d{2}(?::\d{2})?\s*:?",
        " ",
        text,
    )
    cleaned = re.sub(r"\b\d{2}:\d{2}(?::\d{2})?\b", " ", cleaned)
    cleaned = re.sub(r"\b([a-z]{1,3})(?:\s+\1\b){2,}", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(\w+)(?:\s+\1\b){2,}", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(you|um|uh|okay|ok)\b(?:\s+\b\1\b)+", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*[-–]\s*", " - ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _strip_time_prefix(text: str) -> str:
    return re.sub(r"^\d{2}:\d{2}(?::\d{2})?\s*-\s*\d{2}:\d{2}(?::\d{2})?:\s*", "", text).strip()


def _is_low_value_sentence(sentence: str) -> bool:
    normalized = sentence.strip().casefold()
    words = normalized.split()
    if len(words) < 5:
        return True
    alpha_chars = sum(ch.isalpha() for ch in normalized)
    if alpha_chars < max(12, int(len(normalized) * 0.45)):
        return True
    if len(set(words)) <= 2:
        return True
    low_value_phrases = {
        "i have flashed my screen",
        "i hope you can see it properly",
        "hope you can see it properly",
        "you know",
        "okay",
    }
    return normalized in low_value_phrases or any(phrase in normalized for phrase in low_value_phrases)


def _select_useful_sentences(sentences: list[str], *, limit: int) -> list[str]:
    scored: list[tuple[float, int, str]] = []
    for index, sentence in enumerate(sentences):
        if _is_low_value_sentence(sentence):
            continue
        score = _sentence_score(sentence)
        if score <= 0:
            continue
        scored.append((score, index, sentence))

    top = sorted(scored, key=lambda item: (-item[0], item[1]))[:limit]
    ordered = [sentence for _, _, sentence in sorted(top, key=lambda item: item[1])]
    return ordered


def _build_key_topics(overview: str, chunk_summaries: list[str]) -> list[str]:
    source_text = " ".join([overview, *(_strip_time_prefix(summary) for summary in chunk_summaries)])
    phrases = _extract_topic_phrases(source_text)
    if phrases:
        return phrases

    source_sentences = _extract_sentences(source_text)
    candidates = _select_useful_sentences(source_sentences, limit=6)
    return _dedupe_preserve_order(candidates)


def _build_takeaways(summary_sentences: list[str], topic_candidates: list[str]) -> list[str]:
    candidates = _select_useful_sentences(summary_sentences, limit=5)
    if candidates:
        return candidates
    return topic_candidates[:3]


def _sentence_score(sentence: str) -> float:
    text = sentence.strip()
    words = re.findall(r"[A-Za-z][A-Za-z0-9'-]*", text)
    if len(words) < 5:
        return 0.0

    score = min(len(words), 22) / 22
    if 6 <= len(words) <= 24:
        score += 0.8
    if re.search(r"\b(is|are|means|refers to|helps|supports|improves|build|develop|lead|manage)\b", text, re.IGNORECASE):
        score += 0.5
    if re.search(r"\b(team|leadership|leader|database|sql|system|process|goal|achievement|management)\b", text, re.IGNORECASE):
        score += 0.4
    if text.endswith("?"):
        score -= 0.8
    return score


_TOPIC_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "about",
    "your", "their", "there", "have", "been", "being", "will", "would",
    "could", "should", "what", "when", "where", "which", "while", "hope",
    "screen", "properly", "need", "good", "going", "discuss", "discussion",
}


def _extract_topic_phrases(text: str) -> list[str]:
    tokens = [
        token.casefold()
        for token in re.findall(r"[A-Za-z][A-Za-z0-9'-]*", text)
        if len(token) > 2
    ]
    tokens = [token for token in tokens if token not in _TOPIC_STOPWORDS]
    if not tokens:
        return []

    phrase_counter: Counter[str] = Counter()
    for size in (3, 2, 1):
        for index in range(len(tokens) - size + 1):
            phrase = " ".join(tokens[index:index + size])
            if any(part in _TOPIC_STOPWORDS for part in phrase.split()):
                continue
            phrase_counter[phrase] += 1

    ranked: list[str] = []
    for phrase, count in phrase_counter.most_common(20):
        if count < 2 and len(phrase.split()) == 1:
            continue
        pretty = phrase.upper() if phrase == "sql" else phrase.title()
        if any(phrase in existing.casefold() or existing.casefold() in phrase for existing in ranked):
            continue
        ranked.append(pretty)
        if len(ranked) >= 6:
            break
    return ranked
