import os, json, hashlib
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..core.settings import Settings
from ..repos.ann_repo import AnnotationsRepo
from ..services.normalize import normalize_annotation

router = APIRouter()
settings = Settings()
repo = AnnotationsRepo(settings.DATA_ROOT)

@router.post("")
async def upload_annotation(kind: str = Form(...), file: UploadFile = File(...)):
    assert kind in ("gt","pred")
    raw = await file.read()
    sha = hashlib.sha256(raw).hexdigest()
    ann_dir = repo.ensure_dir(sha)
    src_path = os.path.join(ann_dir, f"source.{file.filename.split('.')[-1].lower()}")
    with open(src_path, "wb") as f:
        f.write(raw)

    norm = normalize_annotation(src_path)
    with open(os.path.join(ann_dir, "normalized.json"), "w", encoding="utf-8") as f:
        json.dump(norm, f, ensure_ascii=False)

    ann_id = repo.register(kind=kind, sha=sha, src_path=src_path)
    return {"annotation_id": ann_id, "sha256": sha}

@router.head("")
def head_by_sha256(sha256: str):
    if repo.exists_by_sha(sha256):
        return {"x-annotation-id": repo.get_id_by_sha(sha256)}
    raise HTTPException(status_code=404, detail="not found")