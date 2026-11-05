# Stack visualiser: dynamic growth beyond 8 slots — design (grilled 2026-11-05)

## User report

The Stack visualisation always draws exactly 8 slots. Pushing more than 8 elements
silently drops the bottom items out of the drawing (they fall off
`visibleCells = cells.slice(-STACK_VIS_CAP)`) while new items keep overwriting the
same 8 rows. Expected: the figure grows with the content; nothing disappears;
`pop()` removes items cleanly.

## Ground-truth facts (probed before grilling)

- Solo renderer: `visibleCells = cells.slice(-STACK_VIS_CAP)` and a fixed
  `for (let row = STACK_VIS_CAP - 1; row >= 0; row--)` loop — the direct symptom.
- The TRACER caps containers at `MAX_ITEMS = 100` and records the **first** 100
  of the live content; a real 120-push run records
  `[..., 98, 99, "… +18 more"]` (runner.py appends the sentinel string
  `"… +" + str(n) + " more"` INSIDE the recorded array).
  `parseInstanceAttr` JSON-parses the bracket content fine today, so the sentinel
  would currently DRAW as a phantom 101st slot — already wrong today for
  >100-item runs; this design removes that too.
- The hidden side is always the TOP (first-of-content policy), so any
  "… +N more" chip belongs visually at the top of the figure. In `.sstack`
  (column-reverse) the visually-top element is the LAST DOM child.
- `#stackBody` already has `overflow: auto` — vertical scrolling works as-is;
  `els.stackBody.scrollTop = 0` pins the visual top (newest item) at rest.
- The sentinel count is a recorded fact: `total = drawn.length + more`.

## Grilled decisions (user answered "Yes" to all six)

1. **Growth is uncapped app-side.** Draw EVERY recorded item past 8. The tracer's
   own 100-item cap is the only ceiling; no new app-side draw limit.
2. **≤8 stays byte-exact.** A figure with ≤8 items keeps today's exact figure —
   always 8 slots with dashed empties above. Only >8 grows.
3. **No filler once grown.** When a figure exceeds 8 slots it drops the empty
   filler slots — height becomes exactly the content height.
4. **Honest past the tracer cap.** When the recorded snapshot carries the
   sentinel, draw the 100 recorded items and render ONE distinct cap-chip above
   the contents: `… +N more — tracer records the first 100`; the strip's size
   token becomes `size: <drawn+more> (tracer-capped)`. The sentinel never draws
   as a slot.
5. **Multi-instance grows independently.** Each figure applies the identical
   rules on its own data (own growth, own chip, own capped strip). The
   side-by-side row keeps `align-items: flex-end`; a tall figure scrolls the
   pane vertically.
6. **`STACK_VIS_CAP = 8` keeps its name** as the minimum slot count (floor —
   exact today's figure for small stacks); comment updated; no new constants.

## Implementation shape

- New shared helper `splitTrailerMore(cells)`: if the last cell value matches
  `/^… \+\d+ more$/`, split off `{ drawn, more }`; otherwise `{ drawn: cells,
  more: 0 }`. Used by both the solo and multi paths.
- Unified slot loop (solo and per-figure): `slotRows =
  Math.max(STACK_VIS_CAP, drawn.length)`; every row indexes
  `cellIdx = (slotRows-1) - row`; rows with `cellIdx >= drawn.length` draw the
  dashed empty slot. For `drawn.length <= 8` this reduces to exactly today's
  firstFilledRow arithmetic → byte-identical HTML for ≤8 sizes.
- Cap-chip when `more > 0`: `<div class="sbox-cap">… +N more — tracer records
  the first 100</div>` as the LAST child of that figure's `.sstack` (visually
  top in column-reverse).
- Strips: the size token appends ` (tracer-capped)` only when `more > 0`; the
  `(empty)/has items` fork and everything else unchanged. `pop()` semantics need
  no separate handling: cells are recomputed per step from the recorded
  self snapshot, so shrinking figures naturally re-fill filler slots as they
  cross back below 8.
- CSS: only a new `.sbox-cap` block (amber chip, mono 12px, 180px to match
  slots). `#stackBody` overflow untouched.

## Verification

- New growth sim over the real 120-push trace (`viz_stack_overflow.json`):
  sentinel not drawn as a slot, chip text exact, strip
  `size: 118 (tracer-capped)`, order 0..99 bottom→top, and an exact rewind
  comparison against an 8-slot trace (byte-identical HTML).
- Existing solo (23 checks) and multi (16 checks) sims stay green unchanged —
  they carry ≤8 traces, proving the frozen-byte-exact guarantee.
- `stack.js` byte-compiles (`node --check`); `runner.py` remains untouched
  (`ast.parse` guard); DSA audit extended (+4 growth checks).
