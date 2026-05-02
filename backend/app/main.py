"""FastAPI application setup."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.routers import artifacts, jobs, summary, templates


app = FastAPI(title="Auto Lecture Video Cleaner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router_module in (jobs, templates, artifacts, summary):
    app.include_router(getattr(router_module, "router", APIRouter()))
