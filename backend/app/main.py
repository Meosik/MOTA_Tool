# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.annotations import router as annotations_router
from app.api.realtime import router as realtime_router
from app.api.tracks import router as tracks_router 
from app.api.export import router as export_router
from app.api.analysis import router as analysis_router

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

# 기존 라우터
app.include_router(annotations_router)
app.include_router(realtime_router)

# ★ /tracks 라우터 명시 등록 (prefix 없이 바로 /tracks 노출)
app.include_router(tracks_router)
app.include_router(export_router)
app.include_router(analysis_router)