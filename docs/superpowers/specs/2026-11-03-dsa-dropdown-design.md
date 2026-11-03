# DSA selection dropdown — 2026-11-03

## Problem

The visualiser runs arbitrary Python through the tracer, and the recursion part
(Output ↔ Recursion tabs) is fully automatic, but there is no place where a user
chooses what kind of code they're visualising — nor a slot where future DSA
visualiser modules can hook in.

## Decisions (grilled Q1–Q5, all yes)

1. **Q1 — placement**: a compact `<select>` in the editor toolbar, next to
   ✎ Edit before the hint. Not its own panel (wastes vertical editor space for
   a control that is inert today), not the page header (app chrome ≠ run mode).
2. **Q2 — behavior today**: selectable but inert. Choosing a planned DSA only
   shows a status-pill hint ("Stack visualisation is planned — runs as
   usual"); ▶ Visualize stays enabled, code runs via the normal tracer.
   No sample templates, no blocking. Selecting any option can never change run
   behavior.
3. **Q3 — recursion untouched**: the Output↔Recursion tabs, auto-switch, and
   tree stay automatic and independent of the dropdown. "Recursion" is simply
   the default option in the list — not a mode that gates anything.
4. **Q4 — registry-driven menu**: `DSA_MODES` array in `main.js`
   (`{id, label, status: 'ready'|'planned'}`); `index.html` ships an empty
   `<select id="dsaMode">` and `main.js` generates the options at startup.
   Future DSA = one array entry today; later the same entry can register a
   real visualiser module against its id.
5. **Q5 — minor behaviors**: last selection persists across reloads via
   localStorage (`vizDsaMode`, validated against known ids, default
   `recursion`); the dropdown disables while a run is in flight (same mid-run
   discipline as the Edit button); planned entries carry a "(planned)" label
   suffix until implemented, no suffix for ready ones.

## Implementation

- `index.html`: `<select id="dsaMode" class="dsa-select"></select>` in
  `#toolbar`; options live nowhere in HTML.
- `main.js`: `DSA_MODES` constant; `els.dsaMode`; `buildDsaMenu()` (populate
  + restore saved mode on init), change handler (persist + planned hint,
  suppressed while a run is in flight); `syncVisualizeEnabled()` also toggles
  `els.dsaMode.disabled = runInProgress`.
- Tracer (`runner.py`), run flow, tabs, tree: untouched.

## Verification

- `node --check main.js`.
- Source audit sim: options generated from `DSA_MODES` only (no hardcoded
  options); ids unique; save/load round-trip with validation (unknown saved id
  falls back to `recursion`); planned hint suppressed mid-run; dropdown
  disabled run-in-flight and re-enabled after; recursion code paths untouched
  (no changes swapped into `chainIsRecursive`/tab logic).
- Full regression sweep of the existing function-extraction sims.
- Browser test: dropdown present with 4 entries, Recursion default; picking
  Stack shows the planned hint; reload keeps the choice; recursion runs behave
  exactly as before for whichever option is active.
