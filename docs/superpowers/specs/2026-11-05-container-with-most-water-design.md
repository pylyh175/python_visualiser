# Container With Most Water visualizer — design (grilled 2026-11-05)

## User request

Implement the animation for the Container With Most Water problem (two-pointers sub-mode).
Code pattern:
```python
class Solution:
    def maxArea(self, height: List[int]) -> int:
        max_area = 0
        left = 0
        right = len(height) - 1
        while left < right:
            max_area = max(max_area, (right - left) * min(height[left], height[right]))
            if height[left] < height[right]:
                left += 1
            else:
                right -= 1
        return max_area
```

## Ground-truth facts (probed before grilling)

- Tracer records `height` array (step 7+), `left`/`right` ints (step 9/10+), `max_area` (step 8+, updated 0 → 8 → 49 → …).
- Generic `detectTwoPointers` finds this: `left`/`right` names on same `height` array.
- Runner provides per-step snapshots; no source parsing needed.

## Grilled decisions (all accepted)

1. **Own tab+body** (`containerBody`, `tabContainer`) — consistent with reverse/palindrome sub-modes.
2. **Visual per step**:
   - Array cells with `left`/`right` pointers (existing `tp-cell` classes)
   - Current area: `(right-left) * min(height[left], height[right])`
   - Max area so far (from recorded `max_area`)
   - **Water fill**: semi-transparent fill between pointers at `min(height[left], height[right])` height
3. **Pulse on max_area update** — strobe-guarded (like reverse.js swap pulse, palindrome.js mismatch pulse).
4. **Tracer ground truth only** — `max_area` from recorded locals; area computed from `left`/`right`/`height` per step.
5. **Tab label "Container With Most Water"**, `tabContainer`, `containerBody` in index.html.
6. **Output.js wiring** — `isContainer` check, import `renderContainerPanel`, call in `renderOutPanel`.

## Implementation shape

- New module `src/panels/container.js` (mirrors `reverse.js` structure):
  - `renderContainerPanel()` — visibility gating, tab show/hide, calls `renderContainer()`
  - `renderContainer()` — detection via `detectTwoPointers`, auto-advance if no detection, auto-switch on first detect
  - `renderContainerPanelContent(detection)` — builds visual:
    - Water fill: for each index between `left` and `right`, draw a `tp-water` element at `min(height[left], height[right])` relative height
    - Pulse: compare current step's recorded `max_area` with previous step's; if increased, add `tp-pulse` to the water/area display
    - Strip: `height[n]`, `left=idx → val`, `right=idx → val`, `area=X (max Y)` with pulse on new max
- index.html: add `tabContainer` button + `containerBody` div
- output.js: import, wire into `renderOutPanel`
- CSS: `.tp-water` (semi-transparent fill), `.tp-pulse` keyframe (brief highlight on new max)

## Verification

- Probe trace: 47 steps, max_area updates at steps 12 (8), 16 (49), etc.
- Sims: existing two-pointers sims unchanged; new sim probes water/pulse/area
- Audit: new checks for container module, tab, wiring, CSS
- Battery: all existing green