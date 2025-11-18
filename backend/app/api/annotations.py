# backend/app/api/annotations.py
from fastapi import APIRouter, UploadFile, Form, File, HTTPException, Body
from fastapi.responses import JSONResponse, FileResponse
from typing import Literal, List, Dict, Any
from uuid import uuid4
from pathlib import Path
from app.core.config import settings
import hashlib
import json

router = APIRouter(prefix="", tags=["annotations"])

@router.post("/annotations")
async def upload_annotation(kind: Literal["gt","pred"]=Form(...), file: UploadFile=File(...)):
    """Upload annotation file (MOT txt or COCO json format)."""
    if file is None:
        raise HTTPException(status_code=400, detail="file is required")
    ann_id = uuid4().hex
    dst_dir: Path = settings.DATA_ROOT / "annotations"
    dst_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine file extension from filename
    file_ext = Path(file.filename).suffix if file.filename else '.txt'
    if file_ext not in ['.txt', '.json']:
        file_ext = '.txt'  # default to txt
    
    dst = dst_dir / f"{ann_id}{file_ext}"
    content = await file.read()
    dst.write_bytes(content)
    sha = hashlib.sha256(content).hexdigest()
    return JSONResponse({"annotation_id": ann_id, "sha256": sha, "format": file_ext[1:]})


@router.get("/annotations/{annotation_id}")
async def get_annotation(annotation_id: str):
    """Get annotation file."""
    dst_dir: Path = settings.DATA_ROOT / "annotations"
    
    # Try both .txt and .json extensions
    for ext in ['.txt', '.json']:
        ann_path = dst_dir / f"{annotation_id}{ext}"
        if ann_path.exists():
            return FileResponse(ann_path)
    
    raise HTTPException(status_code=404, detail="Annotation not found")


@router.patch("/annotations/{annotation_id}")
async def update_annotation(annotation_id: str, data: Dict[Any, Any] = Body(...)):
    """Update annotation file (for COCO format)."""
    dst_dir: Path = settings.DATA_ROOT / "annotations"
    ann_path = dst_dir / f"{annotation_id}.json"
    
    if not ann_path.exists():
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    # Save updated annotations
    with ann_path.open('w') as f:
        json.dump(data, f, indent=2)
    
    return {"status": "success", "annotation_id": annotation_id}


@router.post("/annotations/{annotation_id}/export")
async def export_annotation(annotation_id: str):
    """Export annotation file."""
    dst_dir: Path = settings.DATA_ROOT / "annotations"
    
    for ext in ['.txt', '.json']:
        ann_path = dst_dir / f"{annotation_id}{ext}"
        if ann_path.exists():
            return FileResponse(
                ann_path,
                media_type='application/octet-stream',
                filename=f"annotations_{annotation_id}{ext}"
            )
    
    raise HTTPException(status_code=404, detail="Annotation not found")
