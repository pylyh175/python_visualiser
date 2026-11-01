# Tab indents the selection — 2026-11-02

## Problem

Plain **Tab** with highlighted code replaces the entire selection with 4 spaces
(the else branch of the keydown handler), so a highlighted block gets wiped.
**Shift+Tab** already outdents every selected line, so plain Tab should indent
every selected line instead — symmetric block editing.

## Decisions (grilled Q1–Q4, all yes)

1. **Q1** — mirror the Shift+Tab block logic exactly: Tab indents every line
   the selection touches (first line through last).
2. **Q2** — even a partial selection on one line indents that line from its
   start (VS Code semantics), rather than inserting at the caret.
3. **Q3** — the selection stays live after indenting and covers the indented
   block, so repeated Tab presses stack 4 spaces per press (same `offset`
   bookkeeping as the outdent branch).
4. **Q4** — everything else unchanged: Tab with no selection still inserts 4
   spaces at the caret; Shift+Tab still outdents; locked editor still ignores
   Tab entirely.

## Design

`main.js` keydown Tab handler, non-shift branch only:

- If `start === end` (no selection): unchanged 4-space insert.
- Else: compute `lineStart`/`blockEnd` exactly as the Shift+Tab branch does
  (`lastIndexOf('\n', start - 1) + 1`, `indexOf('\n', end)`), prepend `INDENT`
  to each line, splice back, and shift the selection by `INDENT.length` on the
  first line and `4 × lines` at the end so the original text stays selected.

No extractor/undo changes: the existing direct-value splice pattern (used by
both Tab branches and Backspace) is kept; `renderEditor` + `syncScroll` +
`scheduleCaretFollow` follow as in the sibling branches.

## Verification

- `node --check main.js`.
- New tab-indent sim running the REAL handler (extracted, stubbed DOM): no
  selection, single-line partial selection, multi-line block, stacking,
  end-at-newline edge, locked editor untouched.
- Existing editor audit + enter sims re-run.
