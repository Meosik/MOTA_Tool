# MOTA_Tool Copilot Instructions

A local video annotation eval tool with real-time tracker performance metrics (MOTA: Multi-Object Tracking Accuracy).

## Architecture Overview

**Stack**: FastAPI backend (Python) + React/Vite frontend (TypeScript) + Docker Compose orchestration

**Core Flow**:
1. User uploads MOT-format annotation files (GT & predictions) via frontend
2. Backend stores files in `appdata/annotations/` with UUID filenames
3. Frontend displays video with overlaid bounding boxes (GT + predictions)
4. MOTA evaluation computed server-side, sent to frontend in real-time

**Key Boundary**:
- Backend (`127.0.0.1:8000`): Computation, file storage, MOT format parsing
- Frontend (`localhost:5173`): UI, video playback, frame/box visualization
- Shared state: `frameStore` (Zustand) coordinates frame navigation, box display, and edit history

## Essential Developer Workflows

### Local Development (Docker Compose)
```bash
cd MOTA_Tool
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env
docker compose -f infra/docker-compose.yml up --build
```
- Backend reloads on file changes (uvicorn `--reload`)
- Frontend hot-reloads via Vite dev server
- Both services share `appdata/` volume for annotation persistence

### Backend Development (no Docker)
```bash
cd backend
pip install -r requirements.txt
PYTHONUNBUFFERED=1 uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Set `DATA_ROOT` env var to point to local `appdata/` folder if needed.

### Running Tests
```bash
cd backend
pytest app/tests/unit/test_mota.py -v
```
Tests are minimal; use `test_mota.py` as template for new test fixtures.

## Project-Specific Patterns

### MOT File Format
Three-zone parsing in `backend/app/services/mota.py`:
- **Columns**: `frame_id, track_id, x, y, width, height, confidence, -1, -1, -1`
- Normalized to shape: `Dict[frame_id, List[(track_id, x, y, w, h)]]`
- CSV parsing tolerates malformed rows (skipped silently)
- Lines starting with `#` are comments

### MOTA Metric Calculation
Location: `backend/app/services/mota.py::evaluate_mota()`
- **Greedy IoU matching** (configurable threshold, default 0.5)
- **Counts**: TP (true positive), FP (false positive), FN (false negative), IDSW (ID switch)
- **Formula**: `MOTA = 1 - (FN + FP + IDSW) / total_gt_count`
- ID switches detect when same GT track gets assigned different prediction IDs across frames

### API Integration Patterns

**Annotation Upload** (`POST /annotations`):
- Returns `{annotation_id, sha256}` for versioning
- Stored as `appdata/annotations/{uuid}.txt` or `.json`

**Tracks Query** (`GET /tracks?annotation_id={id}&f0={frame}&f1={frame}`):
- Dual-mode: prefers normalized JSON from repo, falls back to MOT txt parsing
- Returns: `{"tracks": [{"id": tid, "frames": [{"f": frame, "bbox": [x,y,w,h], "conf": score}]}]}`
- Frame range filtering done server-side (client sends f0=f1 for single frame)

### Frontend State Management (Zustand Store)

**Location**: `frontend/src/store/frameStore.ts`

**Key State**:
- `frames: Frame[]` – video frames with optional ObjectURLs
- `cur: number` – current frame index
- `gtAnnotationId, predAnnotationId` – uploaded annotation IDs
- `overrides: Map<number, Map<number, Box>>` – user edits (frame → id → modified box)
- `undoStack, redoStack` – edit history

**Critical Pattern**: ObjectURL LRU management
- Max 400 simultaneous `blob:` URLs (memory/decode bottleneck)
- `touchURL()` implements LRU eviction; revoked URLs are garbage-collected
- Lazy generation: URLs created only for visible/nearby frames via `prefetchAround()`

**Cache Windows**:
- `fillCacheWindow(kind, f0, f1)` – batch-fetches boxes for frame range
- Prevents N+1 queries during timeline scrubbing
- Results cached in `gtCache` / `prCache` Map<string, FlatBox[]>

### Environment Configuration

**Backend** (`backend/.env`):
- `DATA_ROOT`: Path to `appdata/` (default: `/app/appdata`)
- `CORS_ORIGINS`: Frontend origin (default: `http://localhost:5173`)

**Frontend** (`.env` or `vite.config.ts`):
- `VITE_API_BASE`: Backend URL (default: `http://127.0.0.1:8000`)

## Integration Points & Dependencies

**Backend Dependencies** (see `backend/requirements.txt`):
- `fastapi`, `uvicorn`: REST API + ASGI server
- `numpy`, `scipy`: Numerical computations (IoU, matrix ops)
- `opencv-python`: Video processing (if used in future)
- `pydantic`: Request/response validation

**Frontend Dependencies** (see `frontend/package.json`):
- `zustand`: Lightweight state management
- `react`, `react-dom`: UI framework
- `tailwindcss`: Utility CSS
- `lucide-react`: Icon library

**Cross-Component Communication**:
1. Frontend uploads annotation file → backend stores UUID
2. Frontend queries `/tracks?annotation_id={uuid}&f0={frame}` → backend parses + returns boxes
3. Frontend applies local edits via `overrides` map (not persisted to backend)
4. Metrics computed server-side; frontend displays via state updates

## Conventions & Notes

- **File paths**: Always use `Path` (pathlib) in Python; avoid `os.path`
- **Error handling**: Endpoint failures return `HTTPException` with 400/500 status; frontend catches via try-catch
- **Naming**: Track IDs are integers; annotation IDs are UUID hexstrings (36 chars, no hyphens)
- **Concurrency**: No explicit async locking; single-threaded ASGI server sufficient for local use
- **Testing**: Minimal unit tests exist; add pytest fixtures in `app/tests/unit/` following `test_mota.py` template

## Troubleshooting

- **CORS errors**: Check `CORS_ORIGINS` env var matches frontend origin
- **404 on `/tracks`**: Verify annotation file exists in `appdata/annotations/{id}.txt`
- **Video playback jank**: Reduce `MAX_URLS` in `frameStore.ts` if memory/decode is bottleneck
- **MOT parse failures**: Lines with <6 columns or invalid floats are silently skipped; check logs
