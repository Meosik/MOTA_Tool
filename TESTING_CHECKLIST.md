# Testing Checklist for MAP Mode Improvements

## Prerequisites
1. Start the application with Docker Compose:
   ```bash
   cd MOTA_Tool/infra
   docker compose up
   ```
2. Navigate to MAP mode in the UI
3. Have test GT and Prediction COCO JSON files ready

---

## Test 1: Export with Thresholds ✓

**Goal**: Verify export correctly applies thresholds and includes modifications

### Steps:
1. Upload GT annotations (COCO JSON)
2. Upload Prediction annotations (COCO JSON)
3. Upload image folder
4. Set confidence threshold to 0.3
5. Set IoU threshold to 0.5
6. Navigate to an image and edit:
   - Move a bounding box
   - Change a category by double-clicking a box
7. Click "내보내기" (Export) button in top bar
8. Check the downloaded JSON file

### Expected Results:
- ✅ File is named `predictions_filtered_[timestamp].json`
- ✅ Alert shows: "Filtered predictions exported: X/Y annotations (IoU≥0.50, Conf≥0.30)"
- ✅ Exported JSON contains:
  - Only predictions with score ≥ 0.3
  - Only predictions with IoU ≥ 0.5 with at least one GT box
  - Your bbox modifications (check coordinates)
  - Your category changes (check category_id)
- ✅ Array length matches the "X" count in the alert

---

## Test 2: Overall mAP Button ✓

**Goal**: Verify overall mAP is NOT calculated automatically and button works

### Steps:
1. Upload GT and Prediction annotations
2. Upload image folder
3. Observe the "Overall Dataset" section (should show placeholder text)
4. Adjust IoU threshold slider from 0.5 to 0.7

### Expected Results:
- ✅ No loading spinner appears
- ✅ No backend API call (check browser DevTools Network tab)
- ✅ UI remains responsive
- ✅ "Calculate Overall mAP" button is enabled

### Steps (continued):
5. Click "Calculate Overall mAP" button
6. Wait for calculation to complete

### Expected Results:
- ✅ Button shows "Calculating..." during processing
- ✅ Backend API call visible in Network tab: `/map/calculate?gt_id=...&pred_id=...&conf=...&iou=0.7`
- ✅ Overall mAP value displays (e.g., "75.32%")
- ✅ Per-Class AP section shows if multiple categories exist
- ✅ "Categories: N | Images: M" displays at bottom

### Steps (continued):
7. Change IoU threshold to 0.3
8. Click "Calculate Overall mAP" button again

### Expected Results:
- ✅ New calculation uses IoU=0.3
- ✅ mAP value changes (should be higher with lower IoU threshold)

---

## Test 3: Current Image Display Performance ✓

**Goal**: Verify current image display is fast and shows correct predictions

### Steps:
1. Upload GT and Prediction annotations
2. Upload image folder with 50+ images
3. Set confidence threshold to 0.0
4. Set IoU threshold to 0.9 (very high)
5. Navigate through several images

### Expected Results:
- ✅ Image switching is instant (no lag)
- ✅ Canvas shows ALL predictions (regardless of IoU with GT)
- ✅ Canvas only filters by confidence threshold
- ✅ Current Image mAP updates immediately
- ✅ No backend API calls during navigation (check Network tab)

### Steps (continued):
6. Rapidly move IoU slider from 0.1 to 0.9 and back

### Expected Results:
- ✅ UI remains responsive
- ✅ No lag or freezing
- ✅ Canvas display doesn't change (IoU not applied to display)
- ✅ Current Image mAP updates (uses IoU for AP calculation)
- ✅ No backend API calls (check Network tab)

### Steps (continued):
7. Adjust confidence threshold from 0.0 to 0.8

### Expected Results:
- ✅ Canvas immediately updates
- ✅ Low-confidence predictions disappear
- ✅ Current Image mAP updates
- ✅ UI stays responsive

---

## Test 4: Bbox and Category Modifications ✓

**Goal**: Verify modifications are preserved and included in export

### Steps:
1. Upload GT and Predictions
2. Navigate to an image with several predictions
3. Select a prediction box
4. Drag to move it
5. Drag a corner handle to resize it
6. Double-click another box
7. Type a new category name (e.g., "car" or "person")
8. Press Enter
9. Navigate to a different image
10. Navigate back to the modified image

### Expected Results:
- ✅ Modified bbox is in new position
- ✅ Resized bbox has new dimensions
- ✅ Category label updated on canvas
- ✅ Modifications persist after navigation

### Steps (continued):
11. Click "내보내기" (Export) button
12. Open exported JSON file
13. Find the modified annotations by their IDs

### Expected Results:
- ✅ Bbox coordinates match your modifications
- ✅ Category_id matches your category change
- ✅ All other fields preserved (score, image_id, etc.)

---

## Test 5: Undo/Redo Functionality ✓

**Goal**: Verify undo/redo works with modifications

### Steps:
1. Make several bbox modifications
2. Change a category
3. Click "Undo" button (or press Ctrl+Z)
4. Click "Redo" button (or press Ctrl+Y)

### Expected Results:
- ✅ Undo reverses last modification
- ✅ Redo restores it
- ✅ Multiple undo/redo operations work correctly
- ✅ Canvas updates reflect changes

---

## Test 6: Reset Current Frame ✓

**Goal**: Verify current frame reset restores original predictions

### Steps:
1. Navigate to an image
2. Make several bbox modifications
3. Change categories
4. Click "프레임 리셋" (Reset Frame) button

### Expected Results:
- ✅ All modifications on current image are reverted
- ✅ Original predictions restored
- ✅ Other images' modifications unaffected
- ✅ Can undo the reset

---

## Test 7: Large Dataset Performance ✓

**Goal**: Verify performance with large datasets

### Prerequisites:
- COCO dataset with 1000+ images
- 5000+ predictions

### Steps:
1. Upload large GT and Prediction files
2. Upload image folder
3. Adjust thresholds multiple times
4. Navigate through many images
5. Make some modifications
6. Click "Calculate Overall mAP" button

### Expected Results:
- ✅ UI remains responsive during threshold changes
- ✅ Image navigation is smooth
- ✅ Canvas rendering is fast
- ✅ Overall mAP calculation completes (may take 10-30 seconds for very large datasets)
- ✅ Export works correctly

---

## Test 8: Edge Cases ✓

**Goal**: Test boundary conditions

### Test 8a: No GT Uploaded
1. Upload only Predictions
2. Adjust thresholds
3. Try to export

**Expected**: Export works, but IoU filtering is skipped (no GT to compare against)

### Test 8b: No Predictions Uploaded
1. Upload only GT
2. Adjust thresholds
3. Try to export

**Expected**: Alert "No predictions to export"

### Test 8c: All Predictions Filtered Out
1. Upload GT and Predictions
2. Set confidence to 0.99
3. Set IoU to 0.99
4. Try to export

**Expected**: Alert "No predictions pass the current thresholds"

### Test 8d: Threshold Edge Values
1. Set confidence to 0.0 - Should show all predictions
2. Set confidence to 1.0 - Should show only perfect scores
3. Set IoU to 0.0 - Should show all predictions (in export)
4. Set IoU to 1.0 - Should show only perfect overlaps (in export)

---

## Browser DevTools Verification

### Network Tab Checklist:
- ✅ No `/map/calculate` calls when adjusting thresholds
- ✅ `/map/calculate` call only when clicking "Calculate Overall mAP" button
- ✅ `/annotations/{id}` PATCH calls when modifying bboxes/categories (debounced to 1 second)

### Console Checklist:
- ✅ No JavaScript errors
- ✅ Debug logs show correct filtering logic
- ✅ No React warnings

---

## Regression Testing

### MOTA Mode (unchanged):
1. Switch to MOTA mode
2. Verify all MOTA functionality still works
3. Export button works as before
4. Thresholds work as before

**Expected**: No changes to MOTA mode behavior

---

## Summary Metrics

After all tests, you should observe:
- ✅ **UI Responsiveness**: Instant threshold adjustments (was 2-3 second lag)
- ✅ **Export Accuracy**: Correct filtering and modifications included
- ✅ **Overall mAP**: Manual trigger works, results are accurate
- ✅ **Current Image Display**: Fast, shows more predictions for editing
- ✅ **Modifications**: Preserved across navigation and included in export
- ✅ **No Regressions**: MOTA mode unchanged, all existing features work

---

## Troubleshooting

### If export doesn't apply thresholds:
- Check `TopBar.tsx` line 76 uses `exportFilteredPred` not `exportMapPred`
- Verify `mapStore.ts` `exportFilteredPred` function logic

### If overall mAP calculates automatically:
- Check `mapApi.ts` `useMapMetrics` has `enabled` parameter
- Check `MapControlPanel.tsx` passes `shouldCalculateOverall` to hook

### If UI is still slow:
- Check `InteractiveCanvas.tsx` line 140-155 doesn't include IoU filtering
- Check `MapControlPanel.tsx` line 280-300 doesn't include IoU filtering
- Verify no automatic `useMapMetrics` calls in components

### If modifications aren't included in export:
- Check `mapStore.ts` line 609-614 uses `state.predAnnotations`
- Verify modifications update `predAnnotations` state correctly
- Check Network tab for `/annotations/{id}` PATCH calls after edits
