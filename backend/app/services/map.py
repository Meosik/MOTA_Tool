from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np

def voc_ap(rec, prec):
    """Compute VOC AP given precision and recall."""
    rec = np.concatenate(([0.], rec, [1.]))
    prec = np.concatenate(([0.], prec, [0.]))
    for i in range(prec.size - 1, 0, -1):
        prec[i - 1] = np.maximum(prec[i - 1], prec[i])
    i = np.where(rec[1:] != rec[:-1])[0]
    ap = np.sum((rec[i + 1] - rec[i]) * prec[i + 1])
    return ap

def evaluate_map(gt_boxes: List[Dict], pred_boxes: List[Dict], iou_thr: float = 0.5):
    """
    gt_boxes: [{image_id, category, bbox}]
    pred_boxes: [{image_id, category, bbox, score}]
    """
    from collections import defaultdict
    aps = []
    categories = set([g['category'] for g in gt_boxes])
    for cat in categories:
        gt_cat = [g for g in gt_boxes if g['category'] == cat]
        pred_cat = [p for p in pred_boxes if p['category'] == cat]
        gt_by_img = defaultdict(list)
        for g in gt_cat:
            gt_by_img[g['image_id']].append(g['bbox'])
        npos = len(gt_cat)
        pred_cat = sorted(pred_cat, key=lambda x: -x['score'])
        tp = np.zeros(len(pred_cat))
        fp = np.zeros(len(pred_cat))
        detected = {img: np.zeros(len(gt_by_img[img])) for img in gt_by_img}
        for i, p in enumerate(pred_cat):
            img = p['image_id']
            bb = p['bbox']
            ovmax = -np.inf
            jmax = -1
            if img in gt_by_img:
                for j, gtb in enumerate(gt_by_img[img]):
                    ixmin = max(bb[0], gtb[0])
                    iymin = max(bb[1], gtb[1])
                    ixmax = min(bb[0]+bb[2], gtb[0]+gtb[2])
                    iymax = min(bb[1]+bb[3], gtb[1]+gtb[3])
                    iw = max(ixmax - ixmin, 0.)
                    ih = max(iymax - iymin, 0.)
                    inters = iw * ih
                    uni = bb[2]*bb[3] + gtb[2]*gtb[3] - inters
                    iou = inters / uni if uni > 0 else 0
                    if iou > ovmax:
                        ovmax = iou
                        jmax = j
            if ovmax >= iou_thr:
                if detected[img][jmax] == 0:
                    tp[i] = 1
                    detected[img][jmax] = 1
                else:
                    fp[i] = 1
            else:
                fp[i] = 1
        fp = np.cumsum(fp)
        tp = np.cumsum(tp)
        rec = tp / float(npos) if npos > 0 else np.zeros_like(tp)
        prec = tp / np.maximum(tp + fp, np.finfo(np.float64).eps)
        ap = voc_ap(rec, prec)
        aps.append(ap)
    mAP = np.mean(aps) if aps else 0.0
    return mAP, {'APs': aps, 'categories': list(categories)}
