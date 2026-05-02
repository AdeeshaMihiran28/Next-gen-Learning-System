import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dbconnect import init_db
from auth import router as auth_router

from starlette.middleware.wsgi import WSGIMiddleware
from voicemodel import voice_app
from quiz_api import router as quiz_router


load_dotenv()


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Voice Quiz Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Flask ICT/Voice service under /ict
app.mount("/ict", WSGIMiddleware(voice_app))
app.include_router(auth_router)
app.include_router(quiz_router)


@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
