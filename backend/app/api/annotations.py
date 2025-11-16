# backend/app/api/annotations.py
from fastapi import APIRouter, UploadFile, Form, File, HTTPException
from fastapi.responses import JSONResponse
from typing import Literal
from uuid import uuid4
from pathlib import Path
from app.core.config import settings
import hashlib

router = APIRouter(prefix="", tags=["annotations"])

@router.post("/annotations")
async def upload_annotation(kind: Literal["gt","pred"]=Form(...), file: UploadFile=File(...)):
    if file is None:
        raise HTTPException(status_code=400, detail="file is required")
    ann_id = uuid4().hex
    dst_dir: Path = settings.DATA_ROOT / "annotations"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / f"{ann_id}.txt"
    content = await file.read()
    dst.write_bytes(content)
    sha = hashlib.sha256(content).hexdigest()
    return JSONResponse({"annotation_id": ann_id, "sha256": sha})
