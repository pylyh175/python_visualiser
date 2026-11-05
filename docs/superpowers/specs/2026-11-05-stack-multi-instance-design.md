# Multi-instance Stack visualiser design (grilled 2026-11-05)

## Problem

A run (`class Stack` + `class Stack`-style) that creates **more than one
instance of the same stack class** shows only one figure. Root-caused:

1. `scanStackSource` records ONE `instanceVar` — the first `X = ClassName(`
   assignment (`myStack`) — and `renderStack` draws only `locals[instanceVar]`.
2. `collectStackOps` merges **all** instances' calls (same class ⇒ same
   `sig`) into one op stream — the strip's own note, "N Stack instances — ops
   combined in call order", says so.
3. Ground truth is impossible from today's trace alone: `self` serialises as
   a rendered string (`"Stack instance { stack: [...] }"`), instances of the
   same class can produce byte-identical strings mid-run, and method frames
   share `sig`. No recorded fact distinguishes `myStack` from `anotherStack`.

## Grill round (all seven "yes")

1. **Additive runner identity field**: each user-frame chain entry gains
   `"oid": N` — a stable small integer per instance (an `id(self)` slot map,
   weakref-guarded so a recycled `id()` can never merge two objects;
   `__weakref__`-less classes degrade to the raw key). Nothing else in
   `runner.py` changes; every existing consumer ignores the extra field.
   The standing "runner untouched" rule is about not *faking* execution;
   `oid` records a genuine fact of execution.
2. **Ordinal labels only**: figures are labelled "Stack #1", "Stack #2", …
   in first-recorded construction order. Variable-name recovery from module
   locals is deliberately NOT attempted (name↔snapshot matching is
   ambiguous when snapshots are identical — e.g. both `["A"]`).
3. **Side-by-side figures**: each instance is one complete figure (existing
   8-slot `.sstack` look, per-figure enter/leave/peek animations), laid out
   in a horizontal wrap-row.
4. **Sticky last-recorded truth**: while one of the instance's calls is the
   recorded top frame, the figure live-updates from the per-step `self`
   snapshot; between calls it keeps its **last recorded** snapshot. Figures
   are re-derived from steps 0..idx each render — rewind exact, nothing
   mutated. First appearance: its first recorded frame (the `__init__`
   call).
5. **Solo look unchanged**: with exactly one instance, the renderer takes the
   existing path byte-for-byte (no ordinal label, same strip items) — the
   committed single-stack behaviour and its 23-check sim stay intact; the
   multi path engages from the second instance on. Non-oid traces (should
   not occur after the runner change) also fall back to the legacy path.
6. **Four-figure cap**: drawn figures cap at 4 (the `STACK_VIS_CAP`
   analogue); further instances collapse into a muted `… +N more` chip.
7. **Per-figure strip**: each figure shows only its own facts — `size: n ·
   last: pop() → 'C'` from that instance's own recorded returns. The merged
   "ops combined in call order" note dies with the merged stream.

## Implementation shape

- `runner.py`: `obj_oids`/`oid_count` beside `frames`; helper
  `__viz_obj_oid(obj)`; each chain-build site adds `oid` when the frame has
  a `self` that is a user-class instance (builtins/modules/functions
  excluded). Both the line-event chain (push/pop steps) and the return-event
  chain carry it.
- `stack.js`: new `collectStackFigures(upTo, det)` (ordered per oid; op
  records deduped per frame id; content = latest top-frame `self` snapshot;
  per-figure ret resolution). `renderStack` branches to
  `renderStackMulti(figs, det)` when >1 figure; the solo code path is
  untouched. Animation/cell ids derive from each figure's own frame ids
  (push/pop replay), contents overwrite from `parseInstanceAttr(selfStr)`.
- `style.css`: `.sfigures` wrap-row, `.sfig` column, `.sfig-label`,
  `.sfig-more`.

## Known limitation (recorded, honest)

The multi-figure mode draws each instance's internal attribute snapshot
(`self.stack`), so it fits the attribute-based style. The exam-style shape
where the stack is a *separate list argument* (methods `(self, st, data)`,
state in a global list) constructs per-instance figures with empty
attribute parsing — such programs with >1 instance degrade showing their
recorded sizes still (contents may read empty when the state is not an
attribute of `self`). Solo instances of that style keep the exact legacy
visual. If it ever matters, a per-figure op-replay fallback can be added.

## Verification

Re-run the real-runner probe on the user's two-instance example (oid fields
present, one per instance, stable); `node --check` all touched modules; a
new multi-instance sim over the real trace (identity, ordering, content
ownership, sticky state, rewind exactness, cap chip, solo fallback); the
23-check single-instance sim unchanged; full battery; audit extended;
`!/dsaMode|DSA_MODES/` still absent from `runner.py`.
