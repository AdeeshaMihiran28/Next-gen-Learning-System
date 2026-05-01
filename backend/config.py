"""
Configuration settings for the AI Exam Proctoring System
"""

# Detection Thresholds
YAW_THRESHOLD = 30  # degrees - head turn angle to trigger detection
MAR_THRESHOLD = 0.6  # Mouth Aspect Ratio threshold for talking detection

# Timer Settings (in seconds)
HEAD_TURN_DURATION = 5  # seconds - how long user must turn head before alert
ALERT_COOLDOWN = 3  # seconds - cooldown between repeated alerts

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
}
