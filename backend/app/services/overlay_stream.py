def slice_tracks(doc: dict, t0: float, t1: float) -> dict:
    # Return tracks with frames in [t0, t1]
    out = []
    for tr in doc.get("tracks", []):
        frames = [fr for fr in tr.get("frames", []) if t0 <= float(fr["t"]) <= t1]
        if frames:
            out.append({"id": tr["id"], "category": tr.get("category",""), "frames": frames})
    return {"tracks": out, "t0": t0, "t1": t1}