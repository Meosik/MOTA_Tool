import os
from pathlib import Path
from pydantic import BaseModel

class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    # Resolve DATA_ROOT to an absolute path. Fallback to repo appdata when missing.
    _data_env: str = os.getenv("DATA_ROOT", "./appdata")
    MODE: str = os.getenv("MODE", "local")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173")

    @property
    def DATA_ROOT(self) -> Path:
        p = Path(self._data_env).expanduser().resolve()
        if p.exists():
            return p
        # Fallback: try project root appdata (backend/../../appdata)
        repo_appdata = Path(__file__).resolve().parents[2] / "appdata"
        return repo_appdata.resolve()