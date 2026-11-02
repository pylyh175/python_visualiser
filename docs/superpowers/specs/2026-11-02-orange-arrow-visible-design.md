# Orange-arrow always visible (stepping keeps the pair in view) — 2026-11-02

## Problem

`ensureStepVisible()` (the auto-scroll that runs on every step change) anchors
on `steps[idx].line` **and `steps[idx+1].line`** — the next *step*, not the
arrows the editor actually draws. When the next step lands far away (recursion
returns into an outer frame), the scroll parks on that future line and can push
the **orange arrow the user is looking at** out of view. Manual scrolling aside,
at least one arrow must always be visible, with priority to orange.

## Decisions (grilled Q1–Q4, all yes)

1. **Q1** — anchor on exactly the arrows `renderEditor` draws: orange on
   `steps[idx].line`, green on `steps[idx-1].line` (return steps: green-only on
   the return line; error/limit final step: red-only on that line). Orange (or
   the red marker, or green-when-alone) is **always fully visible**; the second
   arrow joins when both fit; on conflict, the priority arrow wins.
2. **Q2** — both arrows in view ⇒ the scroll does not move at all; manual
   scroll positions persist until a step change needs an adjustment.
3. **Q3** — adjustments animate: ~150 ms eased scroll that retargets when a new
   step arrives mid-animation (rapid stepping stays fluid). Respects
   `prefers-reduced-motion` (instant there). Instant is trivially available as
   a fallback if the animation ever feels laggy.
4. **Q4** — keep the existing 22px edge-margin policy; `scrollToLine` (error /
   limit landing), caret-follow (no-margin, user-tuned), and locked-playback
   guarding unchanged. Horizontal placement of arrows is out of scope.

## Design

`main.js` only:

- New helper `stepArrowLines()` computing `{greenLine, orangeLine, atErrorStep}`
  with exactly `renderEditor`'s semantics (same-line green/orange collapse
  handled by the caller), and `renderEditor` switched to consume it — the two
  can no longer drift.
- Rewritten `ensureStepVisible()`:
  - arrow rows in draw-priority order (red → orange → green), deduped by line;
  - no scroll when every arrow row is fully visible;
  - otherwise compute a per-row quick-nine window (`rowBottom + m - h …
    rowTop - m`, 22px margin) and clamp the current `scrollTop` into the
    intersection of the arrows' windows; if the windows conflict, clamp into
    the priority arrow's window only;
  - retargetable 150 ms eased animation (`smoothScrollEditor`), canceled on
    wheel/touch/pointer manual scrolling, on new landing (`scrollToLine`), and
    replaced by an instant set under `prefers-reduced-motion`.

## Verification

- `node --check main.js`.
- New sim (`viz_stepvis_sim.js`) over the real extracted `renderEditor` +
  `stepArrowLines` + `ensureStepVisible` + `smoothScrollEditor` (stub rAF):
  nearby steps no-scroll; far jumps in both directions with orange kept in
  view; return steps green-only; error step red-only; conflict case orange
  wins; animation converges + retarget; reduced-motion instant.
- Full regression sweep including the unwind sim (arrow drawing unchanged).
