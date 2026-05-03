"""
Pydantic models for WebSocket communication
"""
from pydantic import BaseModel
from enum import Enum
from datetime import datetime
from typing import Optional


class AlertType(str, Enum):
    """Types of alerts that can be triggered"""
    NO_FACE = "NO_FACE"
    HEAD_TURN_LEFT = "HEAD_TURN_LEFT"
    HEAD_TURN_RIGHT = "HEAD_TURN_RIGHT"
    TALKING = "TALKING"
    ALL_CLEAR = "ALL_CLEAR"
    # New voice/audio related alerts
    VOICE_DETECTED = "VOICE_DETECTED"
    CHEATING_SUSPECTED = "CHEATING_SUSPECTED"
    PHONE_DETECTED = "PHONE_DETECTED"


class Severity(str, Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertEvent(BaseModel):
    """Alert event sent to frontend via WebSocket"""
    alert_type: AlertType
    message_en: str
    message_si: str
    timestamp: str
    severity: Severity
    metadata: Optional[dict] = None
    
    class Config:
        use_enum_values = True


class FrameData(BaseModel):
    """Incoming frame data from frontend"""
    frame: str  # base64 encoded image
    timestamp: Optional[str] = None


class StatusUpdate(BaseModel):
    """Status update for monitoring"""
    status: str
    face_detected: bool
    face_status: Optional[str] = None
    head_pose: Optional[dict] = None
    mouth_status: Optional[str] = None
    timestamp: str
