import json, os
from fastapi import APIRouter, Query, HTTPException
from ..core.settings import Settings
from ..repos.ann_repo import AnnotationsRepo
from ..services.overlay_stream import slice_tracks

router = APIRouter()
settings = Settings()
repo = AnnotationsRepo(settings.DATA_ROOT)

@router.get("")
def get_tracks(annotation_id: str, t0: float = Query(0.0), t1: float = Query(1.0)):
    doc = repo.read_normalized(annotation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="annotation not found")
    return slice_tracks(doc, t0, t1)