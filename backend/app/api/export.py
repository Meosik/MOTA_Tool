# backend/app/api/export.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Dict, Tuple
import csv
import io

from app.core.config import settings  # 기존 main.py가 쓰는 settings 그대로 사용

router = APIRouter()

ANNOT_DIR = Path(settings.DATA_ROOT) / "annotations"

class OverrideRecord(BaseModel):
    frame: int
    id: int
    x: float
    y: float
    w: float
    h: float
    conf: float = 1.0

class MergeExportIn(BaseModel):
    pred_annotation_id: str = Field(..., description="서버에 저장된 Pred annotation id (확장자 제외)")
    overrides: List[OverrideRecord] = Field(default_factory=list)

def _load_mot_to_map(p: Path) -> Dict[int, Dict[int, Tuple[float,float,float,float,float]]]:
    """
    MOT txt(csv) -> { frame: { id: (x,y,w,h,conf) } }
    """
    table: Dict[int, Dict[int, Tuple[float,float,float,float,float]]] = {}
    with p.open("r", encoding="utf-8") as fp:
        reader = csv.reader(fp)
        for row in reader:
            if not row:
                continue
            try:
                fr = int(float(row[0])); tid = int(float(row[1]))
                x = float(row[2]); y = float(row[3]); w = float(row[4]); h = float(row[5])
                conf = float(row[6]) if len(row) > 6 and row[6] not in ("", None) else 1.0
            except Exception:
                # 한 줄이 비정상이면 스킵
                continue
            byf = table.get(fr)
            if not byf:
                byf = {}
                table[fr] = byf
            byf[tid] = (x,y,w,h,conf)
    return table

def _serialize_mot(table: Dict[int, Dict[int, Tuple[float,float,float,float,float]]]) -> str:
    """
    {frame:{id:(x,y,w,h,conf)}} -> MOT txt
    좌표는 정수(Math.round)로 직렬화.
    """
    out = io.StringIO()
    frames = sorted(table.keys())
    for fr in frames:
        ids = sorted(table[fr].keys())
        for tid in ids:
            x,y,w,h,conf = table[fr][tid]
            xi = round(x); yi = round(y); wi = round(w); hi = round(h)
            out.write(f"{fr},{tid},{xi},{yi},{wi},{hi},{conf:.4f},-1,-1,-1\n")
    return out.getvalue()

@router.post("/export/merge", response_class=PlainTextResponse)
def export_merge(payload: MergeExportIn):
    """
    원본 pred_annotation_id 파일을 읽어들여 overrides를 반영한 뒤
    병합 결과(MOT)를 text/plain으로 반환.
    """
    # 원본 파일 찾기
    src_txt = ANNOT_DIR / f"{payload.pred_annotation_id}.txt"
    src_json = ANNOT_DIR / f"{payload.pred_annotation_id}.json"

    table: Dict[int, Dict[int, Tuple[float,float,float,float,float]]]
    if src_txt.exists():
        table = _load_mot_to_map(src_txt)
    elif src_json.exists():
        # JSON 포맷은 {tracks:[{id,frames:[{f,bbox(4),conf?}] }]} 로 가정
        import json
        with src_json.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
        table = {}
        for tr in data.get("tracks", []):
            tid = int(tr["id"])
            for fr in tr.get("frames", []):
                f = int(fr["f"])
                x,y,w,h = [float(v) for v in fr["bbox"]]
                conf = float(fr.get("conf", 1.0))
                byf = table.get(f) or {}
                byf[tid] = (x,y,w,h,conf)
                table[f] = byf
    else:
        raise HTTPException(status_code=404, detail={"msg":"annotation not found on server", "candidates":[str(src_txt), str(src_json)]})

    # overrides 적용 (수정분은 원본을 덮어씀. 없던 id면 추가)
    for ov in payload.overrides:
        byf = table.get(ov.frame) or {}
        byf[ov.id] = (ov.x, ov.y, ov.w, ov.h, float(ov.conf))
        table[ov.frame] = byf

    mot_text = _serialize_mot(table)

    # 스트리밍 응답 (파일 다운로드 힌트)
    fname = f"prediction_merged_full_{payload.pred_annotation_id}.txt"
    return StreamingResponse(
        io.BytesIO(mot_text.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"'
        }
    )

@router.get("/annotations/{annotation_id}/download", response_class=PlainTextResponse)
def download_raw(annotation_id: str):
    """
    원본 annotation(raw)을 그대로 내려줌 (오버라이드 없이).
    """
    src_txt = ANNOT_DIR / f"{annotation_id}.txt"
    src_json = ANNOT_DIR / f"{annotation_id}.json"
    if src_txt.exists():
        return PlainTextResponse(src_txt.read_text(encoding="utf-8"))
    if src_json.exists():
        return PlainTextResponse(src_json.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404, detail="annotation not found")
