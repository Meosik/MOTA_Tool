# backend/app/core/config.py
import os
from pathlib import Path

class Settings:
    APP_NAME: str = "tracker-eval-backend"
    DATA_ROOT: Path = Path(os.environ.get("DATA_ROOT", "/app/appdata")).resolve()
    _raw_cors = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    _origins = [o.strip() for o in _raw_cors.split(",") if o.strip()]
    # localhost / 127.0.0.1 상호 치환 확장 (포트/프로토콜 유지)
    expanded: set[str] = set()
    for origin in _origins:
        expanded.add(origin)
        if "localhost" in origin:
            expanded.add(origin.replace("localhost", "127.0.0.1"))
        if "127.0.0.1" in origin:
            expanded.add(origin.replace("127.0.0.1", "localhost"))
    CORS_ORIGINS = sorted(expanded)

    def ensure_dirs(self):
        (self.DATA_ROOT / "annotations").mkdir(parents=True, exist_ok=True)

settings = Settings()
settings.ensure_dirs()
