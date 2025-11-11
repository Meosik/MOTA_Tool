# backend/app/services/mota.py
from pathlib import Path
from typing import List, Dict, Tuple

def parse_line(line: str):
    parts = [p.strip() for p in line.strip().split(",")]
    if len(parts) < 6:
        return None
    try:
        f = int(float(parts[0]))
        i = int(float(parts[1]))
        x = float(parts[2]); y = float(parts[3])
        w = float(parts[4]); h = float(parts[5])
        return (f, i, x, y, w, h)
    except:
        return None

def load_mot(path: Path) -> Dict[int, List[Tuple[int,float,float,float,float]]]:
    frames: Dict[int, List[Tuple[int,float,float,float,float]]] = {}
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw or raw.lstrip().startswith("#"):
            continue
        rec = parse_line(raw)
        if rec is None:
            continue
        f, i, x, y, w, h = rec
        frames.setdefault(f, []).append((i, x, y, w, h))
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

def match_greedy(preds: List[Tuple[int,float,float,float,float]],
                 gts: List[Tuple[int,float,float,float,float]],
                 thr: float):
    matches = []
    used_p = set()
    used_g = set()
    pairs = []
    for gi, (gid, gx, gy, gw, gh) in enumerate(gts):
        for pi, (pid, px, py, pw, ph) in enumerate(preds):
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

def evaluate_mota(gt_path: Path, pred_path: Path, iou_thr: float):
    gt_frames = load_mot(gt_path)
    pr_frames = load_mot(pred_path)

    all_frames = sorted(set(gt_frames.keys()) | set(pr_frames.keys()))
    TP = FP = FN = IDSW = 0
    total_gt = 0
    assign = {}  # gt id -> last matched pred id

    for f in all_frames:
        gts = gt_frames.get(f, [])
        prs = pr_frames.get(f, [])
        total_gt += len(gts)

        matches, un_g, un_p = match_greedy(prs, gts, iou_thr)
        TP += len(matches)
        FN += len(un_g)
        FP += len(un_p)

        for (gt_id, pred_id) in matches:
            if gt_id in assign and assign[gt_id] != pred_id:
                IDSW += 1
            assign[gt_id] = pred_id

    mota = 1.0
    if total_gt > 0:
        mota = 1.0 - (FN + FP + IDSW) / float(total_gt)
    return mota, {"TP": TP, "FP": FP, "FN": FN, "IDSW": IDSW}
