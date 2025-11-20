# MAP Mode Performance and Export Improvements

## Overview
This document describes the improvements made to the MAP mode functionality to address performance issues and ensure correct export behavior.

## Changes Made

### 1. Export Functionality Fix
**Problem**: The export button in MAP mode was using `exportMapPred` which exported all predictions without applying thresholds.

**Solution**: 
- Updated `TopBar.tsx` to use `exportFilteredPred` instead of `exportMapPred` for MAP mode
- `exportFilteredPred` applies both confidence and IoU thresholds before export
- All bbox and category modifications are automatically included since they're stored in the state

**Files Modified**:
- `frontend/src/components/TopBar.tsx`

### 2. Manual Overall mAP Calculation
**Problem**: The control panel was slow because it automatically recalculated overall mAP on every threshold change.

**Solution**:
- Added a "Calculate Overall mAP" button in MapControlPanel
- Modified `useMapMetrics` hook to accept an `enabled` parameter for manual triggering
- Overall mAP is now calculated only when the button is clicked
- Current image mAP is still calculated automatically for real-time feedback

**Files Modified**:
- `frontend/src/hooks/mapApi.ts` - Added `enabled` parameter to `useMapMetrics`
- `frontend/src/components/map/MapControlPanel.tsx` - Added button and manual trigger logic

### 3. Threshold Application Optimization
**Problem**: Applying IoU threshold to current image display was causing performance issues.

**Solution**:
- **Current Image Display**: Only confidence threshold is applied
  - InteractiveCanvas: Shows all predictions above confidence threshold
  - MapControlPanel current image stats: Uses confidence threshold only
- **Export and Overall mAP**: Both confidence and IoU thresholds are applied
  - exportFilteredPred: Filters by both thresholds
  - Backend mAP calculation: Uses both thresholds

**Design Rationale**:
- IoU threshold requires comparing predictions against GT boxes, which is computationally expensive
- For interactive editing, users need to see all potential predictions to make informed decisions
- Filtering by IoU is deferred until final export or overall mAP calculation
- This significantly improves UI responsiveness when adjusting thresholds

**Files Modified**:
- `frontend/src/components/map/InteractiveCanvas.tsx` - Removed IoU filtering from canvas rendering
- `frontend/src/components/map/MapControlPanel.tsx` - Removed IoU filtering from current image stats

## Usage

### Export with Thresholds
1. Adjust IoU and Confidence thresholds in the control panel
2. Make any bbox or category edits needed
3. Click "내보내기" (Export) button in the top bar
4. Exported file will include:
   - All bbox modifications
   - All category changes
   - Only predictions passing confidence threshold
   - Only predictions with IoU ≥ threshold with at least one GT box

### Calculate Overall mAP
1. Upload GT and Prediction annotations
2. Adjust IoU and Confidence thresholds as needed
3. Click "Calculate Overall mAP" button in the control panel
4. Backend will calculate mAP across all images using both thresholds

### Current Image View
- Shows all predictions above confidence threshold (regardless of IoU)
- Allows editing of bboxes and categories
- Displays current image mAP for quick feedback
- Updates instantly when threshold changes

## Technical Details

### State Management
- All modifications stored in `mapStore.predAnnotations`
- Thresholds stored in `mapStore.iou` and `mapStore.conf`
- Export reads directly from current state
- No separate storage needed for modifications

### Performance Improvements
- Eliminated automatic backend API calls on threshold changes
- Reduced filtering complexity for current image display
- Only IoU filtering happens during export (O(n) operation once)
- Improved UI responsiveness significantly

### Backward Compatibility
- MOTA mode unchanged
- All existing functionality preserved
- Export format remains COCO JSON
- Backend API unchanged

## Testing Recommendations

1. **Export Testing**:
   - Load GT and predictions
   - Edit some bboxes and categories
   - Adjust thresholds
   - Export and verify all modifications are included
   - Verify threshold filtering worked correctly

2. **Performance Testing**:
   - Load a large dataset (100+ images)
   - Adjust thresholds rapidly
   - Verify UI remains responsive
   - Verify current image mAP updates correctly

3. **Overall mAP Testing**:
   - Load GT and predictions
   - Click "Calculate Overall mAP" button
   - Verify calculation completes
   - Adjust thresholds and recalculate
   - Verify results change appropriately

## Known Limitations

1. Current image mAP uses IoU threshold for matching but not for filtering
   - This means the displayed prediction count may differ from what's exported
   - This is intentional for performance reasons

2. Overall mAP button requires manual click
   - Users must remember to click it to see updated metrics
   - This is a tradeoff for better performance

3. Export message shows filter statistics
   - Users can see how many predictions passed thresholds
   - Helps verify export worked as expected
