# Navigation stays live after the final step — 2026-11-02

## Problem

When playback reaches the final step of a successful run (and, today,
limit-stops too), the `awaitingEdit` state freezes every navigation control —
`setIdx` early-returns and `render()` disables First/Prev/Next/Last/slider.
The user wants to revisit earlier execution steps at any time after the run
finishes.

## Decisions (grilled Q1–Q4, all yes)

1. **Q1** — after the successful final step, First / Prev / Next / Last / slider
   stay enabled; stepping back shows earlier steps normally (green/orange
   arrows as recorded), and stepping forward re-affirms the same state.
2. **Q2** — editor behavior unchanged: the final step still auto-unlocks the
   editor, the editor stays unlocked while navigating, and the first real
   typing edit still clears the whole trace (the `input` listener's
   `!locked && steps.length` reset — independent of the freeze).
3. **Q3** — limit-stops become live too: with this change no terminal state
   freezes, and the special-case freeze disappears entirely.
4. **Q4** — keyboard (←/→/PageUp/PageDown) and the slider inherit the live
   behavior automatically because all stepping funnels through `setIdx`;
   the step label and highlight markers stay in sync via `render()`.

## Design

With the freeze removed, the `awaitingEdit` flag has no remaining readers
(the `input` reset keys off `!locked && steps.length`), so it is **deleted**:

- declaration, `resetRun()` clear, and the handler's limit-stop set — removed.
- `setIdx`: no early-return; keeps only the final-step auto-unlock branch.
- `render()`: `playbackOn = steps.length > 0` (trace exists ⇒ controls live).
- Comments referencing the awaiting-edit freeze are updated.

Locked editors are unaffected: `setIdx` still only touches the lock at the
final step of a successful run; stepping elsewhere never locks/unlocks.

## Verification

- `node --check main.js`.
- Rewrite the terminal-state sim (`viz_finalstep_sim.js`): expectation flips
  from "frozen" to "live" for success-final and limit-stop, exact-rewind
  checks, editor-unlock preserved, and "no free navigation before unlock"
  (successful playback before the final step still respects `locked`... it
  already does — the keydown path was never locked by awaitingEdit).
- Full regression sweep: editor audit, Enter sim, tab-indent sim, unwind/tree
  sims.
