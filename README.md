<div align="center">

# Tracker Evaluation Toolkit

Local, privacy-preserving evaluation for object detection (mAP) and multi-object tracking (MOTA). No cloud uploads; everything runs on your machine.


## Quick Start

### A. Development/Test Environment (Local Build)

1. Clone the repository
  ```bash
  git clone https://github.com/Meosik/MOTA_Tool.git
  cd MOTA_Tool
  ```

2. Prepare environment variable files  
  (Copy example files and edit values as needed)
  ```bash
  # Windows
  copy infra\env\backend.local.env backend\.env
  copy infra\env\frontend.local.env frontend\.env

  # Linux/Mac
  cp infra/env/backend.local.env backend/.env
  cp infra/env/frontend.local.env frontend/.env
  ```

3. Build and run all services with Docker Compose
  ```bash
  docker compose -f infra/docker-compose.yml up --build
  ```
  - Frontend: http://localhost:5173
  - Backend (OpenAPI): http://127.0.0.1:8000/docs

4. Stop services
  ```bash
  docker compose -f infra/docker-compose.yml down
  ```

- **Data/results are stored in the `appdata/` folder** (persisted across container restarts/rebuilds)
- **If no .env file is present, defaults are used** (but you may need to set CORS and other options explicitly)

### B. Production/Deployment (Prebuilt Images)

- Use prebuilt image bundles (tar) or pull from GHCR/container registry
- See below for details: “Portable Bundle” or “Container Registry Publishing”

---

**Additional Notes**
- If using a tar bundle tracked by Git LFS, always run `git lfs install` and `git lfs pull` before use
- Edit environment variable files for your actual deployment environment
- Both Windows and Linux/Mac commands are shown for clarity

</div>

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Modes](#modes)
4. [Annotation File Formats](#annotation-file-formats)
5. [UI & Buttons](#ui--buttons)
6. [Workflows](#workflows)
7. [Editing & Export Semantics](#editing--export-semantics)
8. [Environment & Configuration](#environment--configuration)
9. [Installation & Development](#installation--development)
10. [Deployment Scenarios](#deployment-scenarios)
10. [Performance Characteristics](#performance-characteristics)
11. [Troubleshooting](#troubleshooting)
12. [FAQ](#faq)

## Overview
The app provides two focused evaluation surfaces:
- **MOTA Mode**: Multi-Object Tracking metrics over sequential frames (tracking quality, ID switches, false positives/negatives).
- **MAP Mode**: COCO-style Mean Average Precision computation with per-class PR curves and interactive editing.

All ground-truth (GT) and prediction annotation files are stored locally under `appdata/annotations/` using UUID filenames for isolation.

## Architecture
| Layer | Tech | Responsibilities |
|-------|------|------------------|
| Frontend | React + Vite + Zustand | Rendering, state management, interactive editing, zoom/pan, annotation visibility, snapshotting mAP inputs. |
| Backend | FastAPI | Annotation ingestion, normalization, MOTA/mAP calculation, MOT/COCO parsing, hashing & storage. |
| Shared Volume | `appdata/` | Persistent annotation storage + caches when running via Docker Compose. |

Key backend endpoints:
- `POST /annotations` – Upload MOT TXT or COCO JSON (GT or Pred). Returns `{ annotation_id, sha256 }`.
- `GET /tracks?annotation_id=...&f0=...&f1=...` – Frame range normalized track boxes.
- (MAP) metrics endpoint (internal hook) for dataset mAP snapshot.

## Modes
### MOTA Mode
Focus: Tracking consistency over time.
Features:
- Frame timeline navigation
- ID switch detection
- TP/FP classification by IoU threshold (used for coloring, not export filtering)
- Undo/redo of per-frame ID edits & geometry overrides
- Progressive track prefetch for smooth scrubbing

### MAP Mode
Focus: Static object detection quality across images.
Features:
- Per-class AP and overall mAP (snapshot-based)
- Precision-Recall curve with COCO envelope interpolation
- Confidence threshold filters visibility & metrics (IoU threshold for TP/FP classification only)
- Category name normalization (COCO names instead of numeric IDs)
- Interactive box resizing and category reassignment

## Annotation File Formats
### MOT (TXT)
Each line (comments starting with `#` skipped):
```
frame_id,track_id,x,y,width,height,confidence,-1,-1,-1
```
Rules:
- Missing or malformed numeric fields are ignored.
- `confidence` is optional; default fallback is 1.0.
- Coordinates are pixel units (top-left origin).

### COCO (JSON)
Essential keys:
```jsonc
{
  "images": [ { "id": 1, "file_name": "0001.jpg", "width": 1280, "height": 720 }, ... ],
  "annotations": [ { "id": 10, "image_id": 1, "category_id": 1, "bbox": [x,y,w,h], "score": 0.92 }, ... ],
  "categories": [ { "id": 1, "name": "person" }, ... ]
}
```
Notes:
- Prediction JSON may include `score`; GT usually omits it.
- `bbox` format is `[x, y, width, height]`.
- Category names are surfaced in UI via mapping; unknown IDs fall back to `Category <id>`.

## UI & Buttons
### Top Bar
| Element | MAP Mode Label | MOTA Mode Label | Purpose |
|---------|----------------|-----------------|---------|
| Mode Select | MAP/MOTA | MAP/MOTA | Switch evaluation context. |
| Upload Images / COCO | Upload Images/COCO | Open Frame Folder | Select image folder (MAP) or frame folder (MOTA). |
| Load GT | Load GT | Load GT | Upload GT annotations (MOT or COCO). |
| Load Pred | Load Pred | Load Pred | Upload prediction annotations. |
| Overall mAP | Overall mAP | (hidden) | Compute dataset snapshot metrics (MAP). |
| Undo / Redo | Undo / Redo | Undo / Redo | Revert or reapply edits (IDs / geometry / categories). |
| Reset Frame | Reset Frame | Reset Frame | Clear overrides for current frame. |
| Export | Export results | Export with edits | Download predictions with applied edits & confidence filter. |

### Canvas (MAP InteractiveCanvas / MOTA OverlayCanvas)
- Zoom: Mouse wheel (center-based zoom for MAP).
- Pan: Drag empty space (MAP); tracking canvas auto-centers (MOTA).
- Edit Geometry: Drag box or resize handles (MAP & MOTA pred boxes).
- Change Category (MAP): Double-click prediction box → input COCO category name.
- Change ID (MOTA): Double-click ID label overlay → assign new ID (auto-resolves conflicts).
- Visibility: Checkboxes/radios control rendered categories (MAP); instance visibility stored in Zustand.

### Legends
Color coding unified across modes:
- GT: Green
- TP: Orange
- FP: Magenta/Red
- IDSW (MOTA only): Purple

## Workflows
### 1. MOTA Evaluation
```text
Open Frame Folder → Load GT → Load Pred → Adjust IoU slider → Scrub frames → Edit IDs if needed → Export
```
Key Points:
- IoU threshold only affects TP/FP coloring & IDSW logic, not export filtering.
- Export preserves edited geometry & IDs.

### 2. MAP Evaluation
```text
Upload Images/COCO → Load GT JSON → Load Pred JSON → Set confidence threshold → (Optional) edit boxes/categories → Compute Overall mAP → Inspect per-class PR curves → Export filtered predictions
```
Key Points:
- Overall mAP uses a snapshot of GT/Pred & thresholds at button click; later slider changes do not retroactively alter that snapshot.
- Confidence threshold hides low-score predictions and filters export.

### 3. Editing & Re-Exporting Predictions
1. Select frame/image.
2. Resize or move a prediction box; undo/redo available.
3. For MAP: double-click box to change category by name (validated against COCO list).
4. For MOTA: change track ID (conflicts auto-resolved to next free ID). 
5. Click Export to download:
   - MAP mode: COCO JSON (confidence ≥ current threshold; IoU ignored).
   - MOTA mode: MOT TXT with overrides applied (confidence threshold applied if implemented in exportModifiedPred; IoU ignored).

## Editing & Export Semantics
| Aspect | MAP Mode | MOTA Mode |
|--------|---------|-----------|
| Snapshot Metrics | Overall mAP fixed after compute | N/A |
| Confidence Filter | Applied to visibility & export | Applied to export (not TP/FP coloring) |
| IoU Threshold | Classifies TP/FP only | Classifies TP/FP & IDSW only |
| Geometry Edits | Persist in in-memory predictions | Persist per-frame overrides |
| ID Changes | Category reassign only | Track ID renumbering |
| Export Format | COCO JSON | MOT TXT |

## Environment & Configuration
### Backend `.env`
| Var | Default | Description |
|-----|---------|-------------|
| `DATA_ROOT` | `/app/appdata` | Annotation storage root. |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origin. |

### Frontend `.env`
| Var | Default | Description |
|-----|---------|-------------|
| `VITE_API_BASE` | `http://127.0.0.1:8000` | Backend base URL. |

## Installation & Development
### Docker Compose (Recommended Dev)
```bash
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env
docker compose -f infra/docker-compose.yml up --build
# Frontend: http://localhost:5173
# Backend:  http://127.0.0.1:8000/docs
```

### Backend Only (Local Python)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend Only
```bash
cd frontend
npm install
npm run dev
```

## Deployment Scenarios
Three common ways to use/distribute this toolkit:

### 1. Quick Start (Docker Compose)
Use the existing repository layout directly.
```bash
git clone https://github.com/Meosik/MOTA_Tool.git
cd MOTA_Tool
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env
docker compose -f infra/docker-compose.yml up --build
```
Access:
- Frontend: `http://localhost:5173`
- Backend Docs: `http://127.0.0.1:8000/docs`

Persisted annotation data lives in `appdata/` (volume mounted automatically). Stop with:
```bash
docker compose -f infra/docker-compose.yml down
```

### 2. Portable Bundle (Prebuilt Images)
When you want to hand over runnable images without requiring a fresh build:
1. Build locally (or via CI) to produce `infra-backend:latest` & `infra-frontend:latest`.
2. Export bundle:
```bash
docker save -o mota_tool_bundle_20251125.tar infra-backend:latest infra-frontend:latest
```
3. Distribute: send `mota_tool_bundle_20251125.tar` + `deploy/docker-compose.yml` + `deploy/*.env.example`.
4. On target machine:
```bash
docker load -i mota_tool_bundle_20251125.tar
cd deploy
copy backend.env.example backend.env
copy frontend.env.example frontend.env
docker compose up -d
```
5. Update env values if backend/host differs (e.g., server IP vs localhost).

To regenerate the bundle after edits, repeat build + save steps. This mode avoids recipient needing Node/Python toolchains.

#### Using a Git LFS-Tracked Bundle
If the tar bundle (e.g. `mota_tool_bundle_20251125.tar`) is committed via Git LFS instead of distributed manually:
```bash
git clone https://github.com/Meosik/MOTA_Tool.git
cd MOTA_Tool
git lfs install       # one-time
git lfs pull          # fetch large LFS objects (tar file)
docker load -i mota_tool_bundle_20251125.tar
cd deploy
copy backend.env.example backend.env
copy frontend.env.example frontend.env
docker compose up -d
```
Notes:
- LFS bandwidth quotas apply (consider GitHub Releases for very large/rarely changing bundles).
- Update the tar by regenerating locally (`docker save ...`) then recommitting (staging after `.gitattributes` changes so LFS pointer is preserved).
- Consumers ONLY need Docker + Git LFS; no build toolchains required.

### 3. Local Development (Node + Python Without Docker)
Backend:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
set DATA_ROOT=..\appdata
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Frontend (in separate terminal):
```bash
cd frontend
npm install
set VITE_API_BASE=http://127.0.0.1:8000
npm run dev
```
Open `http://localhost:5173`.

Optional improvements:
- Use `npm run build` for production static files.
- Serve built frontend via Nginx or a CDN pointing to built `dist/`.
- Adjust `CORS_ORIGINS` in backend `.env` for non-local hostnames.

### GitHub Actions (Container Registry Publishing)
Included workflow: `.github/workflows/docker-build.yml`
It builds backend & frontend images and pushes to GHCR on each push to `main` or `feature/map_table`.

After first successful run, images are available at:
- `ghcr.io/<owner>/<repo>-backend:latest`
- `ghcr.io/<owner>/<repo>-frontend:latest`

You can then simplify deployment Compose file to reference these registry images directly (no local build required).

### Deploy Directory
`deploy/` contains:
- `docker-compose.yml` (minimal runtime compose)
- `backend.env.example`, `frontend.env.example` (placeholders)

Copy examples to real `.env` files, then run `docker compose up -d` inside `deploy/`.

## Performance Characteristics
- Offscreen canvas + requestAnimationFrame batching removes flicker on slider changes.
- ObjectURL LRU caches up to 150 images for memory stability.
- Incremental dataset metric calculation prevents long UI freezes (yields to event loop between classes).
- Snapshot model for overall mAP avoids recomputation storms.

## Troubleshooting
| Issue | Check |
|-------|-------|
| CORS errors | Ensure `CORS_ORIGINS` matches frontend origin. |
| Missing predictions on export | Verify confidence threshold not too high. |
| 404 on `/tracks` | File exists under `appdata/annotations/` with returned UUID? |
| Stale mAP after edits | Recompute Overall mAP (snapshot is immutable). |
| Canvas ghosting | Ensure build includes latest offscreen copy patch. |

## FAQ
**Q: Does IoU threshold hide predictions?**  
A: No. It only classifies TP vs FP (and ID switches); low-IoU predictions remain visible unless filtered by confidence.

**Q: Are edits persisted to disk?**  
A: Only exported files contain edits; internal state is in-memory until you export.

**Q: Can I evaluate multiple prediction files at once?**  
A: Not simultaneously; load one GT and one prediction set per session. Re-upload for comparisons.

**Q: Why is overall mAP not changing after slider move?**  
A: It is snapshot-based. Re-run the Overall mAP button to capture new thresholds.

## License / Usage
This project is released under the MIT License. See `LICENSE` file for full text.

Attribution:
- COCO dataset annotations (e.g. `instances_val2017.json`) are © their respective contributors and provided under CC BY 4.0. If you redistribute dataset excerpts, include appropriate attribution: "COCO dataset (http://cocodataset.org) – CC BY 4.0".

Summary of rights (non-binding): MIT allows commercial & academic use, modification, distribution, and private use with minimal obligations (retain copyright & permission notice). Software is provided AS IS without warranty.

If you integrate GPL/AGPL code later, reassess license compatibility before release.

---
Enjoy fast local model evaluation and iterative box editing!
