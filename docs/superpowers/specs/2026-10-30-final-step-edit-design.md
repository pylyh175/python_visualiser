# Edit-after-final-step (editor returns to edit mode at end of run) — 2026-10-30

## Problem

After a successful run, playback ends on the final step, but the editor stays
locked (the "successful runs stay locked" decision) — the user must click `✎
Edit`, which resets the whole trace. Reaching the final step should feel like
the run is *done*, so the editor should hand back to the user for direct editing.

## Decisions (grilled Q1–Q6, all confirmed)

1. **Q1 = Yes** — when playback reaches the final step of a successful run, the
   editor automatically unlocks (`locked = false`, `applyLock()`).
2. **Q2 = Only on first code modification** — the trace (green arrow, steps,
   output, variables, tree) is **kept** while waiting; the first real edit
   (`input` path) clears it via the existing `resetRun()`.
3. **Q3 = Both** — the same terminal-state behaviour applies to successful final
   steps, runtime errors, and step/time-limit stops (error/limit already
   auto-unlocked via the failed flag; now unified under "awaiting edit").
4. **Q4 = Yes** — before the final step the editor stays fully locked (readOnly +
   keydown guard) — unchanged policy.
5. **Q5 = Disable** — while in the awaiting-edit state, the playback controls
   (First/Prev/Next/Last/slider) and keyboard stepping are disabled (frozen trace).
6. **Q6 = Yes** — after the edit resets via `resetRun()`, the hint/status revert
   via the existing reset path (no extra work).

## Design

- New flag `awaitingEdit` (main.js): true once a run reaches a terminal state and
  keeps the trace, waiting for the user's first real edit; false otherwise.
- `setIdx` (the single stepping path for all controls + keyboard):
  - early-return while `awaitingEdit`;
  - when a successful run's final step (`steps[idx].finished && !programError &&
    !stoppedRun`) is reached → unlock editor + set `awaitingEdit = true`.
- `render()`: playback controls enabled iff `steps.length && !awaitingEdit`.
- Visualize handler: on error/limit-stop with a retained trace → set
  `awaitingEdit = true`; on success leave false (playback starts at step 0).
- `resetRun()`: clears `awaitingEdit` (and steps → controls disable naturally).

## Implementation

`main.js` only: flag + `setIdx` final-step auto-unlock + control disabling +
awaiting-edit handling in handler/reset.

## Verification

- `node --check main.js`.
- Existing editor audit sim re-run (lock/render interactions).
- Manual: run code → step to final → editor should be editable without ✎ Edit →
  type → green arrow/state should clear → run again works normally.
