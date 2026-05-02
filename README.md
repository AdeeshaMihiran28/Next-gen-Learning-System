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
# Lecture Video Cleaner

Lecture Video Cleaner is a monorepo for uploading lecture recordings, detecting low-value video sections such as black screens, silence, freezes, and buffering overlays, then rendering a cleaner output video with supporting artifacts. It also includes the groundwork for transcript-based summarization and PDF summary export.

## Project Purpose

This project is intended to:

- upload raw lecture videos
- run a backend processing pipeline to identify removable segments
- preserve spoken content more safely by checking against speech timing
- generate cleaned video outputs and inspection artifacts
- provide a small frontend for upload, job tracking, artifact access, and summary preview

## Tech Stack

- Backend: Python, FastAPI, Pydantic
- Video/audio tools: FFmpeg, ffprobe
- Computer vision: OpenCV, NumPy
- Speech/transcription: local Whisper
- Summarization: Google Generative AI
- PDF generation: ReportLab
- Frontend: React, Vite, TypeScript, React Router
- Testing: pytest

## Folder Structure

```text
backend/
  app/
    core/
    domain/
    routers/
    schemas/
    services/
    utils/
    main.py
  data/
  tests/
  requirements.txt
  requirements-dev.txt
  .env
  run.ps1
  run.sh

frontend/
  src/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

Key backend areas:

- `backend/app/routers`: HTTP endpoints
- `backend/app/services`: processing, detection, rendering, summary helpers
- `backend/app/domain`: in-memory job store
- `backend/app/utils`: file and artifact helpers
- `backend/tests`: pytest coverage for core backend behavior

## Prerequisites

Install these before running the project:

- Python 3.11+ recommended
- Node.js 18+ and npm
- FFmpeg with `ffmpeg` and `ffprobe` available on `PATH`

Depending on your OS, local Whisper may also require:

- a working C/C++ build environment for some Python packages
- sufficient disk space for Whisper model downloads

## FFmpeg Requirement

FFmpeg is required for:

- video duration checks
- audio extraction
- black screen detection
- silence detection
- preview rendering
- final cleaned video rendering
- output validation

Verify installation:

```bash
ffmpeg -version
ffprobe -version
```

If either command is missing, the backend pipeline will fail with an `FFmpegNotFound` error.

## Backend Setup

From the repo root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

For development and tests:

```bash
pip install -r requirements-dev.txt
```

Configure `backend/.env` with values similar to:

```env
UPLOAD_DIR=data/uploads
OUTPUT_DIR=data/outputs
TEMPLATE_DIR=data/templates
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
GOOGLE_API_KEY=your_google_api_key
GOOGLE_MODEL=gemini-2.5-flash
```

## Frontend Setup

From the repo root:

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


```

The frontend expects the backend API to be available on port `8000`.

## How To Run Backend

From `backend/` on Windows PowerShell:

```powershell
.\run.ps1
```

From `backend/` on macOS/Linux:

```bash
./run.sh
```

Or run Uvicorn directly:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend app title:

- `Auto Lecture Video Cleaner`

Default backend URL:

- `http://localhost:8000`

## How To Run Frontend

From `frontend/`:

```bash
npm run dev
```

Default frontend URL:

- `http://localhost:5173`

Production build:

```bash
npm run build
```

## Main API Endpoints

Jobs:

- `POST /api/upload`
  Upload a video file. Supports `auto_start` and returns a `job_id`.
- `GET /api/jobs/{job_id}`
  Get current job status, progress, logs, timestamps, and cleaned output URL when available.
- `POST /api/jobs/{job_id}/run`
  Queue a job for background processing.

Templates:

- `POST /api/templates/upload`
  Upload one or more buffering template images (`.png`, `.jpg`, `.jpeg`).
- `GET /api/templates`
  List saved buffering templates.
- `DELETE /api/templates/{template_id}`
  Delete a saved template image by ID.

Artifacts:

- `GET /api/jobs/{job_id}/artifacts`
  Return available artifact URLs for the job.
- `GET /api/jobs/{job_id}/download`
  Download the cleaned video.
- `GET /api/jobs/{job_id}/report`
  Load `report.json`.
- `GET /api/jobs/{job_id}/removed-preview`
  Download the removed-segment preview video.
- `GET /api/jobs/{job_id}/kept-preview`
  Download the kept-segment preview video.
- `GET /api/jobs/{job_id}/segments.csv`
  Download merged segment timings.
- `GET /api/jobs/{job_id}/logs/black`
- `GET /api/jobs/{job_id}/logs/silence`
- `GET /api/jobs/{job_id}/logs/freeze`
- `GET /api/jobs/{job_id}/logs/buffering`
- `GET /api/jobs/{job_id}/logs/transcript`

Summary:

- `POST /api/jobs/{job_id}/summary`
  Placeholder endpoint for summary generation orchestration.
- `GET /api/jobs/{job_id}/summary.json`
  Load generated structured summary if it exists.
- `GET /api/jobs/{job_id}/summary.pdf`
  Download generated summary PDF if it exists.

## Generated Artifacts

The backend is designed to write artifacts under `OUTPUT_DIR / {job_id}`. Current helpers and routes support these artifact types:

- `cleaned.mp4`
- `removed_preview.mp4`
- `kept_preview.mp4`
- `report.json`
- `segments.csv`
- `black_log.json`
- `silence_log.json`
- `freeze.json`
- `buffering.json`
- `transcript.json`
- `summary.json`
- `summary.pdf`

In general:

- preview videos help inspect what was removed or kept
- log JSON files help inspect detector output
- `segments.csv` gives merged segment timing data
- `report.json` is intended to summarize pipeline results

## Summary Feature Notes

The repo already includes:

- transcript chunking helpers
- Google Generative AI summarization helpers
- PDF generation with ReportLab
- frontend summary controls and preview UI

Current limitation:

- `POST /api/jobs/{job_id}/summary` is still a placeholder HTTP endpoint
- `summary.json` and `summary.pdf` are only available if a separate process writes them into the job output directory

So the summary pipeline pieces exist, but the end-to-end summary generation flow is not fully wired through the API yet.

## Testing Notes

Backend tests live under [`backend/tests`](./backend/tests).

Covered areas:

- config loading
- in-memory job store behavior
- upload endpoint
- job status endpoint
- transcript chunking helpers
- segment merge logic
- speech-safe trimming
- summary formatting helpers

Run tests from the repo root:

```bash
python -m pytest
```

Current status:

- backend pytest suite passes

## Notes

- The backend job store is currently in-memory only. Restarting the backend clears job state.
- The frontend is intentionally minimal and focused on upload, status tracking, artifact access, and summary preview.
- Some backend services depend on external binaries or large local models, so successful runtime use depends on your local environment, not just Python package installation.
