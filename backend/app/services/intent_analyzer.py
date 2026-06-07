"""
Rule-based intent analyzer for transcript text.

The goal is to avoid false positives when a student quietly repeats the
question to remember it, while still flagging clear answer-searching speech
such as asking someone for the answer or mentioning search tools.
"""
from typing import Dict, List
import re


# Explicit phrases that strongly indicate answer-seeking or outside help.
EXPLICIT_CHEATING_PHRASES = [
    "please give me answer",
    "please give me the answer",
    "can you give me answer",
    "can you give me the answer",
    "give me answer",
    "tell me the answer",
    "tell me answer",
    "give me the answer",
    "show me the answer",
    "show me answer",
    "what is the answer",
    "whats the answer",
    "what answer",
    "send me answer",
    "send me the answer",
    "say the answer",
    "say answer",
    "help me answer",
    "help me with answer",
    "search the answer",
    "google the answer",
    "look up the answer",
    "check chatgpt",
    "ask chatgpt",
    "find the answer online",
    "answer eka denna",
]

# Search/tool words are only suspicious when paired with answer/question context.
SEARCH_KEYWORDS = [
    "search",
    "google",
    "chatgpt",
    "bing",
    "look up",
    "lookup",
    "browser",
    "internet",
    "online",
    "website",
    "web",
]

# Context words related to answer-seeking. A plain spoken question should not
# be flagged unless it is combined with search/tool language above.
ANSWER_CONTEXT_KEYWORDS = [
    "answer",
    "answers",
    "solution",
    "solutions",
    "answer key",
    "solve this",
    "solve it",
    "correct answer",
    "question",
    "problem",
    "quiz",
    "exam",
]


def _find_matches(text: str, keywords: List[str]) -> List[str]:
    matches = []
    for kw in keywords:
        if kw in text:
            matches.append(kw)
    return matches


def _normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def analyze_transcript(transcript: str) -> Dict:
    """Analyze text and return intent report.

    Returns:
        { intent: 'NORMAL'|'SUSPICIOUS'|'CHEATING', matches: [...], score: float }
    """
    if not transcript:
        return {"intent": "NORMAL", "matches": [], "score": 0.0}

    text = _normalize_text(transcript)

    explicit = _find_matches(text, EXPLICIT_CHEATING_PHRASES)
    search_hits = _find_matches(text, SEARCH_KEYWORDS)
    context_hits = _find_matches(text, ANSWER_CONTEXT_KEYWORDS)

    matches = list(dict.fromkeys(explicit))
    intent = "NORMAL"
    score = 0.0

    if explicit:
        intent = "CHEATING"
        score = 0.95
    elif search_hits and context_hits:
        intent = "CHEATING"
        matches.extend(search_hits + context_hits)
        score = 0.9
    elif search_hits:
        intent = "SUSPICIOUS"
        matches.extend(search_hits)
        score = 0.55

    matches = list(dict.fromkeys(matches))
    return {"intent": intent, "matches": matches, "score": round(score, 3)}
