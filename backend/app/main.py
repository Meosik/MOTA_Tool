# backend/app/main.py
# Increase multipart form limits BEFORE importing FastAPI/Starlette
# This allows uploading up to 10,000 images in a single request
import os
os.environ['STARLETTE_MAX_FIELDS'] = '10000'

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.annotations import router as annotations_router
from app.api.realtime import router as realtime_router
from app.api.tracks import router as tracks_router 
from app.api.export import router as export_router
from app.api.images import router as images_router

from app.api.analysis import router as analysis_router
from app.api.map_metrics import router as map_metrics_router

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def debug_cors(request: Request, call_next):
    # 문제 분석용 간단 로깅: Origin 헤더와 경로
    origin = request.headers.get("origin")
    path = request.url.path
    # 특정 경로만 출력 과다 방지: analysis / ws preview handshake 관련
    if path.startswith("/analysis") or path.startswith("/ws"):
        print(f"[CORS-TRACE] path={path} origin={origin}")
    response = await call_next(request)
    return response

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/cors_origins")
def cors_origins():
    """디버그용: 현재 허용된 CORS ORIGIN 목록 노출."""
    from app.core.config import settings as _s
    return {"cors_origins": _s.CORS_ORIGINS}

# 기존 라우터
app.include_router(annotations_router)
app.include_router(realtime_router)

# ★ /tracks 라우터 명시 등록 (prefix 없이 바로 /tracks 노출)
app.include_router(tracks_router)
app.include_router(export_router)
app.include_router(analysis_router)
app.include_router(map_metrics_router, prefix="/map")
app.include_router(images_router)