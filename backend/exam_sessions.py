"""
Exam session storage — per-student proctoring data.

Stores violations, no-face detections, and audio transcripts per student
session in a local SQLite database (exam_sessions.db).

Endpoints:
    POST /exam-sessions            — create / append to a session
    GET  /exam-sessions            — list all sessions (summary)
    GET  /exam-sessions/{id}       — full detail for one session
    DELETE /exam-sessions/{id}     — delete a session
    DELETE /exam-sessions          — delete all sessions
"""

import asyncio
import json
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["exam-sessions"])

DB_FILE = "exam_sessions.db"


# ──────────────────────────────── DB helpers ────────────────────────────────

def _conn():
    c = sqlite3.connect(DB_FILE, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init_db():
    """Create tables if they do not exist."""
    c = _conn()
    cur = c.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS exam_sessions (
            id          TEXT PRIMARY KEY,
            student     TEXT NOT NULL,
            exam_topic  TEXT,
            started_at  TEXT NOT NULL,
            ended_at    TEXT,
            score       REAL,
            total       INTEGER,
            percentage  REAL,
            grade       TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS session_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
            event_type  TEXT NOT NULL,
            timestamp   TEXT NOT NULL,
            data        TEXT,
            FOREIGN KEY (session_id) REFERENCES exam_sessions(id)
        )
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id)")
    c.commit()
    c.close()


_init_db()


# ──────────────────────────────── Models ────────────────────────────────────

class EventPayload(BaseModel):
    event_type: str            # "violation" | "no_face" | "transcript"
    timestamp: Optional[str] = None
    data: Optional[dict] = None


class SessionCreate(BaseModel):
    student: str
    exam_topic: Optional[str] = None
    score: Optional[float] = None
    total: Optional[int] = None
    percentage: Optional[float] = None
    grade: Optional[str] = None
    events: list[EventPayload] = Field(default_factory=list)


class SessionAppend(BaseModel):
    events: list[EventPayload] = Field(default_factory=list)


# ──────────────────────────────── Endpoints ────────────────────────────────

@router.post("/exam-sessions")
async def create_session(body: SessionCreate):
    """Create a new exam session for a student and optionally insert events."""
    session_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("""
            INSERT INTO exam_sessions (id, student, exam_topic, started_at, score, total, percentage, grade)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, body.student, body.exam_topic, now, body.score, body.total, body.percentage, body.grade))

        for ev in body.events:
            cur.execute("""
                INSERT INTO session_events (session_id, event_type, timestamp, data)
                VALUES (?, ?, ?, ?)
            """, (session_id, ev.event_type, ev.timestamp or now, json.dumps(ev.data) if ev.data else None))

        c.commit()
        c.close()

    await asyncio.to_thread(_do)
    return {"success": True, "session_id": session_id}


@router.post("/exam-sessions/{session_id}/events")
async def append_events(session_id: str, body: SessionAppend):
    """Append events to an existing session."""
    now = datetime.now().isoformat()

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("SELECT id FROM exam_sessions WHERE id = ?", (session_id,))
        if not cur.fetchone():
            c.close()
            raise HTTPException(status_code=404, detail="Session not found")
        for ev in body.events:
            cur.execute("""
                INSERT INTO session_events (session_id, event_type, timestamp, data)
                VALUES (?, ?, ?, ?)
            """, (session_id, ev.event_type, ev.timestamp or now, json.dumps(ev.data) if ev.data else None))
        c.commit()
        c.close()

    await asyncio.to_thread(_do)
    return {"success": True, "added": len(body.events)}


@router.patch("/exam-sessions/{session_id}")
async def update_session(session_id: str, body: dict):
    """Update session fields (e.g. score after quiz completes)."""
    allowed = {"score", "total", "percentage", "grade", "ended_at", "exam_topic"}

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("SELECT id FROM exam_sessions WHERE id = ?", (session_id,))
        if not cur.fetchone():
            c.close()
            raise HTTPException(status_code=404, detail="Session not found")
        for k, v in body.items():
            if k in allowed:
                cur.execute(f"UPDATE exam_sessions SET {k} = ? WHERE id = ?", (v, session_id))
        c.commit()
        c.close()

    await asyncio.to_thread(_do)
    return {"success": True}


@router.get("/exam-sessions")
async def list_sessions():
    """Return summary list of all exam sessions."""

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("""
            SELECT s.*,
                   (SELECT COUNT(*) FROM session_events e WHERE e.session_id = s.id AND e.event_type = 'violation') AS violation_count,
                   (SELECT COUNT(*) FROM session_events e WHERE e.session_id = s.id AND e.event_type = 'no_face') AS no_face_count,
                   (SELECT COUNT(*) FROM session_events e WHERE e.session_id = s.id AND e.event_type = 'transcript') AS transcript_count
            FROM exam_sessions s
            ORDER BY s.started_at DESC
        """)
        rows = cur.fetchall()
        c.close()
        return [dict(r) for r in rows]

    sessions = await asyncio.to_thread(_do)
    return {"sessions": sessions}


@router.get("/exam-sessions/{session_id}")
async def get_session(session_id: str):
    """Full session detail with all events."""

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("SELECT * FROM exam_sessions WHERE id = ?", (session_id,))
        row = cur.fetchone()
        if not row:
            c.close()
            raise HTTPException(status_code=404, detail="Session not found")
        session = dict(row)

        cur.execute("SELECT * FROM session_events WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
        events = []
        for e in cur.fetchall():
            ev = dict(e)
            if ev.get("data"):
                try:
                    ev["data"] = json.loads(ev["data"])
                except Exception:
                    pass
            events.append(ev)

        c.close()
        session["events"] = events
        return session

    session = await asyncio.to_thread(_do)
    return session


@router.delete("/exam-sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a single session and its events."""

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("DELETE FROM session_events WHERE session_id = ?", (session_id,))
        cur.execute("DELETE FROM exam_sessions WHERE id = ?", (session_id,))
        c.commit()
        c.close()

    await asyncio.to_thread(_do)
    return {"success": True}


@router.delete("/exam-sessions")
async def delete_all_sessions():
    """Delete ALL sessions and events."""

    def _do():
        c = _conn()
        cur = c.cursor()
        cur.execute("DELETE FROM session_events")
        cur.execute("DELETE FROM exam_sessions")
        c.commit()
        c.close()

    await asyncio.to_thread(_do)
    return {"success": True}
