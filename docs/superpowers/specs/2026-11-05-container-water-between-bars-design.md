# Container With Most Water: water between thin bars — design (grilled 2026-11-05)

## User request

Replace the "water inside bars" visual with the classic Container With Most Water representation:
- Thin vertical bars (fixed width) with gaps between them
- Water fills the space BETWEEN the two pointer bars
- Water height = min(height[left], height[right]) — flat horizontal line
- As pointers move, water area updates dynamically

## Ground-truth facts (current implementation)

- Proportional bar heights work: scaling factor computed once from max value + available height
- Current water: inside each bar as percentage fill (wrong metaphor)
- Bars are full-width cells (36-80px), no gaps
- CSS: `.tp-array[data-container]` with bottom-aligned baseline, `.tp-cell` with `min-height: 4px`
- JS: `barHeightPx = max(4, round(val * factor))`, `waterHeightPx` per cell

## Grilled decisions (all accepted)

1. **Bar + gap geometry**: Fixed 8px bar width, gaps flex to fill remaining space. Bars stay thin at any viewport/array size.
2. **Water rendering**: Single blue rectangle in `.tp-array` (not inside cells), absolutely positioned spanning from right edge of left bar to left edge of right bar. Height = `waterLevel * factor`, bottom = 0.
3. **Pointer highlights**: Left bar = blue border (`tp-left`), right bar = red border (`tp-right`). Water = blue fill between them.
4. **Value labels**: Above each bar (centered on bar+gap), index below. Small font (10px).
5. **Transitions**: Water rectangle transitions `left`, `width`, `height` (150ms ease) when pointers move.
6. **Scaling**: Reuse existing `containerScale.factor` — bar height = `val * factor`, water height = `waterLevel * factor`.
7. **Out-of-view**: Water only renders when both pointers in visible window (`startIdx`..`endIdx`). Strip still shows pointer values.

## Implementation shape

### CSS changes
- `.tp-array[data-container]`: `position: relative`, `align-items: flex-end`, `gap: 0` (gaps via bar margins)
- `.tp-cell` in container: `width: 8px`, `height: auto`, `min-height: 4px`, `margin-right: var(--gap)` (gap via CSS var)
- `.tp-val` above bar, `::before` index below
- Water: new `.tp-water-container` in `.tp-array` — `position: absolute`, `bottom: 0`, `height: <waterHeight>px`, `left: <leftBarRightEdge>`, `width: <span>`, `background: rgba(59,130,246,0.35)`, `transition: left 150ms, width 150ms, height 150ms`
- Hide water when pointers out of view: `.tp-water-container.hidden { display: none; }`

### JS changes (`container.js`)
- Compute `--gap` CSS variable: `(containerWidth - numVisible * 8px) / (numVisible - 1)` or similar
- Build cells: each bar gets `style="height: ${barHeight}px; width: 8px;"`
- Water element: single `<div class="tp-water-container">` in `.tp-array`
- Water position: `left = leftBar.offsetLeft + leftBar.offsetWidth`, `width = rightBar.offsetLeft - leftBar.offsetRight`, `height = waterHeight`
- When pointers out of view: add `hidden` class to water element

## Verification

- Thin bars (8px) with visible gaps at all array sizes
- Water rectangle spans between pointers at correct height
- Water animates smoothly when pointers move (150ms)
- Pointer bars keep blue/red borders
- Value labels above, index below
- Scaling consistent across steps (factor cached)
- Water hidden when pointers out of view
- Existing sims updated, all green