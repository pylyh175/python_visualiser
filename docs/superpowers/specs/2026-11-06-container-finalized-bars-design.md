# Container With Most Water — finalized bars, thin bars, tab highlight

Date: 2026-11-06
Status: implemented (grilled 2026-11-06, Q1–Q5 all "yes")

## Problem

In container mode (1) bars start short and keep growing during navigation
until they reach their maximum, instead of being final from the first frame;
(2) at full height the value label collides with the strip row
(`height[9] … left=… right=… area=…`); (3) bars render ~36px wide with huge
fill-the-width gaps instead of thin bars with small gaps (reference: LeetCode
Example 1 diagram); (4) the "Output" tab always *looks* active while the bars
show in the Container tab.

## Facts found (ground truth)

- Tab `.active` highlight is only wired for recursion (`recursion.js:93-94`)
  and stack (`stack.js:397-398`); `#tabOut` ships hard-coded
  `class="active"` (`index.html:84`). No two-pointers tab ever receives it.
- Base `.tp-cell` (`style.css:740-743`) sets `flex: 1 1 36px; min-width:36px;
  max-width:80px`, which overrides the container override's `width: 4px` —
  flex sizing forces bars to ≥36px wide. `--gap` fill-the-width margin
  produces the huge gaps.
- Bar heights are constant per array (factor = availH/maxVal, maxVal of the
  full array); growth came from a scale cache computed while the pane was
  hidden / stale, corrected only on later renders.

## Decisions (grilled, all yes)

| Q | Decision |
|---|----------|
| Q1 | Scale is **locked per run**: computed once from the full array max + pane height on the first *visible* render after Visualize; never recomputed mid-run (no rescale on window resize). Re-lock only via resetRun (Visualize / clear). |
| Q2 | Tallest bar fills all height minus **one 24px top band** (value label) and **one 18px bottom band** (index labels) around the bars — never touches the strip row (between screenshot-2 and screenshot-3, never 3). |
| Q3 | Bars fixed **10px wide** with a fixed **12px CSS gap** (no `--gap`), overriding base flex sizing; row **centered** when it fits (`justify-content: safe center`), left + horizontal scroll when it doesn't. Water rectangle unchanged. |
| Q4 | `.active` highlight managed for **all** out-tabs (`out/tree/stack/two-pointers/reverse/palindrome/container`) in one place — `renderOutPanel` — moving to the visible pane, back to Output on click. `#tabOut` hard-coded `class="active"` removed. |
| Q5 | Output tab stays visible in container mode showing **print output only**; bars animate exclusively in the Container tab. |

## Design

### Locked scale (Q1)

`container.js`:

```js
let containerScale = null;
export function resetContainerScale() { containerScale = null; }   // called by runner.resetRun()
```

First render while `!els.containerBody.hidden` after a reset computes and
freezes `{ factor, maxVal, minBarPx: 4 }` (factor = max(availH/maxVal,
4/minNonZero)). Renders into a hidden body use a provisional factor
(PROVISIONAL_AVAIL_H = 300) without caching. `positionWater` treats a null
scale as factor 0 (water hidden until the scale is locked).

### Height units (Q2)

```
availH = containerBody.clientHeight − stripH(offsetHeight)
         − STRIP_MARGIN(8) − BODY_PAD(8) − TOP_BAND(24) − BOTTOM_BAND(18)
factor = max(availH / max(array), 4 / minNonZero)      tallest bar = availH
```

CSS mirrors the bands: `.tp-array[data-container] { padding-top: 24px;
padding-bottom: 18px; }` — and the cell padding (`14px/12px`) is dropped so
there is exactly one reservation, not three stacked ones.

Geometry (border-box arithmetic):

- value label (`top: -16px` from cell padding box, +2px cell border):
  label spans `[allocationTop+10, +22]` — inside the 24px band, ≥16px clear
  of the strip (strip bottom = allocationTop − 8), fully above the bar top
  (allocationTop + 24).
- index label (`bottom: -14px`, +2px cell border): spans
  `[allocationBottom−16, −4]` — inside the 18px band, below the bar bottom
  (allocationBottom − 18).
- water: `bottom: 18px` (was `bottom: 0`, which put it in the bottom band).

### Thin bars + gap (Q3)

`BAR_WIDTH = 10` (JS constant + CSS). `.tp-array[data-container] .tp-cell`
overrides: `flex: 0 0 auto; min-width: 0; max-width: none; width: 10px` (no
cell padding). Row gap via `gap: 12px` on `.tp-array[data-container]`;
`--gap`/estGap JS computation removed. `justify-content: safe center`
(unsupported → falls back to left-aligned, still scrollable).

### Tab highlight (Q4)

`output.js renderOutPanel` toggles `.active` on
`tabOut/tabTree/tabStack/tabTwoPtrs/tabReverse/tabPalindrome/tabContainer`
from `state.outTab` (single site, runs even for the no-steps early return).
`index.html` drops the hard-coded `class="active"` on `#tabOut`.
recursion.js/stack.js toggles stay (harmless duplicates).

### Reset hook (Q1/Q5)

`runner.js resetRun()` imports and calls `resetContainerScale()` so every
Visualize (and editor-clear reset) re-locks the scale on the new run's first
visible render.

## Touchpoints

- `src/panels/container.js` — constants, lock, reset export, markup (no --gap)
- `src/panels/output.js` — `.active` toggling (renderOutPanel)
- `src/runner.js` — reset hook
- `index.html` — tabOut hard-coded active removed
- `style.css` — bands, thin bars, gap, centering, water bottom
- sims: `viz_container_proportional_sim.js`, `viz_container_sim.js` updated
  (10px bars, fixed gap, ~202px tallest for the 300px stub, scale-lock check)

## Verification

`node --check` on all src JS; both container sims over the real trace
(`viz_container_trace.json`); full audit `viz_dsa_amount_audit.js`
(audit pins the untouched `containerBody.hidden` gating line 132); final
user browser check via `start.bat`.
