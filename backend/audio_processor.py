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


async def process_audio_bytes(data: bytes, suffix: str = ".webm") -> Dict:
    """Process raw audio bytes and return transcription + analysis.

    Returns a dict with keys: transcript, confidence, intent_report, timestamp
    """
    # Transcribe using speech_to_text helper (which will write temp file)
    try:
        stt_result = await speech_to_text.transcribe_bytes(data, suffix=suffix)
    except Exception as e:
        logger.exception("Transcription failed")
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
        with open(TRANSCRIPTS_LOG, "a", encoding="utf-8") as f:
            f.write(f"{datetime.utcnow().isoformat()}\t{intent_report['intent']}\t{intent_report['score']}\t{confidence}\t{transcript.replace('\n',' ')}\n")
    except Exception:
        logger.exception("Failed to write transcript log")

    return {
        "transcript": transcript,
        "confidence": confidence,
        "intent_report": intent_report,
        "timestamp": datetime.utcnow().isoformat()
    }
