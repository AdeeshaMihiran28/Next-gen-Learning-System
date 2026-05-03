"""
Audio processing pipeline: save incoming audio bytes, transcribe with Whisper,
run intent analysis, and optionally persist transcripts.
"""
import os
import logging
from datetime import datetime
from typing import Dict

import speech_to_text
from intent_analyzer import analyze_transcript

logger = logging.getLogger(__name__)

# Location to persist transcripts (append-only)
TRANSCRIPTS_LOG = os.environ.get("TRANSCRIPTS_LOG", "transcripts.log")
MIN_AUDIO_BYTES = int(os.environ.get("MIN_AUDIO_BYTES", "4096"))
WEBM_EBML_HEADER = b"\x1a\x45\xdf\xa3"


def _skipped_result(reason: str) -> Dict:
    return {
        "transcript": "",
        "confidence": None,
        "intent_report": {"intent": "NORMAL", "matches": [], "score": 0.0},
        "error": reason,
        "skipped": True,
        "timestamp": datetime.utcnow().isoformat()
    }


def _is_probably_complete_audio(data: bytes, suffix: str) -> bool:
    if not data or len(data) < MIN_AUDIO_BYTES:
        return False

    normalized_suffix = (suffix or "").lower()
    if normalized_suffix == ".webm":
        # MediaRecorder requestData() can produce partial WebM chunks without
        # the EBML header. ffmpeg cannot decode those chunks independently.
        return data.startswith(WEBM_EBML_HEADER)

    return True


async def process_audio_bytes(data: bytes, suffix: str = ".webm") -> Dict:
    """Process raw audio bytes and return transcription + analysis.

    Returns a dict with keys: transcript, confidence, intent_report, timestamp
    """
    if not _is_probably_complete_audio(data, suffix):
        logger.debug("Skipping incomplete audio chunk: suffix=%s bytes=%s", suffix, len(data or b""))
        return _skipped_result("Incomplete audio chunk skipped")

    # Transcribe using speech_to_text helper (which will write temp file)
    try:
        stt_result = await speech_to_text.transcribe_bytes(data, suffix=suffix)
    except Exception as e:
        logger.warning("Transcription failed: %s", str(e).splitlines()[0])
        return {
            "transcript": "",
            "confidence": None,
            "intent_report": {"intent": "NORMAL", "matches": [], "score": 0.0},
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

    transcript = stt_result.get("text", "")
    confidence = stt_result.get("confidence")

    intent_report = analyze_transcript(transcript)

    # Persist transcript (append-only)
    try:
        safe_transcript = transcript.replace("\n", " ")
        with open(TRANSCRIPTS_LOG, "a", encoding="utf-8") as f:
            f.write(f"{datetime.utcnow().isoformat()}\t{intent_report['intent']}\t{intent_report['score']}\t{confidence}\t{safe_transcript}\n")
    except Exception:
        logger.exception("Failed to write transcript log")

    return {
        "transcript": transcript,
        "confidence": confidence,
        "intent_report": intent_report,
        "timestamp": datetime.utcnow().isoformat()
    }
