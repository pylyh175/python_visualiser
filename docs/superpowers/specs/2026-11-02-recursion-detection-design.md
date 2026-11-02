# Recursion tab detection: real re-entry only — 2026-11-02

## Problem

`renderTree()` flagged "recursion" with `steps.some(s => s.stack.length >= 2)` —
**any nested user call**. A standard stack implementation triggers it: the
module frame calls methods (`st.size`, `st.pop`, …), which are user-code frames
at chain depth 2, so the Output/Recursion tabs appeared for non-recursive code.

## Decisions (grilled Q1–Q4, all yes)

1. **Q1** — the tab appears only when a recorded chain contains the same
   function's *code* more than once: direct re-entry (`f→f`) or indirect
   (`f→g→f`). Plain nesting (module → method) never counts.
2. **Q2** — frames are matched by name **plus `f_code.co_firstlineno`** (the
   runner adds a `sig` field to each chain entry). Name-only matching would
   falsely flag a module-level function and a same-named method sharing one
   chain (e.g. a global `size(x)` calling `st.size(s)`).
3. **Q3** — visibility semantics stay as today: decided over the whole run
   (a run that will recurse shows the tab from step 1), with the one-time
   auto-switch firing only when the *current* chain first contains the
   re-entry; manual tab stickiness unchanged.
4. **Q4** — non-recursive nesting hides the tabs entirely (Output-only);
   tree content, capping, and rendering for real recursion are unchanged.

## Design

- `runner.py`: both chain-build sites (line events, return steps) append
  `"sig": fr.f_code.co_firstlineno` to each chain entry — cheap, exact,
  per-code-object identity within the single traced file.
- `main.js`: new `chainIsRecursive(chain)` — any two distinct entries in one
  chain sharing `fn` && `sig`; `renderTree()` replaces both conditions:
  `recursive = steps.some(s => chainIsRecursive(s.stack || []))` and the
  auto-switch trigger `chainIsRecursive(steps[idx].stack || [])`.
  (`renderTree` was moved to `renderTreeTab` context by hand edits; the
  conditions live wherever the tab visibility block now is.)

## Verification

- `python` probe over local CPython running the real `__viz_run`: the user's
  exact stack program (expect **no** recursion flags), fib (expect yes),
  factorial, indirect recursion (mutual `a↔b`), the global-vs-method name
  collision (expect no), and a syntax-error run for robustness.
- Node sim consuming the probe's real step JSONs with the real
  `chainIsRecursive` extracted from `main.js`.
- Full JS sims regression sweep.
