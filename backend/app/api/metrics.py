import os, json
from fastapi import APIRouter, HTTPException
from ..core.settings import Settings
from ..repos.metrics_repo import MetricsRepo

router = APIRouter()
settings = Settings()
repo = MetricsRepo(settings.DATA_ROOT)

@router.get("/{run_id}/metrics")
def get_metrics(run_id: str):
    data = repo.read(run_id)
    if data is None:
        raise HTTPException(status_code=404, detail="metrics not found")
    return data