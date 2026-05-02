from __future__ import annotations

from pathlib import Path

from app.domain.jobs import JobStore
from app.services.summary_generation import build_structured_summary, generate_job_summary
from app.services.summary_pdf import _escape_text, _format_mapping_line


def test_escape_text_escapes_html_sensitive_characters():
    assert _escape_text("A&B < C > D") == "A&amp;B &lt; C &gt; D"


def test_format_mapping_line_formats_mapping_readably():
    assert _format_mapping_line({"term": "FFT", "definition": "Fast Fourier Transform"}) == (
        "term: FFT; definition: Fast Fourier Transform"
    )


def test_build_structured_summary_creates_required_sections():
    structured_summary = build_structured_summary(
        transcript_chunks=[
            {"start": 0.0, "end": 60.0, "text": "Intro"},
            {"start": 60.0, "end": 120.0, "text": "FFT explanation"},
        ],
        chunk_summaries=[
            "Signal processing introduces the problem space.",
            "Fast Fourier Transform is a method for frequency analysis.",
        ],
        final_summary=(
            "Signal processing introduces the problem space. "
            "Fast Fourier Transform is a method for frequency analysis."
        ),
    )

    assert structured_summary["overview"].startswith("Signal processing")
    assert structured_summary["key_topics"]
    assert structured_summary["definitions"] == [
        {
            "term": "Fast Fourier Transform",
            "definition": "a method for frequency analysis.",
        }
    ]
    assert len(structured_summary["outline"]) == 2


def test_generate_job_summary_writes_json_and_pdf(monkeypatch, workspace_tmp_path):
    job = JobStore.create(
        "summary-job",
        status="done",
        input_path=workspace_tmp_path / "uploads" / "summary-job" / "input.mp4",
        output_path=workspace_tmp_path / "outputs" / "summary-job" / "cleaned.mp4",
    )
    job.output_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path = job.output_path.parent / "transcript.json"
    transcript_path.write_text(
        (
            '{"text":"Lecture transcript","segments":['
            '{"start":0,"end":30,"text":"Intro to the lecture."},'
            '{"start":30,"end":60,"text":"Fast Fourier Transform is a method for analysis."}'
            "]}"
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "app.services.summary_generation.summarize_transcript_chunk",
        lambda chunk: f"Chunk summary for {chunk['text']}",
    )
    monkeypatch.setattr(
        "app.services.summary_generation.reduce_chunk_summaries",
        lambda chunk_summaries: "Fast Fourier Transform is a method for analysis. Intro to the lecture.",
    )
    monkeypatch.setattr(
        "app.services.summary_generation.build_summary_path",
        lambda job_id, filename: workspace_tmp_path / "outputs" / job_id / filename,
    )
    monkeypatch.setattr(
        "app.services.summary_generation.build_artifact_path",
        lambda job_id, artifact_key: workspace_tmp_path / "outputs" / job_id / "transcript.json"
        if artifact_key == "transcript_json"
        else workspace_tmp_path / "outputs" / job_id / f"{artifact_key}.json",
    )

    payload = generate_job_summary(job)

    assert payload["overview"].startswith("Fast Fourier Transform")
    assert (workspace_tmp_path / "outputs" / "summary-job" / "summary.json").is_file()
    assert (workspace_tmp_path / "outputs" / "summary-job" / "summary.pdf").is_file()


def test_generate_job_summary_falls_back_when_llm_fails(monkeypatch, workspace_tmp_path):
    job = JobStore.create(
        "fallback-summary-job",
        status="done",
        input_path=workspace_tmp_path / "uploads" / "fallback-summary-job" / "input.mp4",
        output_path=workspace_tmp_path / "outputs" / "fallback-summary-job" / "cleaned.mp4",
    )
    job.output_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path = job.output_path.parent / "transcript.json"
    transcript_path.write_text(
        (
            '{"text":"Lecture transcript","segments":['
            '{"start":0,"end":30,"text":"Sorting algorithms arrange values. Bubble sort compares adjacent values."},'
            '{"start":30,"end":60,"text":"Merge sort divides data and combines sorted parts."}'
            "]}",
        )[0],
        encoding="utf-8",
    )

    def fail_summary(*args, **kwargs):
        raise RuntimeError("503 UNAVAILABLE")

    monkeypatch.setattr("app.services.summary_generation.summarize_transcript_chunk", fail_summary)
    monkeypatch.setattr("app.services.summary_generation.reduce_chunk_summaries", fail_summary)
    monkeypatch.setattr(
        "app.services.summary_generation.build_summary_path",
        lambda job_id, filename: workspace_tmp_path / "outputs" / job_id / filename,
    )
    monkeypatch.setattr(
        "app.services.summary_generation.build_artifact_path",
        lambda job_id, artifact_key: workspace_tmp_path / "outputs" / job_id / "transcript.json"
        if artifact_key == "transcript_json"
        else workspace_tmp_path / "outputs" / job_id / f"{artifact_key}.json",
    )

    payload = generate_job_summary(job)

    assert "Sorting algorithms" in payload["overview"]
    assert (workspace_tmp_path / "outputs" / "fallback-summary-job" / "summary.json").is_file()
    assert (workspace_tmp_path / "outputs" / "fallback-summary-job" / "summary.pdf").is_file()
    assert any("Local transcript summary fallback was used" in log for log in job.logs)
