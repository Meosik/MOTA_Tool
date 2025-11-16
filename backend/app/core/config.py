# backend/app/core/config.py
import os
from pathlib import Path

class Settings:
    APP_NAME: str = "tracker-eval-backend"
    DATA_ROOT: Path = Path(os.environ.get("DATA_ROOT", "/app/appdata")).resolve()
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

    def ensure_dirs(self):
        (self.DATA_ROOT / "annotations").mkdir(parents=True, exist_ok=True)

settings = Settings()
settings.ensure_dirs()
