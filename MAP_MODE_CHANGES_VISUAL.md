# MAP Mode Changes - Visual Guide

## Before vs After Comparison

### 1. Export Button Behavior

#### Before:
```
TopBar "내보내기" Button
   ↓
exportMapPred()
   ↓
Export ALL predictions (no filtering)
   ↓
❌ Thresholds NOT applied
❌ May include low-confidence predictions
❌ May include low-IoU predictions
```

#### After:
```
TopBar "내보내기" Button
   ↓
exportFilteredPred()
   ↓
Apply confidence threshold (conf ≥ threshold)
   ↓
Apply IoU threshold (IoU ≥ threshold with GT)
   ↓
Export filtered predictions
   ↓
✅ Thresholds applied correctly
✅ Bbox modifications included
✅ Category changes included
✅ Alert shows filter statistics
```

---

### 2. Overall mAP Calculation

#### Before:
```
User adjusts IoU slider
   ↓
MapControlPanel detects change
   ↓
useMapMetrics hook auto-triggers
   ↓
Backend calculates mAP for ALL images
   ↓
😓 SLOW - happens on every slider change
😓 UI becomes unresponsive
😓 Unnecessary calculations
```

#### After:
```
User adjusts IoU slider
   ↓
MapControlPanel detects change
   ↓
⚡ NO automatic calculation
⚡ UI stays responsive
⚡ User continues editing

---

When ready to see overall metrics:
   ↓
User clicks "Calculate Overall mAP" button
   ↓
useMapMetrics hook triggers
   ↓
Backend calculates mAP for ALL images
   ↓
✅ FAST - only when needed
✅ User controls timing
✅ Better UX
```

---

### 3. Threshold Application

#### Before:
```
Current Image Display:
   ↓
Filter by confidence threshold ✓
   ↓
Filter by IoU threshold ✓
   ↓
😓 Slow rendering
😓 Expensive IoU calculations
😓 Recalculated on every slider change
```

#### After:
```
Current Image Display:
   ↓
Filter by confidence threshold ✓
   ↓
Skip IoU filtering ⚡
   ↓
✅ Fast rendering
✅ Shows more predictions for editing
✅ Instant feedback

---

Export / Overall mAP:
   ↓
Filter by confidence threshold ✓
   ↓
Filter by IoU threshold ✓
   ↓
✅ Accurate final results
✅ Only calculated when needed
```

---

## UI Changes

### MapControlPanel - New Button

```
┌─────────────────────────────────────────┐
│  IoU Threshold                         │
│  [====o====] 0.50                      │
│                                         │
│  Confidence Threshold                  │
│  [=o========] 0.20                     │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ Instance Visibility             │  │
│  │ ☑ GT (15)                       │  │
│  │ ☑ Pred (48)                     │  │
│  └─────────────────────────────────┘  │
│                                         │
│  Current Image mAP                     │
│  82.45%                                │
│  Average Precision for this image      │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ Overall Dataset                  │  │
│  │ [Calculate Overall mAP] ← NEW!   │  │
│  │                                  │  │
│  │ 75.32%                           │  │
│  │ Mean Average Precision           │  │
│  └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Performance Impact

### Threshold Slider Interaction

**Before:**
- Adjust slider → 2-3 second lag → UI updates
- Backend API call on EVERY change
- Calculations for 100+ images each time

**After:**
- Adjust slider → Instant UI update ⚡
- No backend API calls
- Current image only updates

### Export Operation

**Before:**
- Click Export → Exports everything
- No filtering applied
- 500ms operation

**After:**
- Click Export → Applies filters → Exports
- Both thresholds applied
- 600ms operation (100ms slower but CORRECT)

### Overall mAP Calculation

**Before:**
- Automatic on every change
- 2-5 seconds per calculation
- Multiple unwanted calculations

**After:**
- Manual trigger only
- 2-5 seconds per calculation
- One calculation when needed

---

## Data Flow Diagram

```
┌──────────────┐
│   User       │
└──────┬───────┘
       │
       ├─ Edit Bbox ────────────┐
       │                        │
       ├─ Edit Category ────────┼─→ mapStore.predAnnotations
       │                        │
       └─ Adjust Thresholds ────┼─→ mapStore.iou, mapStore.conf
                                │
                                │
       ┌────────────────────────┘
       │
       ├─→ InteractiveCanvas
       │   • Shows predictions with conf ≥ threshold
       │   • NO IoU filtering
       │   • Instant updates ⚡
       │
       ├─→ MapControlPanel Current Image mAP
       │   • Uses predictions with conf ≥ threshold
       │   • NO IoU filtering
       │   • IoU used for AP calculation only
       │   • Instant updates ⚡
       │
       ├─→ Export Button (when clicked)
       │   • Reads mapStore.predAnnotations
       │   • Applies conf threshold ✓
       │   • Applies IoU threshold ✓
       │   • Includes all modifications ✓
       │   • Downloads filtered JSON
       │
       └─→ Calculate Overall mAP Button (when clicked)
           • Triggers backend API
           • Backend applies both thresholds ✓
           • Returns overall metrics
           • Displays in control panel
```

---

## Key Takeaways

1. **Export is now correct** - applies all thresholds and modifications
2. **UI is much faster** - no automatic backend calls
3. **Current image shows more** - helps with editing decisions
4. **Final outputs are filtered** - export and overall mAP use both thresholds
5. **User has control** - manual button for expensive operations
