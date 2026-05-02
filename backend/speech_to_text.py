"""
Lightweight wrapper around Whisper model for offline speech-to-text.

This module loads the Whisper model once and exposes async helpers that run
the blocking transcription in a thread to avoid blocking the FastAPI event loop.
"""
import os
import asyncio
import tempfile
import logging

try:
    import whisper
except Exception as e:
    whisper = None

logger = logging.getLogger(__name__)

# Model is loaded lazily and cached
_MODEL = None


def load_model(model_name: str = None):
    global _MODEL
    if _MODEL is not None:
        return _MODEL

    if whisper is None:
        raise RuntimeError("whisper library is not installed. Install openai-whisper")

    model_name = model_name or os.environ.get("WHISPER_MODEL", "small")
    logger.info(f"Loading Whisper model: {model_name}")
    _MODEL = whisper.load_model(model_name)
    logger.info("Whisper model loaded")
    return _MODEL


async def transcribe_file(path: str, **kwargs) -> dict:
    """Transcribe a file path using the shared Whisper model.

    Returns a dict with keys: `text`, `raw` (full whisper result), `confidence` (approx)
    """
    model = load_model()

    # Run the blocking model.transcribe in a thread
    result = await asyncio.to_thread(model.transcribe, path, **kwargs)

    text = (result.get("text") or "").strip()

    # Compute a simple confidence score if available from segments
    segments = result.get("segments") or []
    confidences = []
    for seg in segments:
        # Whisper's segment may include `avg_logprob` and `no_speech_prob`.
        # We don't have a direct probability; return None when not available.
        c = seg.get("confidence")
        if c is not None:
            confidences.append(c)

    avg_confidence = None
    if confidences:
        try:
            avg_confidence = sum(confidences) / len(confidences)
        except Exception:
            avg_confidence = None

    return {"text": text, "raw": result, "confidence": avg_confidence}


async def transcribe_bytes(data: bytes, suffix: str = ".webm", **kwargs) -> dict:
    """Write bytes to a temporary file and transcribe them."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
        tf.write(data)
        tmp_path = tf.name

    try:
        return await transcribe_file(tmp_path, **kwargs)
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
