# backend/app/services/mota.py
from pathlib import Path
from typing import List, Dict, Tuple

def parse_line(line: str):
    # 쉼표/공백 혼용 안전 파싱
    parts = [p for p in line.replace(',', ' ').split() if p]
    if len(parts) < 6:
        return None
    try:
        f  = int(float(parts[0]))
        i  = int(float(parts[1]))
        x  = float(parts[2]); y = float(parts[3])
        w  = float(parts[4]); h = float(parts[5])
        conf = 1.0
        if len(parts) >= 7:
            try: conf = float(parts[6])
            except: conf = 1.0
        return (f, i, x, y, w, h, conf)
    except:
        return None

# frame -> [ (id,x,y,w,h,conf), ... ]
def load_mot(path: Path) -> Dict[int, List[Tuple[int,float,float,float,float,float]]]:
    frames: Dict[int, List[Tuple[int,float,float,float,float,float]]] = {}
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw or raw.lstrip().startswith("#"):
            continue
        rec = parse_line(raw)
        if rec is None:
            continue
        f, i, x, y, w, h, c = rec
        frames.setdefault(f, []).append((i, x, y, w, h, c))
    return frames

def iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh
    inter_w = max(0.0, min(ax2, bx2) - max(ax, bx))
    inter_h = max(0.0, min(ay2, by2) - max(ay, by))
    inter = inter_w * inter_h
    if inter <= 0: return 0.0
    union = aw*ah + bw*bh - inter
    if union <= 0: return 0.0
    return inter / union

# preds/gts는 각각 (id,x,y,w,h,conf)의 리스트(단, gts는 conf가 의미 없으므로 1.0일 수 있음)
def match_greedy(preds, gts, thr: float):
    matches = []
    used_p = set()
    used_g = set()
    pairs = []
    for gi, (gid, gx, gy, gw, gh, _gc) in enumerate(gts):
        for pi, (pid, px, py, pw, ph, _pc) in enumerate(preds):
            ov = iou((gx,gy,gw,gh), (px,py,pw,ph))
            if ov >= thr:
                pairs.append((ov, gi, pi))
    pairs.sort(reverse=True, key=lambda t: t[0])
    for ov, gi, pi in pairs:
        if gi in used_g or pi in used_p:
            continue
        used_g.add(gi); used_p.add(pi)
        matches.append((gts[gi][0], preds[pi][0]))  # (gt_id, pred_id)
    unmatched_g = [gts[i][0] for i in range(len(gts)) if i not in used_g]
    unmatched_p = [preds[i][0] for i in range(len(preds)) if i not in used_p]
    return matches, unmatched_g, unmatched_p

def evaluate_mota(gt_path: Path, pred_path: Path, iou_thr: float, conf_thr: float = 0.0):
    gt_frames = load_mot(gt_path)
    pr_frames = load_mot(pred_path)

    all_frames = sorted(set(gt_frames.keys()) | set(pr_frames.keys()))
    TP = FP = FN = IDSW = 0
    total_gt = 0
    assign = {}   # gt id -> last matched pred id
    idsw_frames = []  # IDSW가 발생한 프레임 인덱스

    for f in all_frames:
        gts = gt_frames.get(f, [])
        prs_all = pr_frames.get(f, [])
        # ★ conf 필터링
        prs = [p for p in prs_all if float(p[5]) >= conf_thr]

        total_gt += len(gts)

        matches, un_g, un_p = match_greedy(prs, gts, iou_thr)
        TP += len(matches)
        FN += len(un_g)
        FP += len(un_p)

        # IDSW 판정
        changed = False
        cur_map = {}
        for (gt_id, pred_id) in matches:
            cur_map[gt_id] = pred_id
            if gt_id in assign and assign[gt_id] != pred_id:
                IDSW += 1
                changed = True
        if changed:
            idsw_frames.append(f)
        assign.update(cur_map)

    mota = 1.0 if total_gt == 0 else (1.0 - (FN + FP + IDSW) / float(total_gt))
    return mota, {"TP": TP, "FP": FP, "FN": FN, "IDSW": IDSW}, idsw_frames

def evaluate_mota_detailed(gt_path: Path, pred_path: Path, iou_thr: float, conf_thr: float = 0.0):
    gt_frames = load_mot(gt_path)
    pr_frames = load_mot(pred_path)

    all_frames = sorted(set(gt_frames.keys()) | set(pr_frames.keys()))
    TP = FP = FN = IDSW = 0
    total_gt = 0
    assign: Dict[int, int] = {}     # gt id -> last matched pred id
    idsw_frames: List[int] = []

    per_frame: List[Dict] = []      # ← 프레임별 요약 저장

    for f in all_frames:
        gts = gt_frames.get(f, [])
        prs_all = pr_frames.get(f, [])
        # conf 필터
        prs = [p for p in prs_all if float(p[5]) >= conf_thr]

        total_gt += len(gts)

        matches, un_g, un_p = match_greedy(prs, gts, iou_thr)
        tp = len(matches)
        fn = len(un_g)
        fp = len(un_p)

        TP += tp; FN += fn; FP += fp

        # IDSW 판정
        changed = False
        cur_map: Dict[int,int] = {}
        for (gt_id, pred_id) in matches:
            cur_map[gt_id] = pred_id
            if gt_id in assign and assign[gt_id] != pred_id:
                IDSW += 1
                changed = True
        if changed:
            idsw_frames.append(f)
        assign.update(cur_map)

        per_frame.append({
            "f": f,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "idsw": changed,
            "gt": len(gts),
            "pred": len(prs),
        })

    mota = 1.0 if total_gt == 0 else (1.0 - (FN + FP + IDSW) / float(total_gt))
    stats = {"TP": TP, "FP": FP, "FN": FN, "IDSW": IDSW, "total_gt": total_gt}
    return mota, stats, idsw_frames, per_frame