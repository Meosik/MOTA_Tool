import os, json

def normalize_annotation(src_path: str) -> dict:
    # Minimal passthrough: if JSON with 'tracks' keep it, else return skeleton.
    try:
        if src_path.endswith(".json"):
            with open(src_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # naive sanity
            if "tracks" in data and "video" in data:
                return data
    except Exception:
        pass
    # Fallback skeleton
    return {
        "video":{"id":"unknown","fps":30,"width":1920,"height":1080},
        "categories":[],
        "tracks":[]
    }