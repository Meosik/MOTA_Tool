import os
from pydantic import BaseModel

class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    DATA_ROOT: str = os.getenv("DATA_ROOT", "./appdata")
    MODE: str = os.getenv("MODE", "local")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173")