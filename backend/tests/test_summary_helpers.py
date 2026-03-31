from __future__ import annotations

from app.services.summary_pdf import _escape_text, _format_mapping_line


def test_escape_text_escapes_html_sensitive_characters():
    assert _escape_text("A&B < C > D") == "A&amp;B &lt; C &gt; D"


def test_format_mapping_line_formats_mapping_readably():
    assert _format_mapping_line({"term": "FFT", "definition": "Fast Fourier Transform"}) == (
        "term: FFT; definition: Fast Fourier Transform"
    )
