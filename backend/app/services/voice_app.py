

"""
voicemodel.py
--------------------------------------------
Flask ICT Short Answer + Voice API module
FastAPI app.py එක තුලින් WSGIMiddleware හරහා mount කරලා run කරනවා.

✅ Uses backend/assets/models/ for ALL files:
   - voice_confidence_model.joblib
   - it_short_answer_dataset.csv
   - short_answer_grader_classifier.joblib (optional)
   - short_answer_grader_regressor.joblib  (optional)

✅ Topic column handling (Topics -> topic)
✅ /questions/random always returns topic
✅ /grade-voice and /grade-text always returns topic

✅ FIXED KEYWORD GRADING (IMPORTANT):
   - ideal_answer = main base
   - keywords_main = required boost
   - keywords_optional = bonus only (NOT penalty)
   - final_score = 0.70*ideal_cov + 0.25*main_cov + 0.05*opt_cov
   - marks = round(final_score * 10)

✅ ML grading (optional):
   combined = topic [SEP] question [SEP] answer
"""
# Import necessary libraries for the Flask app, audio processing, ML models, etc.

import os
import re
import json
import tempfile
import shutil
from datetime import datetime
import subprocess
import difflib
from pathlib import Path

from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
import librosa
import joblib

# ---------------------- Semantic Grading (optional) ----------------------
# Try to import sentence transformers for semantic similarity and NLI (Natural Language Inference)
try:
    from sentence_transformers import SentenceTransformer, CrossEncoder, util as st_util
    _SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    print("[WARN] sentence-transformers not installed. Semantic grading disabled.")
    _SENTENCE_TRANSFORMERS_AVAILABLE = False

# ---------------------- Gemini AI Grading ----------------------
# Try to import Google Gemini for AI-based grading
try:
    from google import genai as google_genai
    _GEMINI_AVAILABLE = True
except ImportError:
    print("[WARN] google-genai not installed. Run: pip install google-genai")
    _GEMINI_AVAILABLE = False

# Set default Gemini model name and prepare a list for API clients
_GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.5-flash")
_GEMINI_CLIENTS: list = []  # one entry per API key; rotated on 429/503

# Function to load Gemini API clients from environment variables
def _load_gemini():
    global _GEMINI_CLIENTS
    if not _GEMINI_AVAILABLE:
        print("[GEMINI] Library not available.")
        return
    # Get API keys from environment variables (up to 10 keys)
    keys = [
        os.environ.get(f"GEMINI_API_KEY{'' if i == 0 else f'_{i}'}", "")
        for i in range(0, 10)
    ]
    keys = [k.strip() for k in keys if k.strip() and k.strip() != "your_gemini_api_key_here"]
    if not keys:
        print("[GEMINI] No API key set. Add GEMINI_API_KEY to .env")
        return
    _GEMINI_CLIENTS = []
    for k in keys:
        try:
            _GEMINI_CLIENTS.append(google_genai.Client(api_key=k))
            print(f"[GEMINI] Loaded client ...{k[-4:]}")
        except Exception as e:
            print(f"[GEMINI] Failed to load client ...{k[-4:]}: {e}")
    print(f"[GEMINI] {len(_GEMINI_CLIENTS)} client(s) ready, model: {_GEMINI_MODEL_NAME}")


# Function to generate content using Gemini, rotating through clients on rate limits
def _gemini_generate(prompt: str) -> str:
    """Call Gemini, rotating through all loaded API keys on 429/503."""
    if not _GEMINI_CLIENTS:
        raise RuntimeError("no_gemini_clients")
    last_err = None
    for client in _GEMINI_CLIENTS:
        try:
            response = client.models.generate_content(
                model=_GEMINI_MODEL_NAME,
                contents=prompt,
            )
            return response.text
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "503" in err_str:
                last_err = e
                continue
            raise
    raise last_err

# Prompt template for Gemini grading
_GEMINI_PROMPT = """You are an ICT voice quiz grader. The student SPOKE their answer aloud — it was recorded and transcribed automatically by speech-to-text (Whisper). The transcript may contain transcription errors.

Question: {question}
Ideal Answer: {ideal}
Student Answer (auto-transcribed from speech): {student}
Key technical terms for this question: {key_terms}

YOUR TASK: Grade ONLY whether the student UNDERSTANDS the concept. Spoken answers are naturally shorter and less formal than written ones — this is expected and must NOT be penalised.

Local model signals (use as a calibration hint — do not override your own reasoning):
{local_hints}

STEP 1 — RELEVANCE CHECK (apply this first, before anything else):
Ask yourself: does the student's answer have ANY meaningful connection to the question topic?
- If the answer is completely off-topic, a test input, random repeated words, or gibberish (e.g. "this this this this", "testing 1", "hello", "abc", single unrelated words) → give 0-2 immediately. STT tolerance does NOT apply to irrelevant answers.
- Only proceed to STEP 2 if the answer shows at least a faint attempt to address the question.

STEP 2 — STT error tolerance (only for answers that passed STEP 1):
- The key technical terms listed above are often mispronounced or garbled by speech-to-text. If any word in the student's answer sounds similar to a key term, treat it as that term.
- Never deduct marks for garbled words, mispronunciation, or informal phrasing of a genuine attempt.

STEP 3 — SCORING RULES (focus on conceptual understanding):
- 9-10: Student clearly understands and covers the main idea completely, even if phrased differently.
- 7-8: Student understands the core concept; minor details or one sub-point missing.
- 5-6: Student has the right general idea but missing important details or imprecise language.
- 3-4: Surface-level or partial understanding; key concept unclear or partially wrong.
- 0-2: Answer is wrong, completely unrelated, gibberish, or a test input with no subject matter.

CRITICAL RULE — ECHO / NAME-ONLY ANSWERS (apply before assigning any score above 2):
If the student's answer ONLY restates or names the concept from the question without any explanation — for example answering "Graphical User Interface" to "What is a GUI?", or "ASCII" to "What is ASCII?", or "Integration testing" to "What is Integration Testing?" — this is naming, NOT understanding. Give no more than 2/10. Naming the term proves nothing about conceptual knowledge.

Respond ONLY with valid JSON in this exact format:
{{"score": <integer 0-10>, "reason": "<one short sentence>"}}"""

_STT_CORRECTION_PROMPT = """You are a speech-to-text error corrector for an ICT quiz. A student's spoken answer was auto-transcribed by Whisper — transcription errors are common with technical ICT terminology.

Question: {question}
Expected Answer (context only): {ideal}
Raw Whisper Transcript: {transcript}

Fix ONLY clear transcription mishearing errors (words that sound similar to the correct word but were transcribed incorrectly).
Rules:
- Correct garbled or mispronounced technical terms to their proper spelling (e.g. "transformation" → "transmission", "dread and entry" → "delete an existing", "properity" → "proprietary")
- Do NOT add information that is not present in the raw transcript
- Do NOT rephrase, expand, or improve the answer — minimal corrections only
- If the transcript already looks correct or you are uncertain, return it unchanged

Return ONLY the corrected plain text. No explanation, no quotes, no JSON."""


# Function to correct STT transcript using Gemini
def gemini_correct_transcript(raw_transcript: str, question_text: str, ideal_answer: str) -> str:
    """Use Gemini to fix STT mishearing errors in the raw transcript. Returns corrected text."""
    if not _GEMINI_CLIENTS or not raw_transcript or not raw_transcript.strip():
        return raw_transcript
    try:
        prompt = _STT_CORRECTION_PROMPT.format(
            question=question_text or "",
            ideal=ideal_answer or "",
            transcript=raw_transcript,
        )
        corrected = _gemini_generate(prompt).strip()
        return corrected if corrected else raw_transcript
    except Exception as e:
        print(f"[GEMINI] STT correction error: {e}")
        return raw_transcript


# Function to grade using Gemini
def gemini_grade(question_text: str, ideal_answer: str, student_answer: str, local_hints: str = "N/A") -> dict:
    """Returns {"score": int, "reason": str} or {"error": str}"""
    if not _GEMINI_CLIENTS:
        return {"error": "gemini_not_loaded"}
    if not student_answer or not ideal_answer:
        return {"error": "empty_answer_or_ideal"}
    try:
        key_terms = ", ".join(tokenize_important(f"{question_text} {ideal_answer}")[:20]) or "N/A"
        prompt = _GEMINI_PROMPT.format(
            question=question_text or "",
            ideal=ideal_answer,
            student=student_answer,
            key_terms=key_terms,
            local_hints=local_hints,
        )
        raw = _gemini_generate(prompt).strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
        score = max(0, min(10, int(data.get("score", 0))))
        reason = str(data.get("reason", ""))
        return {"score": score, "reason": reason}
    except Exception as e:
        print(f"[GEMINI] grading error: {e}")
        return {"error": str(e)}

# ---------------------- Base dir ----------------------
# Set base directory and models directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # .../backend
MODELS_DIR = os.path.join(BASE_DIR, "assets", "models")   # .../backend/assets/models

# Create Flask app instance
voice_app = Flask(__name__)

# ---------------------- Whisper (Local STT) -----------------------
# Load Whisper model for speech-to-text
import whisper
print("[WHISPER] Loading local Whisper model 'base' ...")
WHISPER_MODEL = whisper.load_model("base")
print("[WHISPER] Model loaded.")

# ---------------------- Text Normalization ------------------------
# Define stopwords for text cleaning
STOPWORDS = {
    "a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with", "by",
    "is", "are", "was", "were", "be", "been", "being", "that", "this", "these",
    "those", "it", "its", "as", "at", "from", "into", "about", "than", "then",
}

# Function to clean text by lowercasing, removing punctuation, and extra spaces
def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

# Function to tokenize important words, removing stopwords and short words
def tokenize_important(text: str) -> list:
    text = clean_text(text)
    toks = [t for t in text.split() if len(t) >= 2 and t not in STOPWORDS]
    seen = set()
    out = []
    for t in toks:
        if t not in seen:
            out.append(t)
            seen.add(t)
    return out

# Function to check fuzzy match between a token and transcript tokens
def fuzzy_token_match(token: str, transcript_tokens: list, thr: float = 0.82):
    if token in transcript_tokens:
        return True, token

    best = ("", 0.0)
    for w in transcript_tokens:
        if abs(len(w) - len(token)) >= 5:
            continue
        r = difflib.SequenceMatcher(None, token, w).ratio()
        if r > best[1]:
            best = (w, r)

    if best[1] >= thr:
        return True, best[0]
    return False, ""

# Function to calculate word coverage between transcript and ideal answer
def ideal_word_coverage(transcript: str, ideal_answer: str, fuzzy_thr: float = 0.82) -> dict:
    ideal_tokens = tokenize_important(ideal_answer)
    trans_tokens = tokenize_important(transcript)

    matched = []
    unmatched = []
    matches_map = {}

    if len(ideal_tokens) == 0:
        return {
            "coverage": 0.0,
            "ideal_tokens": [],
            "transcript_tokens": trans_tokens,
            "matched_tokens": [],
            "unmatched_tokens": [],
            "matches_map": {},
            "note": "ideal_answer_has_no_tokens_after_cleaning",
        }

    for t in ideal_tokens:
        ok, m = fuzzy_token_match(t, trans_tokens, thr=fuzzy_thr)
        if ok:
            matched.append(t)
            matches_map[t] = m
        else:
            unmatched.append(t)

    coverage = len(matched) / len(ideal_tokens)
    return {
        "coverage": float(coverage),
        "ideal_tokens": ideal_tokens,
        "transcript_tokens": trans_tokens,
        "matched_tokens": matched,
        "unmatched_tokens": unmatched,
        "matches_map": matches_map,
        "fuzzy_threshold": float(fuzzy_thr),
    }

# ---------------------- Semantic similarity & NLI helpers ----------------------
# Function for semantic similarity using sentence transformers
def _semantic_similarity(text1: str, text2: str) -> float:
    if SEMANTIC_MODEL is None or not text1 or not text2:
        return 0.0
    try:
        emb = SEMANTIC_MODEL.encode([text1, text2], convert_to_tensor=True)
        score = float(st_util.cos_sim(emb[0], emb[1]).item())
        return max(0.0, min(1.0, score))
    except Exception as e:
        print(f"[SEMANTIC] similarity error: {e}")
        return 0.0

# Function for NLI entailment
def _nli_entailment(premise: str, hypothesis: str) -> float:
    if NLI_MODEL is None or not premise or not hypothesis:
        return 0.0
    try:
        # nli-deberta-v3-small label order: [contradiction=0, entailment=1, neutral=2]
        scores = NLI_MODEL.predict([[premise, hypothesis]])[0]
        import numpy as _np
        probs = _np.exp(scores) / _np.sum(_np.exp(scores))
        return float(max(0.0, min(1.0, probs[1])))
    except Exception as e:
        print(f"[NLI] entailment error: {e}")
        return 0.0

# ---------------------- ✅ FIXED: keyword parsing + weighted grading ----------------------
# Function to split keywords from string (supports comma or pipe separators)
def _split_keywords(s: str):
    """supports: 'a|b|c' and 'a,b,c' """
    if not s:
        return []
    s = str(s).replace(",", "|")
    return [p.strip() for p in s.split("|") if p.strip()]

# Function to extract keywords from a row
def _keywords_text_from_row(row):
    km = str(row.get("keywords_main", "") or row.get("Keywords_main", "") or "").strip()
    ko = str(row.get("keywords_optional", "") or row.get("Keywords_optional", "") or "").strip()

    main_list = _split_keywords(km)
    opt_list  = _split_keywords(ko)

    main_text = " ".join(main_list).strip()
    opt_text  = " ".join(opt_list).strip()
    return main_text, opt_text, main_list, opt_list

# Function to convert marks to level
def _marks_to_level(marks: int) -> str:
    if marks >= 7:
        return "GOOD"
    elif marks >= 5:
        return "PARTIAL"
    elif marks >= 3:
        return "WEAK"
    else:
        return "INCORRECT"

# ---------------------- Grade result cache ----------------------
# Cache for grading results to avoid recomputation
_GRADE_CACHE: dict = {}
_GRADE_CACHE_MAX = 500  # max cached entries (evicts oldest when full)

# Main grading pipeline function
def _grade_pipeline(student_text: str, row, fuzzy_thr: float = 0.82):
    """
    4-Stage grading pipeline:

    Stage 1 — SBERT Relevance Gate (local, instant)
        sbert < 0.08  → INCORRECT immediately (garbage / off-topic)
        sbert > 0.88  → GOOD immediately (near-perfect semantic match)
        else          → continue to Stage 2

    Stage 2 — Local Ensemble: SBERT + NLI + Keyword
        local = 0.40*sbert + 0.40*nli + 0.20*keyword
        local > 0.80  → GOOD, skip Gemini (high confidence)
        local < 0.20  → INCORRECT, skip Gemini (high confidence)
        else          → continue to Stage 3 (uncertain range)

    Stage 3 — Gemini (API, uncertain answers only)
        Receives SBERT + NLI scores as calibration hints in prompt.

    Stage 4 — Final Score Fusion
        final = 0.65 * gemini_score + 0.35 * local_score (both on 0-10 scale)

    Fallbacks:
        No SBERT/NLI → skip Stages 1-2, go straight to Gemini.
        No Gemini    → use local ensemble only.
        Neither      → keyword coverage only.
    """
    ideal = str(row.get("ideal_answer", "") or "").strip()
    question_text = str(row.get("question_text", "") or "").strip()
    main_text, opt_text, main_list, opt_list = _keywords_text_from_row(row)

    if not ideal and not main_text and not opt_text:
        return None, {"error": "ideal_and_keywords_empty"}

    # ── Echo / name-only guard (runs before all stages) ─────────────────────
    # If the student answer is short AND all its meaningful words come from
    # the question itself (not the ideal), the student merely echoed the term.
    _student_toks = tokenize_important(student_text)
    _question_toks = set(tokenize_important(question_text))
    if len(_student_toks) <= 4 and _student_toks:
        _overlap = sum(1 for t in _student_toks if t in _question_toks)
        _echo_ratio = _overlap / len(_student_toks)
        if _echo_ratio >= 0.75:
            grading = {"level": "INCORRECT", "marks": 1, "coverage": 0.0}
            debug   = {
                "grader": "echo_guard",
                "stage": "0_echo_precheck",
                "student_tokens": _student_toks,
                "echo_ratio": round(_echo_ratio, 2),
                "reason": "answer_is_echo_of_question_term",
            }
            return grading, debug

    semantic_enabled = SEMANTIC_MODEL is not None
    nli_enabled      = NLI_MODEL is not None
    gemini_available = bool(_GEMINI_CLIENTS) and bool(ideal) and bool(student_text)

    # ── Keyword coverage (always computed — fast, no model needed) ──────────
    ideal_cov     = ideal_word_coverage(student_text, ideal, fuzzy_thr=fuzzy_thr)["coverage"] if ideal else 0.0
    main_cov      = ideal_word_coverage(student_text, main_text, fuzzy_thr=fuzzy_thr)["coverage"] if main_text else 0.0
    opt_cov       = ideal_word_coverage(student_text, opt_text, fuzzy_thr=fuzzy_thr)["coverage"] if opt_text else 0.0
    keyword_score = max(0.0, min(1.0, 0.70 * ideal_cov + 0.25 * main_cov + 0.05 * opt_cov))

    # ── Stages 1 & 2: Local models (SBERT + NLI) ───────────────────────────
    sbert_score = _semantic_similarity(student_text, ideal) if (semantic_enabled and ideal) else None
    nli_score   = _nli_entailment(student_text, ideal) if (nli_enabled and ideal) else None
    local_score = None

    if sbert_score is not None:

        # Stage 1 — SBERT Relevance Gate
        if sbert_score < 0.08:
            grading = {"level": "INCORRECT", "marks": 0, "coverage": float(sbert_score)}
            debug   = {
                "grader": "sbert_gate", "stage": "1_relevance_gate",
                "sbert_score": float(sbert_score), "reason": "answer_below_relevance_threshold",
            }
            return grading, debug

        if sbert_score > 0.88:
            marks   = 10 if sbert_score >= 0.95 else 9
            grading = {"level": "GOOD", "marks": marks, "coverage": float(sbert_score)}
            debug   = {
                "grader": "sbert_gate", "stage": "1_high_confidence",
                "sbert_score": float(sbert_score), "reason": "answer_above_high_confidence_threshold",
            }
            return grading, debug

        # Stage 2 — Local Ensemble
        nli_val     = nli_score if nli_score is not None else keyword_score
        local_score = max(0.0, min(1.0, 0.40 * sbert_score + 0.40 * nli_val + 0.20 * keyword_score))

        if local_score > 0.80:
            marks   = max(0, min(10, int(round(local_score * 10))))
            level   = _marks_to_level(marks)
            if level == "INCORRECT":
                marks = 0
            grading = {"level": level, "marks": marks, "coverage": float(local_score)}
            debug   = {
                "grader": "local_ensemble", "stage": "2_high_confidence",
                "sbert_score": float(sbert_score), "nli_score": nli_score,
                "keyword_score": float(keyword_score), "local_score": float(local_score),
            }
            return grading, debug

        if local_score < 0.15:
            grading = {"level": "INCORRECT", "marks": 0, "coverage": float(local_score)}
            debug   = {
                "grader": "local_ensemble", "stage": "2_low_confidence",
                "sbert_score": float(sbert_score), "nli_score": nli_score,
                "keyword_score": float(keyword_score), "local_score": float(local_score),
            }
            return grading, debug

    # ── Stage 3: Gemini (uncertain middle range or no local models) ─────────
    gemini_result = None
    if gemini_available:
        if sbert_score is not None:
            sbert_label = "strong" if sbert_score > 0.60 else "moderate" if sbert_score > 0.35 else "weak"
            nli_label   = ""
            if nli_score is not None:
                nli_label = f" NLI entailment: {nli_score:.2f} ({'strong' if nli_score > 0.50 else 'moderate' if nli_score > 0.25 else 'weak'} concept overlap)."
            local_hints = f"SBERT semantic similarity: {sbert_score:.2f} ({sbert_label} meaning match).{nli_label}"
        else:
            local_hints = "Local semantic models not available."

        gemini_result = gemini_grade(question_text, ideal, student_text, local_hints=local_hints)

        if "score" in gemini_result:
            g_score = gemini_result["score"]

            # Stage 4 — Fuse Gemini with local ensemble
            if local_score is not None:
                fused_marks = max(0, min(10, int(round(0.65 * g_score + 0.35 * (local_score * 10)))))
            else:
                fused_marks = g_score

            level = _marks_to_level(fused_marks)
            if level == "INCORRECT":
                fused_marks = 0

            grading = {"level": level, "marks": fused_marks, "coverage": fused_marks / 10.0}
            debug   = {
                "grader": "gemini+ensemble" if local_score is not None else "gemini",
                "stage": "3_gemini_4_fusion",
                "gemini_score": g_score,
                "gemini_reason": gemini_result.get("reason", ""),
                "sbert_score": sbert_score,
                "nli_score": nli_score,
                "keyword_score": float(keyword_score),
                "local_score": local_score,
                "fused_marks": fused_marks,
            }
            return grading, debug

    # ── Fallback A: Local ensemble only (Gemini unavailable) ────────────────
    if local_score is not None:
        marks = max(0, min(10, int(round(local_score * 10))))
        level = _marks_to_level(marks)
        if level == "INCORRECT":
            marks = 0
        grading = {"level": level, "marks": marks, "coverage": float(local_score)}
        debug   = {
            "grader": "local_ensemble_fallback",
            "gemini_error": gemini_result.get("error") if gemini_result else "gemini_not_loaded",
            "sbert_score": sbert_score, "nli_score": nli_score,
            "keyword_score": float(keyword_score), "local_score": float(local_score),
        }
        return grading, debug

    # ── Fallback B: Keyword only (no models at all) ──────────────────────────
    marks = int(round(keyword_score * 10))
    level = _marks_to_level(marks)
    if level == "INCORRECT":
        marks = 0
    grading = {"level": level, "marks": marks, "coverage": float(keyword_score)}
    debug   = {
        "grader": "keyword_only_fallback",
        "gemini_error": gemini_result.get("error") if gemini_result else "gemini_not_loaded",
        "ideal_cov": float(ideal_cov), "keyword_score": float(keyword_score),
        "main_keywords": main_list, "optional_keywords": opt_list,
    }
    return grading, debug


# Caching wrapper for grading
def grade_rule_based_weighted(student_text: str, row, fuzzy_thr: float = 0.82):
    """Caching wrapper around _grade_pipeline. Same identical answer + question → instant cache hit."""
    question_id = str(row.get("question_id", "") or "").strip()
    if question_id:
        cache_key = f"{question_id}::{clean_text(student_text)}"
        if cache_key in _GRADE_CACHE:
            entry = _GRADE_CACHE[cache_key]
            return entry["grading"], {**entry["debug"], "cache_hit": True}

    grading, debug = _grade_pipeline(student_text, row, fuzzy_thr)

    if question_id and grading is not None:
        cache_key = f"{question_id}::{clean_text(student_text)}"
        if len(_GRADE_CACHE) >= _GRADE_CACHE_MAX:
            del _GRADE_CACHE[next(iter(_GRADE_CACHE))]
        _GRADE_CACHE[cache_key] = {"grading": grading, "debug": debug}

    return grading, debug


# ---------------------- Voice confidence model ---------------------
# Path to voice confidence model
VOICE_MODEL_PATH = os.environ.get(
    "VOICE_MODEL_PATH",
    os.path.join(MODELS_DIR, "voice_confidence_model.joblib")
)

# Global variables for voice model
VOICE_CLF = None
VOICE_LE = None
VOICE_SAMPLE_RATE = 16000

VOICE_BACKEND = "mfcc"  # "mfcc" or "yamnet"
YAMNET_HANDLE = None
EMBED_POOL = "mean_std"
_YAMNET_MODEL = None

SEMANTIC_MODEL = None
NLI_MODEL = None

# Function to load voice confidence model
def _load_voice_model():
    global VOICE_CLF, VOICE_LE, VOICE_SAMPLE_RATE, VOICE_BACKEND, YAMNET_HANDLE, EMBED_POOL
    try:
        bundle = joblib.load(VOICE_MODEL_PATH)
        VOICE_CLF = bundle["model"]
        VOICE_LE = bundle["label_encoder"]
        VOICE_SAMPLE_RATE = bundle.get("sample_rate", VOICE_SAMPLE_RATE)

        VOICE_BACKEND = bundle.get("embedding_backend", "mfcc")
        YAMNET_HANDLE = bundle.get("yamnet_handle", None)
        EMBED_POOL = bundle.get("embed_pool", EMBED_POOL)

        print("[VOICE] Loaded model from:", VOICE_MODEL_PATH)
        print("[VOICE] Backend:", VOICE_BACKEND)
        print("[VOICE] Classes:", list(VOICE_LE.classes_))

        if VOICE_BACKEND == "yamnet" and not YAMNET_HANDLE:
            raise RuntimeError("backend=yamnet but 'yamnet_handle' missing in model bundle.")
    except Exception as e:
        print(f"[VOICE] Could not load voice confidence model: {e}")
        VOICE_CLF = None
        VOICE_LE = None

# Function to get YAMNet model
def _prune_invalid_tfhub_cache() -> None:
    cache_root = os.environ.get("TFHUB_CACHE_DIR")
    if cache_root:
        root = Path(cache_root)
    else:
        root = Path(tempfile.gettempdir()) / "tfhub_modules"

    if not root.exists():
        return

    for child in root.iterdir():
        if not child.is_dir():
            continue
        has_saved_model = (child / "saved_model.pb").exists() or (child / "saved_model.pbtxt").exists()
        if has_saved_model:
            continue
        # Broken partial TF Hub download/cache entry. Remove it so hub can re-fetch.
        try:
            shutil.rmtree(child)
            print(f"[VOICE] Removed invalid TF Hub cache: {child}")
        except Exception as e:
            print(f"[VOICE] Could not remove invalid TF Hub cache '{child}': {e}")


def _get_yamnet():
    global _YAMNET_MODEL
    if _YAMNET_MODEL is None:
        import tensorflow_hub as hub
        print(f"[VOICE] Loading YAMNet from TF Hub: {YAMNET_HANDLE}")
        try:
            _YAMNET_MODEL = hub.load(YAMNET_HANDLE)
        except Exception as e:
            err_text = str(e)
            if "saved_model.pb" in err_text or "saved_model.pbtxt" in err_text:
                print("[VOICE] Detected broken TF Hub cache entry. Pruning invalid cache and retrying once.")
                _prune_invalid_tfhub_cache()
                _YAMNET_MODEL = hub.load(YAMNET_HANDLE)
            else:
                raise
    return _YAMNET_MODEL

# Function to extract YAMNet embeddings
def _extract_yamnet_embedding(path: str):
    try:
        import tensorflow as tf
    except Exception as e:
        print("[VOICE] TensorFlow not available:", e)
        return None

    try:
        y, _sr = librosa.load(path, sr=VOICE_SAMPLE_RATE, mono=True)
    except Exception as e:
        print(f"[VOICE] Failed to load audio '{path}': {e}")
        return None
    if y.size == 0:
        return None

    waveform = tf.convert_to_tensor(y, dtype=tf.float32)
    yamnet = _get_yamnet()
    _scores, embeddings, _spectrogram = yamnet(waveform)

    emb = embeddings.numpy()
    if emb.size == 0:
        return None

    if EMBED_POOL == "mean":
        vec = emb.mean(axis=0)
    elif EMBED_POOL == "mean_std":
        vec = np.concatenate([emb.mean(axis=0), emb.std(axis=0)], axis=0)
    else:
        return None

    return vec.astype(np.float32)

# Function to extract MFCC features
def _extract_mfcc_features(path: str):
    try:
        y, sr = librosa.load(path, sr=VOICE_SAMPLE_RATE, mono=True)
    except Exception as e:
        print(f"[VOICE] Failed to load audio '{path}': {e}")
        return None
    if y.size == 0:
        return None

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = mfcc.mean(axis=1)
    mfcc_std = mfcc.std(axis=1)

    zcr = librosa.feature.zero_crossing_rate(y)[0]
    zcr_mean = float(zcr.mean())
    zcr_std = float(zcr.std())

    rms = librosa.feature.rms(y=y)[0]
    rms_mean = float(rms.mean())
    rms_std = float(rms.std())

    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(np.array(tempo).ravel()[0]) if isinstance(tempo, (list, np.ndarray)) else float(tempo)
    except Exception:
        tempo = 0.0

    stats_vec = np.array([zcr_mean, zcr_std, rms_mean, rms_std, tempo], dtype=np.float32)
    feats = np.concatenate([mfcc_mean, mfcc_std, stats_vec]).astype(np.float32)
    return feats

# ---------------------- SILENCE / NO SPEECH ----------------------
# Threshold for detecting silence
SILENCE_RMS_THRESHOLD = float(os.environ.get("SILENCE_RMS_THRESHOLD", "0.008"))

# Function to calculate RMS mean
def _rms_mean(path: str, sr: int = 16000) -> float:
    try:
        y, _ = librosa.load(path, sr=sr, mono=True)
        if y.size == 0:
            return 0.0
        rms = librosa.feature.rms(y=y)[0]
        return float(rms.mean()) if rms.size else 0.0
    except Exception:
        return 0.0

# Function to check if audio is silence
def _is_silence(path: str) -> bool:
    return _rms_mean(path, sr=VOICE_SAMPLE_RATE) < SILENCE_RMS_THRESHOLD

# ---------------------- FFmpeg convert to wav ----------------------
# Function to check if FFmpeg is available
def _ffmpeg_exists() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False

# Function to ensure audio is in WAV format
def ensure_wav(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".wav":
        return path
    if not _ffmpeg_exists():
        return path  # fallback

    out_wav = path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", path, "-ac", "1", "-ar", str(VOICE_SAMPLE_RATE), out_wav],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        return out_wav
    except Exception as e:
        print("[AUDIO] ffmpeg convert failed:", e)
        return path

# Function to predict voice confidence
def predict_voice_confidence(path: str) -> dict:
    if VOICE_CLF is None or VOICE_LE is None:
        return {"error": "voice_model_not_loaded"}

    if _is_silence(path):
        return {
            "predicted_label": "NO_SPEECH",
            "probabilities": {},
            "note": f"silence_detected_rms<thr({SILENCE_RMS_THRESHOLD})"
        }

    vec = _extract_yamnet_embedding(path) if VOICE_BACKEND == "yamnet" else _extract_mfcc_features(path)
    if vec is None:
        return {"error": "could_not_extract_features"}

    X = vec.reshape(1, -1)

    try:
        if hasattr(VOICE_CLF, "predict_proba"):
            probs = VOICE_CLF.predict_proba(X)[0]
            pred_idx = int(np.argmax(probs))
            label = VOICE_LE.inverse_transform([pred_idx])[0]
            prob_dict = {str(VOICE_LE.classes_[i]): float(probs[i]) for i in range(len(probs))}
            return {"predicted_label": str(label), "probabilities": prob_dict}
        else:
            pred_idx = int(VOICE_CLF.predict(X)[0])
            label = VOICE_LE.inverse_transform([pred_idx])[0]
            return {"predicted_label": str(label), "probabilities": {}}
    except Exception as e:
        return {"error": "prediction_failed", "details": str(e)}

# ---------------------- Audio upload handling ----------------------
# Allowed audio extensions and MIME types
ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".m4p", ".webm", ".ogg"}
_MIME_TO_EXT = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".m4a",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "application/ogg": ".ogg",
}

# Function to get file extension
def _get_extension(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower().strip()

# Function to save uploaded audio file
def save_uploaded_audio(file_storage) -> str:
    ext = _get_extension(file_storage.filename)
    if not ext:
        ext = _MIME_TO_EXT.get((file_storage.mimetype or "").lower(), "")

    if ext not in ALLOWED_AUDIO_EXTS:
        raise ValueError(
            f"Unsupported audio format '{ext}'. Allowed: {sorted(ALLOWED_AUDIO_EXTS)}. "
            f"Got filename='{file_storage.filename}', mimetype='{file_storage.mimetype}'"
        )

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=ext)
    os.close(tmp_fd)
    file_storage.save(tmp_path)
    return tmp_path

# ---------------------- STT (Whisper) ----------------------
# Function to build initial prompt for Whisper
def build_whisper_prompt(row) -> str:
    """Build a domain-specific initial_prompt for Whisper from the question + ideal answer.
    Whisper uses this to bias transcription toward the correct ICT vocabulary."""
    question = str(row.get("question_text", "") or "").strip()
    ideal = str(row.get("ideal_answer", "") or "").strip()
    return f"{question} {ideal}".strip()

# Function to transcribe audio using Whisper
def transcribe_audio_from_path(path: str, initial_prompt: str = "") -> str:
    if _is_silence(path):
        return ""
    try:
        kwargs = {"language": "en", "fp16": False}
        if initial_prompt:
            kwargs["initial_prompt"] = initial_prompt
        result = WHISPER_MODEL.transcribe(path, **kwargs)
        text = result.get("text", "") or ""
        return text.strip()
    except Exception as e:
        print(f"[ERROR] Local STT failed: {e}")
        return ""

# ---------------------- Attempt logging ----------------------
# Function to log voice attempts
def log_voice_attempt(question_id, topic, question_text, transcript, grade):
    log_path = os.path.join(BASE_DIR, "voice_attempts_log.csv")
    row = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "question_id": question_id,
        "topic": topic,
        "question_text": question_text,
        "transcript": transcript,
        "grade_level": grade.get("level"),
        "grade_marks": grade.get("marks"),
        "coverage": grade.get("coverage"),
    }
    try:
        df_log = pd.DataFrame([row])
        if os.path.exists(log_path):
            df_log.to_csv(log_path, mode="a", header=False, index=False)
        else:
            df_log.to_csv(log_path, mode="w", header=True, index=False)
    except Exception as e:
        print(f"[WARN] Failed to log voice attempt: {e}")

# ---------------------- Question Bank (models folder) ----------------------
# Path to question CSV
QUESTION_CSV_PATH = os.environ.get(
    "QUESTION_CSV_PATH",
    os.path.join(MODELS_DIR, "it_short_answer_dataset.csv")
)

# Global dataframe for questions
df_questions = None

# Function to load question bank
def load_question_bank():
    """
    ✅ Supports 'Topics' column
    - normalizes columns
    - creates 'topic' always
    """
    global df_questions
    try:
        try:
            df_questions = pd.read_csv(QUESTION_CSV_PATH, encoding="utf-8")
        except Exception:
            df_questions = pd.read_csv(QUESTION_CSV_PATH, encoding="latin-1")

        df_questions.columns = [c.strip() for c in df_questions.columns]

        # map Topics -> topic
        if "topic" not in df_questions.columns and "Topics" in df_questions.columns:
            df_questions["topic"] = df_questions["Topics"]

        if "topic" not in df_questions.columns:
            df_questions["topic"] = ""

        df_questions["topic"] = df_questions["topic"].fillna("").astype(str)

        print(f"[INFO] Loaded question bank from {QUESTION_CSV_PATH} with {len(df_questions)} rows.")
        print("[INFO] Columns:", list(df_questions.columns))
    except Exception as e:
        print(f"[ERROR] Failed to load question bank CSV: {e}")
        df_questions = None

# Function to get a question row by question_id or question_text
def get_question_row(question_id=None, question_text=None):
    if df_questions is None:
        return None, "Question bank not loaded."

    if question_id:
        if "question_id" not in df_questions.columns:
            return None, "question_id column not found in CSV."
        rows = df_questions[df_questions["question_id"].astype(str) == str(question_id)]
        if rows.empty:
            return None, f"question_id '{question_id}' not found."
        return rows.iloc[0], None

    if question_text:
        if "question_text" not in df_questions.columns:
            return None, "question_text column not found in CSV."
        rows = df_questions[df_questions["question_text"].astype(str) == str(question_text)]
        if rows.empty:
            return None, "question_text not found in question bank."
        return rows.iloc[0], None

    return None, "question_id or question_text required."

# ---------------------- ML Grader (optional, models folder) ----------------------
# Paths to ML models
ML_CLF_PATH = os.environ.get(
    "ML_CLF_PATH",
    os.path.join(MODELS_DIR, "short_answer_grader_classifier.joblib")
)
ML_REG_PATH = os.environ.get(
    "ML_REG_PATH",
    os.path.join(MODELS_DIR, "short_answer_grader_regressor.joblib")
)

# Global ML models
ML_CLF = None
ML_REG = None

# Function to load ML grader
def _load_ml_grader():
    global ML_CLF, ML_REG
    try:
        if os.path.exists(ML_CLF_PATH):
            ML_CLF = joblib.load(ML_CLF_PATH)
            print("[ML] Loaded classifier:", ML_CLF_PATH)
        else:
            print("[ML] Classifier not found:", ML_CLF_PATH)
            ML_CLF = None
    except Exception as e:
        print("[ML] Failed to load classifier:", e)
        ML_CLF = None

    try:
        if os.path.exists(ML_REG_PATH):
            ML_REG = joblib.load(ML_REG_PATH)
            print("[ML] Loaded regressor:", ML_REG_PATH)
        else:
            print("[ML] Regressor not found:", ML_REG_PATH)
            ML_REG = None
    except Exception as e:
        print("[ML] Failed to load regressor:", e)
        ML_REG = None

# Function to grade using ML models
def ml_grade(topic: str, question_text: str, student_answer: str) -> dict:
    if ML_CLF is None:
        return {"error": "ml_classifier_not_loaded"}

    topic = clean_text(topic or "")
    qt = clean_text(question_text or "")
    ans = clean_text(student_answer or "")
    combined = f"{topic} [SEP] {qt} [SEP] {ans}".strip()

    pred_label = ML_CLF.predict([combined])[0]

    prob_dict = {}
    if hasattr(ML_CLF, "predict_proba"):
        probs = ML_CLF.predict_proba([combined])[0]
        classes = list(ML_CLF.classes_)
        prob_dict = {str(classes[i]): float(probs[i]) for i in range(len(classes))}

    marks_pred = None
    if ML_REG is not None:
        try:
            marks_pred = float(ML_REG.predict([combined])[0])
            marks_pred = max(0.0, min(10.0, marks_pred))
        except Exception:
            marks_pred = None

    return {"predicted_label": str(pred_label), "probabilities": prob_dict, "marks_pred": marks_pred}

# ---------------------- Semantic model loader ----------------------
# Global semantic and NLI models

# Function to load semantic models
def _load_semantic_models():
    global SEMANTIC_MODEL, NLI_MODEL
    if not _SENTENCE_TRANSFORMERS_AVAILABLE:
        print("[WARN] sentence-transformers not available — semantic grading disabled.")
        return
    try:
        SEMANTIC_MODEL = SentenceTransformer("all-mpnet-base-v2")
        print("[SEMANTIC] Loaded: all-mpnet-base-v2")
    except Exception as e:
        print(f"[WARN] Failed to load semantic model: {e}")
        SEMANTIC_MODEL = None
    try:
        NLI_MODEL = CrossEncoder("cross-encoder/nli-deberta-v3-small")
        print("[NLI] Loaded: cross-encoder/nli-deberta-v3-small")
    except Exception as e:
        print(f"[WARN] Failed to load NLI model: {e}")
        NLI_MODEL = None

# ---------------------- Initial load ----------------------
# Load all models and data on startup
load_question_bank()
_load_voice_model()
_load_ml_grader()
_load_semantic_models()
_load_gemini()

# ---------------------- Routes ----------------------
# Health check route
@voice_app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "base_dir": BASE_DIR,
            "models_dir": MODELS_DIR,

            "question_csv_path": QUESTION_CSV_PATH,
            "questions_loaded": df_questions is not None,
            "num_questions": int(len(df_questions)) if df_questions is not None else 0,

            "ffmpeg_available": _ffmpeg_exists(),
            "audio_allowed": sorted(list(ALLOWED_AUDIO_EXTS)),
            "silence_rms_threshold": SILENCE_RMS_THRESHOLD,

            "voice_model_path": VOICE_MODEL_PATH,
            "voice_model_loaded": VOICE_CLF is not None,
            "voice_backend": VOICE_BACKEND if VOICE_CLF is not None else None,
            "voice_classes": list(VOICE_LE.classes_) if VOICE_LE is not None else [],

            "ml_classifier_path": ML_CLF_PATH,
            "ml_regressor_path": ML_REG_PATH,
            "ml_classifier_loaded": ML_CLF is not None,
            "ml_regressor_loaded": ML_REG is not None,

            "semantic_model_loaded": SEMANTIC_MODEL is not None,
            "nli_model_loaded": NLI_MODEL is not None,

            "gemini_loaded": bool(_GEMINI_CLIENTS),
            "gemini_clients": len(_GEMINI_CLIENTS),
            "gemini_model": _GEMINI_MODEL_NAME if _GEMINI_CLIENTS else None,
            "active_grader": "gemini" if _GEMINI_CLIENTS else "keyword_fallback",

            "grade_cache_size": len(_GRADE_CACHE),
            "grade_cache_max": _GRADE_CACHE_MAX,
        }
    )

# Route to get random questions
@voice_app.route("/questions/random", methods=["GET"])
def random_questions():
    if df_questions is None:
        return jsonify({"error": "Question bank not loaded"}), 500

    try:
        count = int(request.args.get("count", 10))
    except ValueError:
        count = 10

    sample_df = df_questions.sample(n=min(count, len(df_questions)), random_state=None)
    questions = []
    for _, row in sample_df.iterrows():
        topic = str(row.get("topic", "") or row.get("Topics", "") or "")
        questions.append(
            {
                "question_id": str(row.get("question_id", "")),
                "topic": topic,
                "question_text": row.get("question_text", ""),
                "ideal_answer": row.get("ideal_answer", ""),
            }
        )
    return jsonify({"count": len(questions), "questions": questions})

# Route to grade text answers
@voice_app.route("/grade-text", methods=["POST"])
def grade_text():
    if df_questions is None:
        return jsonify({"error": "Question bank not loaded"}), 500

    data = request.get_json(silent=True) or {}
    question_id = data.get("question_id")
    question_text = data.get("question_text")
    student_answer = data.get("student_answer", "")

    if not student_answer:
        return jsonify({"error": "student_answer is required"}), 400

    row, err = get_question_row(question_id=question_id, question_text=question_text)
    if row is None:
        return jsonify({"error": err}), 404

    topic = str(row.get("topic", "") or row.get("Topics", "") or "")
    ideal_answer = str(row.get("ideal_answer", "") or "").strip()

    grading, debug = grade_rule_based_weighted(student_answer, row, fuzzy_thr=0.82)
    if grading is None:
        return jsonify({"error": debug.get("error", "grading_failed")}), 400

    return jsonify(
        {
            "question_id": str(row.get("question_id", "")),
            "topic": topic,
            "question_text": row.get("question_text", ""),
            "student_answer": student_answer,
            "ideal_answer": ideal_answer,
            "grade": grading,
            "debug": debug,
        }
    )

# Route to grade voice answers
@voice_app.route("/grade-voice", methods=["POST"])
def grade_voice():
    if df_questions is None:
        return jsonify({"error": "Question bank not loaded"}), 500

    question_id = request.form.get("question_id")
    question_text = request.form.get("question_text")

    if "audio" not in request.files:
        return jsonify({"error": "No audio file part 'audio' in request"}), 400

    audio_file = request.files["audio"]

    # Fetch question row FIRST so we can build Whisper initial_prompt from question vocabulary
    row, err = get_question_row(question_id=question_id, question_text=question_text)
    if row is None:
        return jsonify({"error": err}), 404

    whisper_prompt = build_whisper_prompt(row)

    tmp_path = None
    wav_path = None
    try:
        tmp_path = save_uploaded_audio(audio_file)
        wav_path = ensure_wav(tmp_path)

        raw_transcript = transcribe_audio_from_path(wav_path, initial_prompt=whisper_prompt)
        voice_conf = predict_voice_confidence(wav_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        for p in {tmp_path, wav_path}:
            if not p:
                continue
            try:
                os.remove(p)
            except OSError:
                pass

    topic = str(row.get("topic", "") or row.get("Topics", "") or "")
    ideal_answer = str(row.get("ideal_answer", "") or "").strip()

    # Correct STT mishearing errors before grading
    corrected_transcript = gemini_correct_transcript(
        raw_transcript,
        str(row.get("question_text", "") or ""),
        ideal_answer,
    )
    transcript = corrected_transcript if corrected_transcript else raw_transcript

    grading, debug = grade_rule_based_weighted(transcript, row, fuzzy_thr=0.82)
    if grading is None:
        return jsonify({"error": debug.get("error", "grading_failed")}), 400

    log_voice_attempt(
        question_id=str(row.get("question_id", "")),
        topic=topic,
        question_text=row.get("question_text", ""),
        transcript=transcript,
        grade=grading,
    )

    return jsonify(
        {
            "question_id": str(row.get("question_id", "")),
            "topic": topic,
            "question_text": row.get("question_text", ""),
            "transcript": transcript,
            "raw_transcript": raw_transcript,
            "ideal_answer": ideal_answer,
            "grade": grading,
            "debug": debug,
            "voice_confidence": voice_conf,
        }
    )

# Route to grade text using ML models
@voice_app.route("/grade-text-ml", methods=["POST"])
def grade_text_ml():
    data = request.get_json(silent=True) or {}
    topic = data.get("topic", "")
    question_text = data.get("question_text", "")
    student_answer = data.get("student_answer", "")

    if not question_text or not student_answer:
        return jsonify({"error": "question_text and student_answer required"}), 400

    out = ml_grade(topic, question_text, student_answer)
    return jsonify({"topic": topic, "question_text": question_text, "student_answer": student_answer, "ml": out})

# Route to predict voice confidence
@voice_app.route("/voice-confidence", methods=["POST"])
def voice_confidence_route():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file part 'audio' in request"}), 400

    audio_file = request.files["audio"]

    tmp_path = None
    wav_path = None
    try:
        tmp_path = save_uploaded_audio(audio_file)
        wav_path = ensure_wav(tmp_path)
        voice_conf = predict_voice_confidence(wav_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        for p in {tmp_path, wav_path}:
            if not p:
                continue
            try:
                os.remove(p)
            except OSError:
                pass

    return jsonify({"voice_confidence": voice_conf})

