# Class cards and call facts in the variables panel

Date: 2026-11-26 (grilled Q1–Q12)

## Problem

A class showed as a long `Stack { __init__(max_capacity), clear(), … }` string
plus one row per method (`push = "Stack.push(self, item)"`). Every method was
listed twice, and the panel showed only text — nothing about how the code used
the class.

## Decisions

| Q | Decision |
|---|----------|
| Q1 | Each class declared in the source renders as ONE card: header `class Stack`, then a row per member. Method rows read `push(item)` (no `Stack.`, no `self`). Card is open by default. |
| Q2 | Method rows show `×N` calls so far, `→ last return` (omitted when `None`), and a running marker. |
| Q3 | Header lists the variables holding instances: `class Stack · instances: s` (`self` excluded). |
| Q4 | Every method in the class body is listed, `__init__` and other dunders included. |
| Q5 | No click-to-jump to the definition (out of scope). |
| Q6 | Top-level functions get the same call facts on their own row (no card). |
| Q7 | While the class body runs, a provisional `class Stack (defining…)` card holds the members defined so far. |
| Q8 | Every method with a live frame is marked: the innermost `▶ running` (green), its callers `waiting` (orange). |
| Q9 | A call that ended in an exception shows `✗ OverflowError` in the last-return slot. |
| Q10 | Counts and last returns are class totals across all instances. |
| Q11 | Class attributes appear inside the card, above the methods, with LIVE values. |
| Q12 | The card cannot be folded. |

Assumed: long return values truncate to 24 characters (full value in the
tooltip), matching the memory boxes.

## Data

`runner.py`:
- `result.defs` (run-level, from the source AST):
  `fns: {qualname: {line, sig}}` — `line` equals the frame's `co_firstlineno`
  (first decorator line when decorated), `sig` drops a leading `self`/`cls`;
  `classAttrs: {classQualname: [names]}` — names assigned directly in the body.
- `step.exc: [{id, exc}]` — frames that exited by exception, attached to the
  next recorded step (separate from `ret`, so the recursion tree and stack
  panel are untouched).
- `sticky` (class-body names) now stores `(owner class, value)`; once the
  class exists, plain class attributes are read live from it
  (`__viz_sticky_items`).

`src/panels/variables.js`: `classLayout` places cards, `classCard` renders one,
`callStats` derives counts / last outcome / live markers from steps `0..idx`
(rewind stays exact), matching frames to rows by `sig` = `defs.fns[qn].line`.
`<module>` frames are skipped (their `sig` is 1 and would collide with a def
on line 1).

## Known limits

- Rows are matched to a card by name, so a module variable sharing a class
  attribute or method name folds into the card (code comment `shortcut:`).
- Classes not declared in the source (imports) keep the plain text row.
- Booleans in `→` facts render as `true`/`false`, like the rest of the panel
  (`fmtValue`).
