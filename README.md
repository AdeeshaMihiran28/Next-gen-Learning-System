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
