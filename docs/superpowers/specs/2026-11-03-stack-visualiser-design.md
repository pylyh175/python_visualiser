# Stack visualiser — 2026-11-03

## Intent

Users write their own Python code containing a Stack class; the tool
detects the stack from the code alone, follows the ops the methods perform,
and draws a step-synchronised animation (push/pop/peek/state) in a third
output-panel tab. First DSA module on the path to queues, linked lists,
sorting, etc.

## Goals / non-goals

- Goals: works with *users' own* implementations; exact rewind like the rest
  of the app; visible feedback for ops as they execute.
- Non-goals (this feature): no enforcement of code style beyond the name
  contract; no multi-stack lanes; no edits to `runner.py`; no template
  loading wired into the UI.

## Approaches considered

1. **Strict fixed template** — exact method names only. Rejected: defeats
   "users write their own DSA code"; even the listed names mix Pythonic and
   camelCase conventions, so strictness would fail real code.
2. **Open fuzzy heuristics** — matches anything stack-ish. Rejected: false
   positives draw confident-but-wrong animations, which is worse than no
   detection.
3. **Curated vocabulary (chosen, contract C)** — small synonym table,
   `push` + `pop` required, optional ops degrade gracefully (see Detection).
4. **Per-step storage dumps instrumented into `runner.py`** — rejected
   (approach fork; the user picked the frontend op history): couples every
   future DSA to runner layer changes and breaks the untouched-runner rule.

## Contract C — curate names, tolerate variants

A user-defined class qualifies when it contains **`push`** and **`pop`**.
Optional ops (accent-less degrade): `peek` (`top`), emptiness
(`is_empty`, `isEmpty`, `__bool__`), size (`size`, `length`, `__len__`),
`__init__`. Extra methods and helpers are
ignored, never an error. The canonical template (shipped in the docs only,
not wired into the UI):

```python
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)     # element joins at the top

    def pop(self):
        if not self.items:
            return None
        return self.items.pop()     # element leaves from the top

    def peek(self):
        return self.items[-1] if self.items else None

    def is_empty(self):
        return not self.items

    def size(self):
        return len(self.items)
```

## Approach (user-chosen): op history in the frontend

1. **Scan (per step 0):** text-scan the editor source for
   user-defined classes; the first class block containing `push` + `pop`
   is the Stack class; record each contract method's `def` line number.
2. **Match (per step k):** runner frames already carry `sig` =
   `co_firstlineno`, so a frame whose `sig` equals a recorded `def` line
   belongs to that contract method. The pushed value comes from that
   method frame's recorded locals; popped values from its `ret` entry.
3. **State model:** stack content = pushes minus pops in call order;
   the visual at step k is that history replayed to step k (same
   derivation style as `treeData` → exact rewind is free).
4. **The panel shows what the METHODS did**, not storage internals — a
   list, deque, or node-chain backing all look identical. Direct
   private-storage hacks animate per recorded ops, not per hack.

## Instance selection

One stack per lane: the **first-created instance whose class matched**
(deterministic; its ops are the recorded frames of the contract methods in
first-call order). If a run creates more than one matching instance, the
panel notes "N stacks detected — showing the first"; multi-lane is later.

## Visual semantics (calls 1–4 of my proposal; updated for the visual stack)

- Fixed `STACK_VIS_CAP = 8` slots, always rendered bottom-up; empty slots
  are dashed hollow boxes, filled slots are solid boxes with the pushed
  value centred.
- `push`: a new filled box appears at the bottom with a **fade+scale-in**
  animation (the step entering the push body).
- `pop`: the top filled box **fades+scales out** (rendered one extra frame
  so CSS can animate the departure; value labelled once the pop frame's
  `return` step plays).
- `peek`: the top filled box gets a persistent **amber outline** while the
  current step is inside a `peek` frame.
- `isEmpty`/`size`: a persistent state strip under the figure: computed
  size, `(empty)` badge, last return (e.g. `last: pop() → true`), instance
  note.
- Tab `Stack` in the output panel, only when Stack mode is chosen; a stack
  is detected; mode gating decides which tab family shows.

## Error path (call 5)

When the Stack mode is active and a trace exists but no qualifying stack
class was found, the output panel appends a muted (non-error) info line:
"No Stack found — needs a class with push() and pop()."

## Verification plan

- `node --check main.js`; Python-side sanity on runner (untouched).
- New audit sim: source-level checks (registry picks the module, scan
  pipeline matches sigs, rewind derived state, error path, caps).
- New extraction sim: real `runner.py` trace of a documented stack program
  (list backing AND a deque backing) replayed through the extracted
  scanner/renderer; rewind exactness; contract variants and the
  no-detection path.
- Browser test via start.bat: the fiber paste, push/pop/peek rounds,
  rewind behavior, empty/size strip, first-instance note with two stacks.

## Left to the builder (defaults, listed so reviewer can veto)

- Scan is a lightweight regex/class-block parser in `main.js` (no JS AST
  library); dynamic-built or renamed classes (aliases) won't be seen —
  acceptable for v1, honest error path covers it.
- Visual cap on shown cells mirrors the container cap (100); drawn figure
  cap `STACK_VIS_CAP = 8` is a separate visual limit.
- Styling follows the existing tree-row styling vocabulary (orange top,
  amber peek, dark terminal palette).

## Implementation record (as built)

- `main.js`: `STACK_CONTRACT` synonym table; `scanStackSource()` (block
  parser → contract map of def-line numbers + push param name, run from the
  ▶ Visualize handler on the exact code being executed);
  `stackOpKey()` pins frames to contract methods by `sig` (= co_firstlineno,
  probe-verified); `collectStackOps()` dedupes by frame id (first
  appearance) and resolves pop/peek values from `ret`; `renderStack()`
  derives the visual stack:
  - Fixed `STACK_VIS_CAP = 8` slots, bottom-up, always rendered.
  - Filled slots = solid boxes with content; empty = dashed hollow boxes.
  - Enter animation (push): new box fades+scales in at the bottom.
  - Leave animation (pop): top box fades+scales out (rendered one extra
    frame so CSS can animate it).
  - Peek highlight: top filled box gets amber outline while inside a `peek`
    frame.
  - Auto-switch at the first push/pop; state strip below (size, empty
    badge, last return, instance note).
- Panel routing: `renderOutPanel()` shows one tab family per mode —
  Recursion → Output|Recursion (tree), Stack → Output|Stack, blank/none →
  plain output; a family switch on a live trace resets the manual tab
  choice. `index.html` gains the hidden Stack tab + `#stackBody`;
  `style.css` the `.sstack` flex column, `.sbox` boxes, enter/leave/peek
  animations, and the muted `.info` class.
- `runner.py` untouched (verified by audit + probe).
- Verified: stack sim 22/22 over real two-stack and init-only traces
  (scanner variants/synonyms/rejections, sig matching counts, push values
  from args, pop values from ret, rewind bit-exactness, peek outline,
  enter/leave classes, auto-switch discipline, init-only case); full
  regression sweep green; `node --check` OK.

## Deviation from the design (probed, accepted)

The design said "first-created instance whose class matched", but the
tracer's object snapshots are identity-free (`Stack instance { items: [...] }`
has no address — deliberate runner design), so ops cannot be attributed to
one specific instance without touching `runner.py`. As built: all matched
ops are replayed in call order in one lane, and when a run creates more than
one instance (counted from `__init__` frames) the strip notes
"N Stack instances — ops combined in call order". Single-instance runs —
the documented case — are exactly what the design promised.

## Visual stack addendum (grilled Q1–Q5, all yes)

- Medium: HTML/CSS boxes (not Canvas) — restyled from existing cells, DOM-
  driven via existing step re-render.
- Fixed `STACK_VIS_CAP = 8` visible slots; empty slots render as dashed
  hollow boxes; items fill bottom-up.
- Animations: push = enter (fade+scale in), pop = leave (fade+scale out,
  one extra frame), peek = persistent amber outline on top box.
- Growth: bottom-up (matches the ASCII example).
- State strip kept below the figure (unchanged).
