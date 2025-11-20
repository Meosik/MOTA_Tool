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
**Problem**: Image list mAP values were recalculating on every threshold change, causing performance issues.

**Solution**:
- **Current Image Display**: Both confidence and IoU thresholds are applied
  - InteractiveCanvas: Shows predictions with conf ≥ threshold AND IoU ≥ threshold with GT
  - MapControlPanel current image stats: Filters by both thresholds
- **Image List mAP**: Calculated once at initial load with default IoU=0.5
  - Cached and not recalculated when thresholds change
  - Provides stable performance metric for navigation
- **Export and Overall mAP**: Both confidence and IoU thresholds are applied
  - exportFilteredPred: Filters by both thresholds
  - Backend mAP calculation: Uses both thresholds

**Design Rationale**:
- Current image needs real-time filtering for users to see effect of threshold adjustments
- Image list mAP values are for reference during navigation, not for threshold tuning
- Calculating mAP for all images on every threshold change is expensive and unnecessary
- Overall mAP button provides accurate results with current thresholds when needed

**Files Modified**:
- `frontend/src/components/map/InteractiveCanvas.tsx` - Applies both IoU and confidence filtering
- `frontend/src/components/map/MapControlPanel.tsx` - Applies both thresholds to current image stats
- `frontend/src/components/map/MapImageList.tsx` - Caches mAP values calculated at initial load

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
- Shows predictions with confidence ≥ threshold AND IoU ≥ threshold with GT
- Allows editing of bboxes and categories
- Displays current image mAP for quick feedback
- Updates instantly when threshold changes
- Image list mAP values remain stable (calculated once at load)

## Technical Details

### State Management
- All modifications stored in `mapStore.predAnnotations`
- Thresholds stored in `mapStore.iou` and `mapStore.conf`
- Export reads directly from current state
- No separate storage needed for modifications

### Performance Improvements
- Eliminated automatic backend API calls on threshold changes
- Image list mAP values cached (calculated once at initial load)
- Current image filtering happens in real-time (fast for single image)
- Overall mAP calculation only on button click
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

1. Image list mAP values use default IoU=0.5
   - These values don't update when you adjust the IoU slider
   - They serve as reference metrics for navigation
   - For accurate mAP with custom thresholds, use "Calculate Overall mAP" button

2. Overall mAP button requires manual click
   - Users must remember to click it to see updated metrics
   - This is a tradeoff for better performance

3. Export message shows filter statistics
   - Users can see how many predictions passed thresholds
   - Helps verify export worked as expected
