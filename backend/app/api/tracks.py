# backend/app/api/tracks.py
from fastapi import APIRouter, Query, HTTPException
from app.core.config import settings
from app.repos.ann_repo import AnnotationsRepo
from app.services.overlay_stream import slice_tracks
from pathlib import Path
import csv

router = APIRouter()
repo = AnnotationsRepo(settings.DATA_ROOT)

def _parse_mot_slice_from_file(path: Path, f0: int, f1: int):
    """
    아주 일반적인 MOT txt(csv) 포맷:
      frame, id, x, y, w, h, conf, -1, -1, -1
    를 파싱해서 프론트가 기대하는 구조로 변환한다.
    반환 형태:
      { "tracks": [ { "id": <int>, "frames": [ {"f": <int>, "bbox":[x,y,w,h], "conf": <float>} ... ] } ... ] }
    """
    tracks: dict[int, list[dict]] = {}
    with path.open("r", encoding="utf-8") as fp:
        reader = csv.reader(fp)
        for row in reader:
            if not row:
                continue
            try:
                fr = int(float(row[0]))
                tid = int(float(row[1]))
                x = float(row[2]); y = float(row[3]); w = float(row[4]); h = float(row[5])
                conf = float(row[6]) if len(row) > 6 and row[6] not in ("", None) else 1.0
            except Exception:
                # 행이 이상하면 스킵
                continue
            if fr < min(f0, f1) or fr > max(f0, f1):
                continue
            tracks.setdefault(tid, []).append({
                "f": fr,
                "bbox": [x, y, w, h],
                "conf": conf,
            })
    # id 순서 안정화
    out = {"tracks": [{"id": k, "frames": sorted(v, key=lambda a: a["f"])} for k, v in sorted(tracks.items())]}
    return out

@router.get("/tracks")
def get_tracks_compat(
    annotation_id: str,
    f0: int | None = Query(None, description="start frame (inclusive)"),
    f1: int | None = Query(None, description="end frame (inclusive)"),
    t0: float | None = Query(None, description="start time (optional)"),
    t1: float | None = Query(None, description="end time (optional)"),
):
    """
    프론트: /tracks?annotation_id=...&f0=1&f1=1
    기존 서버는 t0/t1(시간) 기반. 둘 다 허용한다.
    """
    # 1) 기존 repo 경로 시도
    doc = repo.read_normalized(annotation_id)
    if doc:
        # 시간/프레임 파라미터 호환
        if t0 is None or t1 is None:
            if f0 is None or f1 is None:
                raise HTTPException(status_code=400, detail="either t0/t1 or f0/f1 must be provided")
            t0_use = float(min(f0, f1))
            t1_use = float(max(f0, f1))
        else:
            t0_use = float(min(t0, t1))
            t1_use = float(max(t0, t1))
        return slice_tracks(doc, t0_use, t1_use)

    # 2) repo가 None이면, 디스크에서 직접 MOT 파싱(강력 폴백)
    ann_dir = Path(settings.DATA_ROOT) / "annotations"
    cand_txt = ann_dir / f"{annotation_id}.txt"
    cand_json = ann_dir / f"{annotation_id}.json"  # (혹시 JSON 포맷인 경우)

    # f0/f1은 필수(프레임 범위 필요)
    if f0 is None or f1 is None:
        raise HTTPException(status_code=400, detail="annotation loaded via fallback; f0,f1 required")

    if cand_txt.exists():
        return _parse_mot_slice_from_file(cand_txt, f0, f1)
    if cand_json.exists():
        # COCO json 포맷을 image_id 기반으로 변환하여 반환
        try:
            import json
            with cand_json.open("r", encoding="utf-8") as fp:
                coco_data = json.load(fp)
            # COCO predictions: list or dict
            if isinstance(coco_data, list):
                # predictions only (list)
                tracks = {}
                for ann in coco_data:
                    tid = ann.get("id", 0)
                    image_id = ann.get("image_id")
                    frame = image_id
                    box = ann.get("bbox", [0,0,0,0])
                    conf = ann.get("score", 1.0)
                    tracks.setdefault(tid, []).append({"f": frame, "bbox": box, "conf": conf})
                out = {"tracks": [
                    {"id": k, "frames": sorted(v, key=lambda a: a["f"])} for k, v in sorted(tracks.items())
                ]}
                return out
            elif isinstance(coco_data, dict) and "annotations" in coco_data:
                # full COCO format
                tracks = {}
                for ann in coco_data["annotations"]:
                    tid = ann.get("id", 0)
                    image_id = ann.get("image_id")
                    frame = image_id
                    box = ann.get("bbox", [0,0,0,0])
                    conf = ann.get("score", 1.0)
                    tracks.setdefault(tid, []).append({"f": frame, "bbox": box, "conf": conf})
                out = {"tracks": [
                    {"id": k, "frames": sorted(v, key=lambda a: a["f"])} for k, v in sorted(tracks.items())
                ]}
                return out
            else:
                # 이미 {tracks:[...]} 구조면 그대로 반환
                return coco_data
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"failed to parse json: {e}")

    # 3) 정말 없으면 디버그 정보와 함께 404
    detail = {
        "msg": "annotation not found",
        "data_root": str(settings.DATA_ROOT),
        "checked": [str(cand_txt), str(cand_json)],
        "dir_listing_sample": sorted([p.name for p in ann_dir.glob("*")])[:100],
    }
    raise HTTPException(status_code=404, detail=detail)
