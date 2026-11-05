# Container With Most Water: Proportional Bar Heights — design (grilled 2026-11-05)

## User request

Bar heights should correspond proportionally to their values in the input array, with dynamic scaling to fit the available space.

## Ground-truth facts (gathered before grilling)

- Current implementation: fixed 44px cell height, water as percentage fill inside.
- `.tp-cell` has fixed `height: 44px`, centered content.
- Container body (`#containerBody`) doesn't have explicit styling yet — falls back to `.panel` white; needs the dark terminal chrome like `#reverseBody`/`#palindromeBody`.
- Available height varies with viewport; `containerBody.clientHeight` gives actual space at render time.

## Grilled decisions (all accepted)

1. **Available height**: computed from `containerBody.clientHeight` at render time — responsive to window size.
2. **Minimum bar height**: 4px for any value > 0, so small values stay visible.
3. **Scaling consistency**: factor computed **once** from full array's max value at first detection, cached in module scope — constant across all steps.
4. **Water with proportional bars**: flat water line at `waterLevel` height across all cells between pointers; cells render at proportional height, water fills up to that line.
5. **Baseline alignment**: bottom-aligned (histogram style) — `.tp-array` gets `align-items: flex-end`, cells get `justify-content: flex-end`.
6. **Value labels**: above the bar (inside if room, otherwise just above); index stays below.

## Implementation shape

- **CSS**: 
  - Add `#containerBody` to the dark terminal chrome group.
  - `.tp-array` for container: `align-items: flex-end` (bottom baseline).
  - `.tp-cell` for container: `justify-content: flex-end`, `height: auto`, `min-height: 4px`, value label positioned above.
  - Water: absolute positioned from bottom up to `waterLevel` scaled height.
- **JS (`container.js`)**:
  - Module-level `containerScale = { factor: null, maxVal: null, availHeight: null }` cached at first render.
  - `computeScale(arr, containerBody)` — calculates factor = (availHeight - padding) / maxVal, with min 4px enforcement.
  - Cell height = `Math.max(4, Math.round(arr[i] * factor))`.
  - Water height = `Math.min(cellHeight, Math.round(waterLevel * factor))`.
  - Value label: `<span class="tp-val">${val}</span>` positioned above bar (or inside if tall enough).

## Verification

- Probe trace with small values `[1,8,6,2,5,4,8,3,7]` — bars 1, 8, 6... proportional.
- Probe trace with large values `[15,80,60,25,50,45,80,35,75]` — scaled to fit.
- Water line flat at waterLevel across container.
- Scaling constant across steps (rewind exactness).
- Minimum 4px enforced for value=1.
- Audit checks for new CSS + JS patterns.