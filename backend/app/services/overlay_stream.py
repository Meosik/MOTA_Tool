def slice_tracks(doc: dict, f0: float, f1: float) -> dict:
    """Return tracks with frames whose frame/time value is in [f0, f1].

    Accepts either per-frame dictionaries containing a 't' (timestamp) key or an 'f' (frame index) key.
    Falls back to 'f' when 't' is absent to avoid KeyError.
    """
    out = []
    for tr in doc.get("tracks", []):
        src_frames = tr.get("frames", [])
        # Robust extraction: prefer 't' else 'f'. Non-numeric values skipped.
        filtered = []
        for fr in src_frames:
            val = fr.get("t")
            if val is None:
                val = fr.get("f")
            try:
                v = float(val)
            except (TypeError, ValueError):
                continue
            if f0 <= v <= f1:
                filtered.append(fr)
        if filtered:
            out.append({"id": tr.get("id"), "category": tr.get("category",""), "frames": filtered})
    return {"tracks": out, "f0": f0, "f1": f1}