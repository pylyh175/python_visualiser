# Draggable divider between Variables and Output panels — 2026-11-02

## Problem

Inside the right column, `#varsPanel` (content-sized, capped at `max-height: 45%`)
and `#outputPanel` (`flex: 1`) have a fixed relationship. The user wants to
resize both panels by dragging a divider between them, mirroring the existing
editor/output splitter (`#divider`, main.js `initSplitter`).

## Decisions (grilled Q1–Q5, all yes)

1. **Q1** — dragging changes the Variables panel's height; the Output panel
   (body + Output/Recursion tabs + tree) absorbs the remaining space.
2. **Q2** — same look as the existing divider: 8px hit area + slim grab line,
   horizontal (`row-resize` cursor).
3. **Q3** — persist the chosen height in `localStorage` (key `vizVarsHeight`),
   restored on reload.
4. **Q4** — double-click resets to the default layout (content-sized, 45% cap,
   output flex-grows) and clears the saved height.
5. **Q5** — clamps: Variables panel ≥ 48px shortest; Output body ≥ its current
   80px min-height (panel floor = its header + tabs + 80px chrome).

## Design

Mirror the existing splitter pattern exactly:

- `index.html`: new `<div id="vdivider">` between the two panels in `#right`.
- `style.css`: `#vdivider` (horizontal twin of `#divider`) + `body.resizing-v`
  cursor lock (existing `body.resizing` is `col-resize`).
- `main.js`: `applyVarsHeight(px)` sets an inline height on `#varsPanel`
  (and `max-height: none` so the 45% cap can't override the drag), clamped to
  `[MIN_VARS=48, right.height − 2×gap − output chrome]`; pointer-capture drag
  handlers, `localStorage` save on drag end, double-click reset, window-resize
  re-clamp. `initVarsSplitter()` runs alongside `initSplitter()`.

Because `#varsBody` has `overflow: auto` (automatic min-size 0), a forced
smaller panel height simply scrolls — no flex changes needed.

## Verification

- `node --check main.js`.
- Small sim over the real `applyVarsHeight` (clamp math: min/max, output floor,
  double-click reset semantics).
- Manual check via `start.bat`: drag, reload (height restored), double-click.
