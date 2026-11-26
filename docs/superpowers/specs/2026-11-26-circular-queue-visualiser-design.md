# Circular Queue visualiser (DSA > Circular Queue)

Date: 2026-11-26 (grilled Q1–Q10)

## Decisions

| Q | Decision |
|---|----------|
| Q1 | SVG donut ring, one segment per slot; index 0 at 12 o'clock, clockwise. Values inside segments, index labels on the inner edge. |
| Q2 | Two states: queued (solid blue) and empty (faint dashed outline). No "freed" state — every slot is reusable (contrast with the Queue pane's hatched slots). A served slot flashes as it empties. |
| Q3 | `front` (blue) and `rear` (red) arrows outside the ring sweep along the arc: a +1 move adds one slot of angle to the running total, so 3 → 0 keeps turning forward. Sharing a slot, they sit side by side. A non ±1 jump (`clear()`) snaps. |
| Q4 | Centre: the length counter (`length 4 / 4`) with `FULL` / `EMPTY`. |
| Q5 | Captions reuse the Queue pane's (`describeQueue`) plus modulo arithmetic: `rear = (3 + 1) % 4 = 0 ↺ wrapped`, and `length 1 → 2`. |
| Q6 | `front == rear` callout: `front == rear — empty or full? length = 4 → full` (or "no length counter — the pointers alone cannot tell"). |
| Q7 | A compact read-only strip of the same array under the ring, colour-matched, no pointers. |
| Q8 | Stored values flash in; served values fly out radially and fade (single forward step); speed follows playback. |
| Q9 | ≤ 24 slots: values and indices drawn; 25–100: no text, value on hover (`<title>`). |
| Q10 | The mode decides the view: Circular Queue → ring, Queue → strip. |

## Implementation

- `src/panels/cqueue.js`: persistent SVG view (segments rebuilt only when the
  capacity changes, so CSS transitions run); pointer `<g>` rotates with a CSS
  transform, its label counter-rotates to stay upright.
- `src/panels/queue.js` shares `runFacts`, `queueAt`, `describeQueue`, `val`;
  `describeQueue(..., circular=true)` adds the modulo text and the callout.
- Size: the `length|size|count|n` attribute, else `(rear - front) mod cap`.
- Wiring: `#tabCQueue` / `#cqueueBody`, `state.cqueueAnnounced`, output.js
  family `circular queue`, mode `status: 'ready'`.
- Layout: ring width `min(100%, 380px)`, capped at 52vh (32vh on stacked
  layouts) so the strip and legend stay in view; the pane scrolls if needed.

## Known limits

- One queue per run (shared detection with the Queue pane).
- Between `rear = …` and `length += 1` the stored value sits in a slot still
  drawn empty — the true intermediate state; the caption names the store.
