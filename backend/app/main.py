import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.settings import Settings
from .api import annotations, runs, metrics, tracks, health, realtime

settings = Settings()

app = FastAPI(title="TrackerEval API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="")
app.include_router(annotations.router, prefix="/annotations", tags=["annotations"])
app.include_router(runs.router, prefix="/runs", tags=["runs"])
app.include_router(metrics.router, prefix="/runs", tags=["metrics"])
app.include_router(tracks.router, prefix="/tracks", tags=["tracks"])
app.include_router(realtime.router, prefix="/ws", tags=["realtime"])