# MOTA_Tool Architecture with MAP Mode

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        MOTA_Tool                            │
│                                                              │
│  ┌────────────────┐              ┌────────────────┐        │
│  │   MOTA Mode    │              │    MAP Mode    │        │
│  │  (Original)    │              │  (Integrated)  │        │
│  └────────────────┘              └────────────────┘        │
│         │                                 │                 │
│         └─────────────┬───────────────────┘                │
│                       │                                      │
│              ┌────────▼────────┐                           │
│              │  Mode Context   │                           │
│              └────────┬────────┘                           │
│                       │                                      │
│         ┌─────────────┴─────────────┐                      │
│         │                            │                      │
│    ┌────▼─────┐              ┌──────▼────┐                │
│    │  Studio  │              │  TopBar   │                │
│    └──────────┘              └───────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### MOTA Mode (Unchanged)

```
┌─────────────────────────────────────────────────────────────┐
│                         MOTA Mode                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  LeftPanel   │  │ OverlayCanvas│  │  RightPanel  │     │
│  │              │  │              │  │              │     │
│  │ - Timeline   │  │ - Video      │  │ - Metrics    │     │
│  │ - Frame Nav  │  │ - Boxes      │  │ - Settings   │     │
│  │ - Tracks     │  │ - Overlays   │  │ - Controls   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │              BottomHud                            │      │
│  │  - Playback Controls                              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                              │
│  State: frameStore.ts                                       │
│  Services: mota.py, match.py, gating.py, timeline.py       │
│  APIs: /tracks, /realtime, /analysis                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### MAP Mode (New)

```
┌─────────────────────────────────────────────────────────────┐
│                          MAP Mode                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │MapImageSidebar│  │ MapImageCanvas│  │MapControlPanel│   │
│  │              │  │              │  │              │     │
│  │ - Upload     │  │ - Interactive│  │ - Upload     │     │
│  │ - Image List │  │   Canvas     │  │   GT/Pred    │     │
│  │ - Search     │  │ - Drag/Resize│  │ - Thresholds │     │
│  │              │  │ - Zoom/Pan   │  │ - mAP        │     │
│  │              │  │              │  │ - Per-class  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  State: mapStore.ts                                         │
│  Services: map.py, coco_loader.py                           │
│  APIs: /map/calculate, /images, /annotations               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Backend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │   MOTA Services      │    │   MAP Services       │      │
│  ├──────────────────────┤    ├──────────────────────┤      │
│  │ - mota.py            │    │ - map.py             │      │
│  │ - match.py           │    │ - coco_loader.py     │      │
│  │ - gating.py          │    │                      │      │
│  │ - timeline.py        │    │                      │      │
│  │ - overlay_stream.py  │    │                      │      │
│  │ - motacache.py       │    │                      │      │
│  └──────────────────────┘    └──────────────────────┘      │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │   MOTA APIs          │    │   MAP APIs           │      │
│  ├──────────────────────┤    ├──────────────────────┤      │
│  │ - /tracks            │    │ - /map/calculate     │      │
│  │ - /realtime          │    │ - /images/*          │      │
│  │ - /analysis          │    │ - /annotations/*     │      │
│  │ - /export            │    │                      │      │
│  └──────────────────────┘    └──────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────┐        │
│  │           Shared Infrastructure                 │        │
│  ├────────────────────────────────────────────────┤        │
│  │ - Settings & Config                             │        │
│  │ - CORS Middleware                               │        │
│  │ - File Storage (appdata/)                       │        │
│  └────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React/Vite Frontend                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────┐        │
│  │                  main.tsx                       │        │
│  │  ┌──────────────────────────────────────────┐  │        │
│  │  │         ModeProvider                      │  │        │
│  │  │  ┌────────────────────────────────────┐  │  │        │
│  │  │  │        Studio.tsx                   │  │  │        │
│  │  │  │                                     │  │  │        │
│  │  │  │  if (mode === 'MOTA')               │  │  │        │
│  │  │  │    ▼                                │  │  │        │
│  │  │  │  ┌─────────────────────────┐       │  │  │        │
│  │  │  │  │      AppLayout          │       │  │  │        │
│  │  │  │  │   (MOTA Mode UI)        │       │  │  │        │
│  │  │  │  └─────────────────────────┘       │  │  │        │
│  │  │  │                                     │  │  │        │
│  │  │  │  if (mode === 'MAP')                │  │  │        │
│  │  │  │    ▼                                │  │  │        │
│  │  │  │  ┌─────────────────────────┐       │  │  │        │
│  │  │  │  │  MapProvider            │       │  │  │        │
│  │  │  │  │  ┌───────────────────┐  │       │  │  │        │
│  │  │  │  │  │    MapPage        │  │       │  │  │        │
│  │  │  │  │  │  (MAP Mode UI)    │  │       │  │  │        │
│  │  │  │  │  └───────────────────┘  │       │  │  │        │
│  │  │  │  └─────────────────────────┘       │  │  │        │
│  │  │  │                                     │  │  │        │
│  │  │  └────────────────────────────────────┘  │  │        │
│  │  └──────────────────────────────────────────┘  │        │
│  └────────────────────────────────────────────────┘        │
│                                                              │
│  ┌──────────────────┐       ┌──────────────────┐          │
│  │  MOTA State      │       │  MAP State       │          │
│  ├──────────────────┤       ├──────────────────┤          │
│  │ - frameStore     │       │ - mapStore       │          │
│  │ - frames         │       │ - gtAnnotations  │          │
│  │ - tracks         │       │ - predAnnotations│          │
│  │ - overlays       │       │ - editHistory    │          │
│  └──────────────────┘       └──────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### MOTA Mode Data Flow
```
User Action
    │
    ▼
frameStore (Zustand)
    │
    ├─► Video Frame Update
    │       │
    │       ▼
    │   OverlayCanvas
    │       │
    │       ▼
    │   Render Boxes & Tracks
    │
    └─► API Call
            │
            ▼
        Backend (/tracks, /analysis)
            │
            ▼
        MOTA Services
            │
            ▼
        Return Metrics/Data
```

### MAP Mode Data Flow
```
User Action (Upload)
    │
    ▼
mapStore (Zustand)
    │
    ├─► File Upload
    │       │
    │       ▼
    │   API (/images/folder, /annotations)
    │       │
    │       ▼
    │   Backend Storage
    │
    ├─► Threshold Change
    │       │
    │       ▼
    │   API (/map/calculate)
    │       │
    │       ▼
    │   MAP Services (calculate_map)
    │       │
    │       ▼
    │   Return mAP & Per-Class AP
    │
    └─► Annotation Edit
            │
            ▼
        InteractiveCanvas
            │
            ├─► Drag/Resize
            │       │
            │       ▼
            │   Update Local State
            │       │
            │       ▼
            │   Push to History
            │
            └─► Export
                    │
                    ▼
                Download COCO JSON
```

## File Format Support

### MOTA Mode
- **Input**: MOT format (.txt)
- **Output**: MOT format (.txt)

### MAP Mode
- **Input**: COCO format (.json)
- **Output**: COCO format (.json)
- **Fallback**: MOT format (.txt) for backward compatibility

## State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    State Separation                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │  MOTA frameStore     │    │  MAP mapStore        │      │
│  ├──────────────────────┤    ├──────────────────────┤      │
│  │ - frames: Frame[]    │    │ - gtAnnotations[]    │      │
│  │ - cur: number        │    │ - predAnnotations[]  │      │
│  │ - gtAnnotationId     │    │ - editHistory[]      │      │
│  │ - predAnnotationId   │    │ - historyIndex       │      │
│  │ - overrides: Map     │    │                      │      │
│  │ - undoStack[]        │    │ Methods:             │      │
│  │ - redoStack[]        │    │ - setGT()            │      │
│  │                      │    │ - setPred()          │      │
│  │ Methods:             │    │ - updateAnnotation() │      │
│  │ - loadVideo()        │    │ - undo()             │      │
│  │ - updateBox()        │    │ - redo()             │      │
│  │ - undo()             │    │ - exportMapPred()    │      │
│  │ - redo()             │    │                      │      │
│  └──────────────────────┘    └──────────────────────┘      │
│                                                              │
│         ▲                              ▲                     │
│         │                              │                     │
│    Independent                    Independent               │
│    No Cross-Dependency                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### MOTA Endpoints (Unchanged)
- `POST /annotations` - Upload MOT file
- `GET /tracks` - Get tracks for frame range
- `GET /realtime` - WebSocket for real-time updates
- `GET /analysis/*` - MOTA metrics and analysis

### MAP Endpoints (New/Enhanced)
- `GET /map/calculate` - Calculate mAP with thresholds
- `POST /images/folder` - Upload image folder
- `GET /images/{folder_id}` - List images
- `GET /images/{folder_id}/{image_id}` - Get image
- `PATCH /annotations/{id}` - Update annotations
- `POST /annotations/{id}/export` - Export annotations

### Shared Endpoints
- `POST /annotations` - Upload annotation (supports both formats)
- `GET /annotations/{id}` - Retrieve annotation

## Key Design Decisions

1. **Mode Separation**: Complete isolation between MOTA and MAP
   - Separate components
   - Separate state stores
   - Separate API endpoints (where possible)

2. **Reuse Infrastructure**: Leverage existing patterns
   - Same file storage (appdata/)
   - Same FastAPI structure
   - Same React/Zustand patterns

3. **Format Support**: Primary COCO, fallback MOT
   - MAP mode prefers COCO JSON
   - Backward compatible with MOT txt
   - Automatic format detection

4. **Interactive Editing**: Canvas-based for performance
   - HTML5 Canvas rendering
   - Efficient bbox manipulation
   - Smooth zoom/pan

5. **Metrics Calculation**: Server-side for accuracy
   - Python numpy for precision
   - Configurable thresholds
   - Per-class breakdown

## Deployment

### Development
```bash
# Backend
cd backend
uvicorn app.main:app --reload

# Frontend
cd frontend
npm run dev
```

### Production
```bash
# Build frontend
cd frontend
npm run build

# Serve with Docker Compose
cd infra
docker-compose up
```

## Summary

The architecture maintains clean separation between MOTA and MAP modes while sharing common infrastructure. Each mode operates independently with its own components, state, and services, ensuring zero impact between modes and easy maintenance.
