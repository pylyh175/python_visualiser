# Queue visualiser (DSA > Queue)

Date: 2026-11-26

## Goal

Animate the linear array queue (default code in `DSA_DEFAULT_CODE.queue`) for
learning, in the style of the two-pointer panes: the array as cells, `front`
and `rear` as gliding markers, and slots freed at the front shown with their
own pattern.

## View (`src/panels/queue.js`, Queue tab)

- Strip: `q.array[4] · size 2 / 4 · front=1 (val "B") · rear=3 (next free slot)`,
  plus badges `empty`, `full`, or `full — N freed slots wasted`.
- Cells (reusing `buildCells` + the pointer kit):
  - queued (`front <= i < rear`): solid blue;
  - freed (`i < front`): hatched — served, never reused by a linear queue;
  - empty (`i >= rear`): dashed — room at the rear;
  - `rear == len`: a borderless `end` ghost cell, where the pointer sits.
- Caption (most specific first): exception of a queue method (with the
  "only N items queued, but rear hit the end" explanation), a method's return
  (`is_full()` returning True with freed slots explains the waste and points
  to Circular Queue), the state change since the previous step (`stored "C"
  at array[2]`, `array[0] = None — "A" left the queue`, `front 0 → 1 (slot 0
  is freed …)`), the running method, else what `serve()` / `append()` would
  do next.
- Motion: markers glide; a value stored at the rear drops in; a served value
  flies out of its slot (single forward step only).
- Legend: FIFO direction plus the three cell patterns.

## Detection

Ground truth only, from the runner's per-step memory graph: the first
instance node with a list attribute and integer attributes named
`front|head|first` and `rear|tail|back|end|last` (optional
`length|size|count|n` for the size, else `rear - front`). Method facts come
from frames whose `oid` is that instance, plus `step.ret` / `step.exc`.
No queue anywhere in the trace → muted note in the Output tab.

## Wiring

`#tabQueue` / `#queueBody` (index.html, dom.js), `state.queueAnnounced`
(auto-switch once the queue exists; a manual tab choice sticks), output.js
family `queue`, Queue mode `status: 'ready'`.

## Known limits

- One queue per run (the first instance detected) — `shortcut:` in queue.js.
- Circular wrap-around is not drawn; Circular Queue is a separate mode.
