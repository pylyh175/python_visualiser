# Error-state trace-back (keep slider / prev / last enabled for buggy code) — 2026-10-30

## Problem

After the final-step-edit feature, error runs enter the `awaitingEdit` state
(`awaitingEdit = true` set in the run handler for error/limit-stop terminal
states), which disables all playback controls via `playbackOn`. For **buggy
code** the user therefore cannot keep using the slider / prev / next / first /
last controls to trace back through the recorded steps to the buggy line — they
can no longer scrub to (and inspect) the failing step.

## Decisions (grilled Q1–Q3, all confirmed)

1. **Q1 = Yes** — runtime-error runs keep live playback controls (slider, First,
   Prev, Next, Last) so the user can trace back to the buggy line.
2. **Q2 = Yes** — step/time-limit stops keep the awaiting-edit freeze.
3. **Q3 = Yes** — while tracing back, movement is free and the red buggy-line
   marker appears only at the final step (existing rendering semantics).

## Design

- The `awaitingEdit` freeze now applies to:
  - a successful run that reached its final step (via `setIdx` auto-unlock), and
  - step/time-limit stops (handler branch),
- but **not** to runtime-error runs — error runs retain live controls.

## Implementation

`main.js` handler branch (`if (programError || stoppedRun)`): set
`awaitingEdit = true` only for limit stops (`stoppedRun && !programError`), not
for runtime errors.

## Verification

- `node --check main.js`.
- Existing editor audit sim (59/59).
- Existing final-step sim (6/6).
