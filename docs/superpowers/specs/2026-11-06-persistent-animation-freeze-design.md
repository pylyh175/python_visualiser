# Persistent algorithm pane: last valid frame freeze

Date: 2026-11-06
Status: implemented

## Problem (user report)

Executing a line that doesn't touch the algorithm (e.g. a trailing `print()` on
the Container With Most Water code) blanked the animation's tab with
`No container pattern detected — needs two pointers on a height array.` even
though the algorithm had been recognised and animated correctly earlier.

## Ground truth

- Recursion tree replays steps `0..idx` cumulatively and Stack figures derive
  deterministically from ops up to `state.idx` — both families already survive
  non-algorithm lines. Only the four two-pointer-family panes (generic
  two-pointers, Reverse, Palindrome, Container) render purely from the CURRENT
  step's pointer detection, so a detection-less step wiped the pane.
- The 2026-11-06 navigation fix had already made these steps *stay put*
  (fire-once auto-advance) — but they still rendered the honest empty state.

## Grilled decisions

| Q | Decision |
|---|----------|
| Q1 | **(A) Verbatim frozen frame**: once an algorithm frame has been drawn, later detection-less steps re-render the LAST frame that drew content, byte-identical — no labels, chips, or disclaimers (the editor's arrows + step counter + slider carry the real position). |
| Q2 | When the mode is selected but the algorithm was NEVER detected in the whole run, the pane keeps today's honest empty message — the persistence latch only remembers frames that actually rendered algorithm content. |
| Q3 | Persistence is bidirectional: stepping BACK into pre-detection steps shows the frozen frame too. |
| Q4 | Freeze trades freshness for stability: the strip inside the frozen frame inevitably shows values from the remembered step (`max_area 49 · left 0 · right 8`) while the step counter shows the real position — accepted everywhere, including the final step. |

## Design

- `state.lastValidFrame` (−1 = none) — the step index of the last rendered
  algorithm frame; cleared in `resetRun()` and in `renderOutPanel`'s
  mode-switch block (a stale frame must never bleed across sub-modes).
- Per pane (`renderX()`): current step detects → remember + render fresh.
  Detection fails → re-detect at `lastValidFrame` and render **frozen**; if
  there is none, render the honest empty state as before.
- Content renderers gain `(detection, frameStep = state.idx, frozen = false)`:
  every `state.idx` read inside them becomes `frameStep` (pane strips show
  frame data, Q4), and pulses/flash are suppressed when frozen — a frozen
  re-render must never fake a swap/mismatch/max_area event.
- Existing pulse semantics for live frames unchanged (strobe guard + return
  gating); the auto-advance scan latches `lastValidFrame` too when it jumps.
- Future panes inherit by shape: cumulative renderers (tree/stack) need
  nothing; frame-based panes adopt the same last-valid freeze contract.

## Touchpoints

`src/state.js`, `src/runner.js` (reset), `src/panels/output.js` (mode-switch
reset), all four two-pointer-family panes; `viz_stepnav_fix_sim.js` extended
with freeze checks; audit gained the freeze-contract checks.

## Verification

Audit + freeze-harness sim + full battery; browser check: a trailing `print()`
after the container loop keeps the animation visible through the last step,
stepping back preserves it a second time, and the never-detected message still
shows for genuinely unrelated code.
