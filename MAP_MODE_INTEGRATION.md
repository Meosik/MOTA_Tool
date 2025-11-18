# MAP Mode Integration

This document describes the integration of MAP (Mean Average Precision) mode features from the Capstone_Team_MAP repository into the MOTA_Tool architecture.

## Overview

MAP mode has been added to MOTA_Tool as a separate mode alongside the existing MOTA mode. Users can switch between modes using the mode selector in the top bar.

## Architecture

### Backend

#### New Services
- **`app/services/coco_loader.py`**: Handles loading and parsing COCO format annotation files
  - `load_coco_annotations()`: Load GT annotations with images and categories
  - `load_predictions()`: Load prediction annotations
  - `save_coco_predictions()`: Export predictions in COCO format

- **`app/services/map.py`**: Enhanced mAP calculation
  - `calculate_iou()`: IoU calculation for bounding boxes
  - `get_pr_arrays()`: Calculate precision-recall arrays per category
  - `calculate_map()`: Calculate mAP with per-class AP and PR curves
  - `evaluate_map()`: Legacy compatibility function

#### Enhanced APIs
- **`app/api/map_metrics.py`**: 
  - `GET /map/calculate`: Calculate mAP metrics with confidence and IoU thresholds
  - Supports both COCO JSON and MOT txt formats
  - Returns per-class AP and PR curve data

- **`app/api/images.py`**:
  - `POST /images/folder`: Upload image folder
  - `GET /images/{folder_id}`: List images in folder
  - `GET /images/{folder_id}/{image_id}`: Get specific image

- **`app/api/annotations.py`**:
  - Enhanced to support both .txt and .json formats
  - `GET /annotations/{id}`: Retrieve annotation file
  - `PATCH /annotations/{id}`: Update annotations
  - `POST /annotations/{id}/export`: Export annotations

### Frontend

#### New Components
- **`InteractiveCanvas.tsx`**: Interactive canvas with bbox editing
  - Drag to move bounding boxes
  - Resize handles for adjusting bbox size
  - Zoom in/out with mouse wheel
  - Visual feedback for selected annotations
  - Category-based coloring

- **`MapImageList.tsx`**: Image browser with search
  - Display images from uploaded folder
  - Search/filter functionality
  - Thumbnail view (placeholder for now)

#### Enhanced Components
- **`MapImageCanvas.tsx`**: 
  - Support for interactive and simple modes
  - Integration with InteractiveCanvas
  - Fallback to SVG overlay for simple display

- **`MapControlPanel.tsx`**:
  - Upload GT and Prediction buttons
  - Confidence and IoU threshold sliders
  - Per-class AP display
  - Dataset statistics (categories, images)
  - Export functionality

- **`MapPage.tsx`**:
  - State management for folder, GT, and prediction IDs
  - Integration of all MAP components
  - Keyboard shortcuts for undo/redo

#### Store
- **`mapStore.ts`**:
  - Undo/redo history with edit tracking
  - GT and prediction annotation management
  - File upload helpers (folder, GT, predictions)
  - Export functionality (COCO format)

## Features

### Core Functionality
1. **Image Management**
   - Upload folders of images
   - Browse images with search
   - Display images with annotations

2. **Annotation Management**
   - Load GT annotations (COCO format)
   - Load prediction annotations (COCO format)
   - Interactive editing of predictions
   - Undo/redo support

3. **Metrics Calculation**
   - mAP calculation with IoU threshold
   - Confidence threshold filtering
   - Per-class Average Precision
   - Support for multiple categories

4. **Interactive Editing**
   - Drag bounding boxes
   - Resize bounding boxes
   - Visual selection feedback
   - Zoom and pan canvas

5. **Export**
   - Export edited predictions in COCO format
   - Download as JSON file

## Usage

### Switching Modes
1. Use the mode selector in the top bar
2. Select "MAP" to enter MAP mode
3. Select "MOTA" to return to MOTA mode

### MAP Mode Workflow
1. **Upload Images**: Click "Upload Folder" in the sidebar to upload a folder of images
2. **Upload GT**: Click "Upload GT" in the control panel to upload ground truth annotations
3. **Upload Predictions**: Click "Upload Predictions" to upload model predictions
4. **Adjust Thresholds**: Use sliders to adjust confidence and IoU thresholds
5. **View Metrics**: mAP and per-class AP are calculated and displayed
6. **Edit Annotations** (optional): Click and drag prediction boxes to edit
7. **Export**: Click "Export Predictions" to download edited predictions

## File Formats

### COCO Format (JSON)
Ground truth and predictions should follow COCO format:

```json
{
  "images": [
    {"id": 1, "file_name": "image1.jpg", "width": 640, "height": 480}
  ],
  "annotations": [
    {"id": 1, "image_id": 1, "category_id": 1, "bbox": [x, y, w, h], ...}
  ],
  "categories": [
    {"id": 1, "name": "person"}
  ]
}
```

For predictions, each annotation should include a "score" field:
```json
[
  {"image_id": 1, "category_id": 1, "bbox": [x, y, w, h], "score": 0.95}
]
```

### MOT Format (TXT)
Legacy support for MOT format is maintained for backward compatibility.

## MOTA Mode Compatibility

All existing MOTA mode functionality remains unchanged. The MAP mode operates independently with:
- Separate components
- Separate state management
- Separate API endpoints
- No impact on MOTA calculations or UI

## Technical Notes

### Category Management
- Categories are loaded from COCO annotations
- Each category can have a unique color
- Visibility can be toggled per category (planned feature)

### Performance
- Interactive canvas uses HTML5 Canvas for efficient rendering
- Image list supports lazy loading (can be enhanced)
- Metrics calculation is performed server-side

### Future Enhancements
- Thumbnail generation for image list
- Category visibility toggles
- PR curve visualization
- Batch annotation editing
- Multiple IoU threshold evaluation (COCO-style)

## Testing

To test MAP mode:
1. Build frontend: `cd frontend && npm run build`
2. Start backend: `cd backend && uvicorn app.main:app --reload`
3. Access UI and switch to MAP mode
4. Upload test images and annotations
5. Verify metrics calculation
6. Test interactive editing features

## References

- Original MAP features: https://github.com/mx34kryce/Capstone_Team_MAP
- COCO format: https://cocodataset.org/#format-data
- MOTA_Tool base: Current repository
