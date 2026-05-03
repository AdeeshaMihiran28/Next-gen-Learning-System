"""
Configuration settings for the AI Exam Proctoring System
"""

# Detection Thresholds
YAW_THRESHOLD = 30  # degrees - head turn angle to trigger detection
MAR_THRESHOLD = 0.6  # Mouth Aspect Ratio threshold for talking detection

# Timer Settings (in seconds)
HEAD_TURN_DURATION = 5  # seconds - how long user must turn head before alert
ALERT_COOLDOWN = 3  # seconds - cooldown between repeated alerts
NO_FACE_GRACE_PERIOD = 1.0  # seconds - face must be missing this long before alerting
PHONE_ALERT_RESET_SECONDS = 1.5  # seconds - phone must disappear this long before re-alerting

# MediaPipe Settings
MIN_DETECTION_CONFIDENCE = 0.5
MIN_TRACKING_CONFIDENCE = 0.5
MAX_NUM_FACES = 1  # Only track primary face for exam proctoring

# Camera Settings
DEFAULT_CAMERA_WIDTH = 640
DEFAULT_CAMERA_HEIGHT = 480

# WebSocket Settings
WEBSOCKET_PING_INTERVAL = 30  # seconds
WEBSOCKET_PING_TIMEOUT = 10  # seconds

# Alert Messages
ALERT_MESSAGES = {
    "NO_FACE": {
        "en": "Warning. Face not detected. Please stay in view.",
        "si": "අවවාදයයි. මුහුණ හඳුනාගත නොහැක. කරුණාකර දර්ශනයේ සිටින්න."
    },
    "HEAD_TURN_LEFT": {
        "en": "Warning. Please focus on the exam. Do not look left.",
        "si": "අවවාදයයි. විභාගයට අවධානය යොමු කරන්න. වමට නොබලන්න."
    },
    "HEAD_TURN_RIGHT": {
        "en": "Warning. Please focus on the exam. Do not look right.",
        "si": "අවවාදයයි. විභාගයට අවධානය යොමු කරන්න. දකුණට නොබලන්න."
    },
    "TALKING": {
        "en": "Warning. Please stop talking during the exam.",
        "si": "අවවාදයයි. විභාගය අතරතුර කතා නොකරන්න."
    },
    "ALL_CLEAR": {
        "en": "All clear. Continue with your exam.",
        "si": "සියල්ල හරි. ඔබේ විභාගය දිගටම කරන්න."
    }
    ,
    "VOICE_DETECTED": {
        "en": "Voice activity detected.",
        "si": "හඬක් හඳුනාගැනූ බවක් ඇත."
    },
    "CHEATING_SUSPECTED": {
        "en": "Suspicious speech detected. Possible cheating.",
        "si": "සංශයීලී කථනයක් හඳුනාගෙන ඇත. හැකි සොතාහ්‍යා ව්‍යවහාරයක්."
    },
    "PHONE_DETECTED": {
        "en": "Warning. Mobile phone detected. Please put it away.",
        "si": "අවවාදයයි. ජංගම දුරකථනයක් හඳුනාගෙන ඇත. කරුණාකර එය ඉවත් කරන්න."
    }
}

# Authentication / JWT settings
import os
from datetime import timedelta

# If you want a persistent secret, set environment variable APP_SECRET_KEY
SECRET_KEY = os.environ.get('APP_SECRET_KEY') or os.environ.get('SECRET_KEY') or "change-me-to-a-secure-random-string"
ALGORITHM = "HS256"
# Token expiry in minutes
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES') or 60 * 24)

# MongoDB configuration. Prefer setting MONGO_URI in environment for secrets.
# For quick local setup you can replace the default below, but avoid committing secrets.
# Example URI (no DB name): mongodb+srv://user:pass@cluster0.example.mongodb.net/
MONGO_URI = os.environ.get('MONGO_URI') or "mongodb+srv://Hiruna:Wphd123@cluster0.c7mb8lr.mongodb.net/"
# Default database name to use when MONGO_URI does not include one
MONGO_DB = os.environ.get('MONGO_DB') or 'next_gen_smartclassroom'
