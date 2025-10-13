def iou(a,b):
    ax1, ay1, ax2, ay2 = a[0],a[1],a[0]+a[2],a[1]+a[3]
    bx1, by1, bx2, by2 = b[0],b[1],b[0]+b[2],b[1]+b[3]
    iw = max(0, min(ax2,bx2)-max(ax1,bx1))
    ih = max(0, min(ay2,by2)-max(ay1,by1))
    inter = iw*ih
    union = a[2]*a[3]+b[2]*b[3]-inter
    return inter/union if union>0 else 0.0