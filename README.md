# next-gen-smartclassroom

Next‑generation smart classroom: an experimental, end‑to‑end platform for
AI‑assisted exam proctoring, timed quizzes, and lecture recording/gallery.

## Table of contents
- **Overview**: What this project does and goals
- **Features**: Key capabilities
- **Architecture**: High‑level backend / frontend responsibilities
- **Backend**: FastAPI server, WebSocket protocol, key files
- **Frontend**: React + Vite app and main components
- **Setup & Run**: Commands to run locally (backend + frontend)
- **API & WebSocket**: Endpoints and message formats
- **Dependencies**: Where to find Python / Node deps
- **Development notes & tips**
- **Future enhancements & contributing**

## Overview

`next-gen-smartclassroom` is a prototype application that demonstrates a
real‑time AI proctoring flow combined with quick quiz generation and a small
lecture gallery. It pairs a Python FastAPI backend (computer vision & proctoring)
with a React frontend (webcam capture, status/alerts, quiz UI).

Goals:
- Provide a lightweight, local dev platform for experimenting with WebSocket‑based
	proctoring using MediaPipe + OpenCV.
- Offer on‑demand quiz generation (mock question bank) and client quiz UI.
- Allow uploading and browsing recorded lectures.

## Features
- Real‑time webcam frame streaming from browser to backend via WebSocket
- Face/pose/mouth analysis with MediaPipe + OpenCV in `proctoring_engine.py`
- Alert events: `NO_FACE`, `HEAD_TURN_LEFT`, `HEAD_TURN_RIGHT`, `TALKING`, `ALL_CLEAR`
- Quiz generation endpoint (simple question bank) and a full quiz UI
- Lecture upload endpoint and a server‑side lecture gallery
- Frontend connection handling with auto‑reconnect and status monitoring

## Architecture (high level)
- Backend: FastAPI app that exposes HTTP endpoints and a WebSocket endpoint
	for frame processing. Proctoring logic lives in `backend/proctoring_engine.py`.
- Frontend: React (Vite) single page app. Webcam capture and frame upload are
	implemented in `frontend/src/components/WebcamStream.jsx` and sent over a
	stable WebSocket hook (`frontend/src/hooks/useWebSocket.js`).

## Backend — important files
- `backend/main.py` — FastAPI app, HTTP routes, and WebSocket handler
- `backend/proctoring_engine.py` — MediaPipe + OpenCV proctoring logic
- `backend/quiz_generator.py` — quiz generation and mock question bank
- `backend/models.py` — Pydantic models used for status/alert messages
- `backend/config.py` — thresholds and config constants
- `backend/lecture_gallery/` — directory where uploaded lectures are stored

Key backend behavior:
- WebSocket path: `/ws/proctoring` — accepts JSON messages with a base64
	encoded `frame` and `timestamp` and returns `status` and `alert` messages.
- HTTP endpoints include: health checks, lecture upload/listing, and
	`/generate-quiz` for quiz generation.

## Frontend — important files and components
- `frontend/src/components/ProctoringWidget.jsx` — main proctoring UI
- `frontend/src/components/WebcamStream.jsx` — captures the webcam and sends
	frames (base64 JPEG) at ~5 FPS when connected
- `frontend/src/hooks/useWebSocket.js` — WebSocket management and auto‑reconnect
- `frontend/src/components/QuizComponent.jsx` — quiz UI, timer, scoring
- Other UI pieces: `AlertDisplay.jsx`, `StatusMonitor.jsx`, `AudioAlert.jsx`,
	`LectureGallery.jsx`, etc.

Frontend notes:
- The WebSocket client sends messages like `{ frame: <base64>, timestamp: <ISO> }`.
- The backend responds with messages of form `{ type: 'status', data: {...} }`
	and `{ type: 'alert', data: {...} }` where `data` matches the Pydantic models
	defined in `backend/models.py`.

## API & WebSocket reference

- GET `/` — basic health check
- GET `/health` — detailed health information
- POST `/upload-lecture` — multipart file upload for lecture videos
	- Accepts common video formats (.mp4, .webm, .mov, .mkv)
- GET `/lectures` — lists uploaded lecture files with metadata
- GET `/generate-quiz?topic=<topic>&count=<n>&duration=<mins>` — returns a
	generated quiz (uses the mock bank in `quiz_generator.py`)
- WebSocket `/ws/proctoring` — real‑time proctoring channel
	- Client -> Server: JSON { frame: string (base64 JPEG), timestamp: string }
	- Server -> Client (examples):
		- `{ type: 'status', data: StatusUpdate }`
		- `{ type: 'alert', data: AlertEvent }`
		- `{ type: 'error', message: string }`

Data models (summary):
- `AlertEvent`: alert_type, message_en, message_si, timestamp, severity, metadata
- `StatusUpdate`: status, face_detected, head_pose, mouth_status, timestamp

## Dependencies

Backend (`backend/requirements.txt`):
- `fastapi`, `uvicorn[standard]`, `websockets`, `opencv-python`, `mediapipe`,
	`numpy`, `python-multipart`, `pydantic`.

Frontend (`frontend/package.json`):
- React + Vite stack: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`,
	`tailwindcss`, plus `@tensorflow/tfjs` and `@tensorflow-models/coco-ssd`
	(optional client ML experiments).

## Setup & Run (development)

Prerequisites:
- Python 3.10+ (recommended), Node.js 18+ / npm

Backend (Windows PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend (macOS / Linux / Git Bash):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the frontend URL printed by Vite (usually `http://localhost:5173`) and
ensure the backend is running at `http://localhost:8000` so the WebSocket
(`ws://localhost:8000/ws/proctoring`) can connect.

## Development notes & troubleshooting
- Camera permissions: the browser must allow camera access for `WebcamStream`.
- CORS: backend currently allows all origins for development (`allow_origins=["*"]`).
	Restrict this in production to the exact allowed origins.
- Performance: frame capture is sent at ~5 FPS (adjustable in
	`WebcamStream.jsx`). For low‑latency proctoring, tune encoding quality and
	server processing parallelism.
- MediaPipe & OpenCV: these native packages may require compatible wheels for
	your platform. If installation fails, consult the package docs for platform‑specific
	instructions.

## Future enhancements
- Replace mock quiz bank with an external question source or an AI question API
- Add server‑side video transcoding / thumbnails for uploaded lectures
- Persist alerts and quiz results to a database (SQLite / Postgres)
- Add authentication & session management for exams
- Add server‑side rate limiting and hardened CORS/security settings

## Contributing
- Fork the repo, create a branch, and open a pull request describing your change.
- For new features, add tests and update these docs.

---

If you want, I can also:
- Commit this README update to the repository, or
- Create a short CONTRIBUTING.md or run scripts to verify the local setup.


