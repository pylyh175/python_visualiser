# Step navigation: start at step 1 + fire-once auto-advance (end of the hijack)

Date: 2026-11-06
Status: implemented

## Problem (user report)

1. After Visualize, the view jumped straight to the **final** step instead of
   starting at the first.
2. After navigating back to an early step, **Next** appeared frozen.
3. At step N−1, clicking **Next** teleported back to (near) the **first** step
   and replayed the story instead of reaching step N.

## Ground truth found

- Symptom 1 was deliberate old behavior: `runner.js` landed successful runs on
  `idx = steps.length - 1` ("land on the final step so the output is visible").
- Symptoms 2–3: the two-pointer-family renderers' **auto-advance scan**
  (`!detection && !userTab` → jump `state.idx` to the first step with a valid
  detection) re-fired on EVERY render — the announce latch gated only the tab
  switch, never the index jump. Stepping into any detection-less step (early
  steps before the pointers exist; the final merged finished snapshot, which
  fails detection) got its render hijacked: the recorded `idx` was overwritten
  before the pane drew, so Next "did nothing" (or snapped back) and the final
  step was unreachable by stepping.
- Side-discovery: `containerAnnounced` was never declared in `state.js` nor
  cleared in `resetRun()` — the container latch lived only inside `container.js`
  and never reset across runs.

## Decisions

| D | Decision |
|---|----------|
| D1 | **Successful runs land on the FIRST step** (user requirement, supersedes the "land on final" choice). Stepping to the final step still hands the editor back via `setIdx` (2026-10-30 design). Error/limit runs keep their own late landing on the buggy/last line — that's a different, still-approved behavior. |
| D2 | **Auto-advance is fire-once per run**, keyed on each pane's own announce latch (`twoPointersAnnounced` / `reverseAnnounced` / `palindromeAnnounced` / `containerAnnounced`). After the one-time engage, the renderers never touch `state.idx` again — stepping is free. Detection-less steps render their honest "no pattern detected" message instead of teleporting. |
| D3 | A manual tab choice (`userTab=true`) still blocks even the first advance — unchanged approved rule. |
| D4 | `resetRun()` clears every announce flag on each new run (container + the new generic two-pointers latch included), so the one-time engage re-arms per run as designed for the other families. |

## Touchpoints

- `src/runner.js` — landing `idx = 0` on success; `resetRun` clears both latches
- `src/state.js` — declares `twoPointersAnnounced`, `containerAnnounced`; `outTab` comment gains `container`
- `src/panels/twoPointers.js` — scan gated + sets its latch when it fires
- `src/panels/reverse.js`, `palindrome.js`, `container.js` — scan gated on the existing latch
- sims: new `viz_stepnav_fix_sim.js` (real renderers over a synthetic trace:
  engage once, then free stepping incl. the final step); audit gained the
  landing/latch/gate checks

## Verification

Full audit (122 pass) · `viz_stepnav_fix_sim.js` 12 pass · existing battery
(container/reverse/palindrome/finalstep/stack/recursion/… all green) ·
`node --check` clean. Browser check expected: Visualize → step 1 highlighted,
Next walks 1→N, Next at N−1 reaches N, Next disabled at N, arrows and pane state
stay in sync throughout.
