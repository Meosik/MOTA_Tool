from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from typing import List, Optional
from pathlib import Path
from app.core.config import settings
import shutil
import uuid
import json

router = APIRouter()

@router.post("/images/folder")
async def upload_image_folder(images: List[UploadFile] = File(...)):
    """Upload a folder of images for MAP mode."""
    folder_id = str(uuid.uuid4())
    save_dir = settings.DATA_ROOT / "images" / folder_id
    save_dir.mkdir(parents=True, exist_ok=True)
    
    image_list = []
    for idx, img in enumerate(images):
        dest = save_dir / img.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(img.file, f)
        image_list.append({
            'id': idx + 1,
            'file_name': img.filename,
            'path': str(dest)
        })
    
    # Save image list metadata
    metadata_path = save_dir / "images.json"
    with metadata_path.open("w") as f:
        json.dump(image_list, f, indent=2)
    
    return {"folder_id": folder_id, "count": len(images), "images": image_list}


@router.get("/images/{folder_id}")
async def get_image_list(folder_id: str):
    """Get list of images in a folder."""
    folder_dir = settings.DATA_ROOT / "images" / folder_id
    if not folder_dir.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    metadata_path = folder_dir / "images.json"
    if metadata_path.exists():
        with metadata_path.open("r") as f:
            return json.load(f)
    
    # Fallback: scan directory
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif'}
    images = []
    for idx, img_path in enumerate(sorted(folder_dir.iterdir())):
        if img_path.suffix.lower() in image_extensions:
            images.append({
                'id': idx + 1,
                'file_name': img_path.name,
                'path': str(img_path)
            })
    return images


@router.get("/images/{folder_id}/{image_id}")
async def get_image(folder_id: str, image_id: str):
    """Get a specific image file."""
    folder_dir = settings.DATA_ROOT / "images" / folder_id
    if not folder_dir.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Try to find the image by ID or filename
    metadata_path = folder_dir / "images.json"
    if metadata_path.exists():
        with metadata_path.open("r") as f:
            images = json.load(f)
            for img in images:
                if str(img['id']) == image_id or img['file_name'] == image_id:
                    img_path = Path(img['path'])
                    if img_path.exists():
                        return FileResponse(img_path)
    
    # Fallback: try direct filename
    img_path = folder_dir / image_id
    if img_path.exists():
        return FileResponse(img_path)
    
    raise HTTPException(status_code=404, detail="Image not found")
