# Container With Most Water — responsive bars & static Output tab

Date: 2026-11-06 (second round, same day)
Status: implemented
Supersedes: the **locked-scale** decision (Q1) of
`2026-11-06-container-finalized-bars-design.md`. Everything else from that
design (24/18px label bands, 10px bars, single `.active` toggle site,
reset hook, Output tab keeps print output) stays in force.

## Problem (user report + screenshot)

1. Bars + gaps are fixed-size: the group occupies ~450px of an ~1100px pane —
   width is unused ("gap between the bar is too small").
2. Nothing re-renders on resize and the scale is locked per run, so shrinking
   the tab clips bars/values — the pane must be dragged to max height first.
3. The Output tab still animates: `renderOutput()` slices
   `programOutput.slice(0, step.outLen)` per step, so stepping "plays" the
   print text in the Output pane.

## Ground truth found

- No `ResizeObserver` / `resize` listener exists anywhere — bars cannot
  respond to tab resizing today.
- The Output-tab "animation" is the per-step `outLen` reveal in
  `renderOutput` (output.js renderOutput), not misplaced bars.

## Decisions (user's explicit expected behaviour)

| R | Decision |
|---|----------|
| R1 | Bar scale is **responsive**: recomputed whenever the pane height or the array max changes. Only **visible** renders write the cache (a hidden body has no usable `clientHeight` — that was the original growth bug); hidden renders use a provisional, uncached factor. |
| R2 | Gaps are **responsive to width**: `gap = (clientWidth − 16px body pad − n·BAR_WIDTH) / (n − 1)`, clamped to `[2px, 72px]`. When the clamp engages the row stays centered (`justify-content: safe center` remains the fallback); when the pane is too wide, gaps fill it exactly. Below `2px`, horizontal scroll takes over (very large arrays). |
| R3 | **No clipping**: a `ResizeObserver` on `#containerBody` re-renders the container path on any size change (wired once from `main.js`); every render re-positions the water via `requestAnimationFrame`, so bars/values/water always fit the current pane at any size. |
| R4 | **Proportional scaling stays exact**: `factor = max(availH/maxVal, 4/minNonZero)` from the full array; water height = `waterLevel × factor`; all bar labels live inside the unchanged 24/18px bands. |
| R5 | In algorithm modes the **Output tab is static**, keyed on the FAMILY (`dsaFamily(state.dsaMode) !== 'none'`) — full `programOutput` immediately, no per-step `outLen` reveal; the only animated pane is the algorithm's own tab. Generalized from "container only" after the user reported the reveal still animating the Output tab for other modes — future families inherit the rule automatically. Plain `none` mode (no algorithm pane) keeps the reveal. |

## Design

### Responsive scale (R1)

```js
if (!els.containerBody.hidden) {
  availH = max(80, clientHeight − stripH − STRIP_MARGIN(8) − BODY_PAD(8)
                 − TOP_BAND(24) − BOTTOM_BAND(18));
  if (!containerScale || maxVal/maxVal || availHeight !== availH) recompute;
}
factor = containerScale ? … : provisional(PROVISIONAL_AVAIL_H = 300)
```

`resetContainerScale()` (runner.resetRun) stays — every new run starts from a
clean cache so the first frame uses fresh measurements.

### Adaptive gap (R2)

```js
const numVisible   = endIdx − startIdx;
const gaps         = Math.max(1, numVisible − 1);
const totalBarW    = numVisible * BAR_WIDTH(10);
const innerW       = containerEl.clientWidth − 16;               // BODY_PAD_H
const estGap       = Math.max(MIN_GAP(2), Math.min(Math.floor((innerW − totalBarW) / gaps), MAX_GAP(72)));
```

Markup carries `style="--gap: ${estGap}px"`; CSS consumes
`gap: var(--gap, 12px)`.

### Resize hook (R3)

`container.js` exports `initContainerResize()`: a single `ResizeObserver`
observes `els.containerBody`; on size change it re-renders only when a trace
exists, container mode is selected, and the container body is visible
(`renderContainerPanel()`). Wired in `main.js` next to the other init calls.
The strobe guard keeps resize re-renders pulse-free (same step ⇒ no pulse).

### Static Output tab (R5)

In `renderOutput()`, when `state.dsaMode ===
'two-pointers.container-with-most-water'`, the shown text is
`state.programOutput` in full (still with the final-step error/stop suffixes);
other modes keep the `outLen` reveal exactly as before.

## Touchpoints

- `src/panels/container.js` — responsive scale cache, estGap, `initContainerResize`
- `src/panels/output.js` — static output in container mode (renderOutput)
- `src/main.js` — `initContainerResize()` wiring
- `style.css` — `gap: var(--gap, 12px)` on `.tp-array[data-container]`
- sims (`viz_container_proportional_sim.js`, `viz_container_sim.js`) +
  audit `viz_dsa_amount_audit.js` — pinned checks flipped from lock to
  responsive, `--gap` restored, resize-rescale + static-output checks added

## Verification

`node --check` on all src JS; both container sims over the real trace
(incl.Pane-resize rescale check); full audit; final user browser check via
`start.bat`.
