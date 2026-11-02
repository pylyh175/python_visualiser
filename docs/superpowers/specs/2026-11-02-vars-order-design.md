# Variables panel: first-appearance ordering — 2026-11-02

## Problem

`__viz_locals` builds each snapshot **scope-layered** (innermost frame's locals
first, then sticky class names, then outer/module locals). Inside a function,
its new variables therefore appear *above* the module variables shown before
them — and on return, the layout snaps back. Real trace evidence:

```
step 4 frame=add  locals=['v', 'total', 'n1', 'add']
step 8 frame=<module> locals=['total', 'n1', 'add', 'r']
```

Users expect a stable, append-only layout: newly created variables at the
bottom, existing ones never reordering.

## Decisions (grilled Q1–Q4, all yes)

1. **Q1** — the panel is ordered by **first appearance in the trace**: a
   name's slot is where it was first displayed and never changes; new names
   always land at the bottom, even when born in a nested call. (Replaces the
   scope-layered *display* layout; values still follow today's innermost-wins
   shadowing.)
2. **Q2** — slots derive from **steps 0..idx only** (no future knowledge):
   forward steps extend the sequence (prefix-stable); any rewind reproduces
   the earlier layout exactly (ordering is a pure function of idx).
3. **Q3** — **one slot per displayed name** — scopes sharing a name still show
   a single row (innermost value, as today); only the ordering changes.
4. **Q4** — `runner.py` untouched (snapshot content, innermost-wins, MAX_VARS
   "…" marker); sticky class-body names participate like any other name. This
   is purely a `main.js` rendering rule.

Structural guarantee: at any step, a just-born name's slot is strictly greater
than every currently visible name's slot, so it always lands bottom.

## Implementation (`main.js` only)

`varsOrder(current)` — walk steps 0..idx, first-seen order across snapshots
(step order, then each snapshot's own dict order); return the current
snapshot's keys sorted by slot (unseen keys trail). `renderVars()` uses it;
`fmtValue`, escape handling, and the empty states are untouched.

## Verification

- CPython probe over the real `__viz_run` saving JSONs: function-intro
  variables, function-before-later-module-vars, the user's stack program
  (sticky methods), a twice-called function (disappear/re-entry), and a
  70-globals MAX_VARS-capped run.
- Node sim applying the real extracted `varsOrder`/`renderVars` to those
  JSONs: forward stability (common names keep relative order at every step),
  new-name-at-bottom, rewind exactness, sticky slots, cap marker stays.
- Full JS sims regression sweep.
