from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
from pathlib import Path
from app.core.config import settings
import shutil
import uuid

router = APIRouter()

@router.post("/images/folder")
async def upload_image_folder(images: List[UploadFile] = File(...)):
    # 고유 폴더명 생성
    folder_id = str(uuid.uuid4())
    save_dir = settings.DATA_ROOT / "images" / folder_id
    save_dir.mkdir(parents=True, exist_ok=True)
    
    for img in images:
        dest = save_dir / img.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(img.file, f)
    
    return {"folder_id": folder_id, "count": len(images)}
