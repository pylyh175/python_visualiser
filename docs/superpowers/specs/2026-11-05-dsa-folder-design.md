# DSA folder design — menu reorganisation (grilled 2026-11-05)

## Problem

The user wants a "DSA" (Data Structure Algorithm) entry whose submenu holds
Stack, Queue and Linked List, using the same submenu mechanism as
`two-pointers`. All three already exist as **top-level** registry entries
(Stack with a working visualiser, Queue/Linked List `planned` placeholders),
so the request is a menu reorganisation, not new modes.

## Grill round (all five answers "yes")

1. **Move, not duplicate** — the three entries leave the top level; one
   `DSA` row carries them as sub-modes (same mechanism as Two Pointers).
2. **Keep the existing ids** — `stack` / `queue` / `linked-list` are NOT
   renamed to dot notation. `dsaFamily('stack')` must keep returning
   `'stack'` because the Stack visualiser tab, persistence and detection all
   gate on that family. The folder is display grouping only. This differs
   deliberately from `two-pointers.*`, where the parent IS the family.
3. **The DSA row is a pure folder** — hover/focus expands its submenu,
   clicking the row does nothing. (For `two-pointers` the parent row stays
   selectable because that parent is a real generic mode — 2026-11-04 Q4b —
   so the distinction is expressed by a `folder: true` registry flag.)
4. **Everything else stays put** — `(none)`, Recursion and Two Pointers
   (with its five sub-modes) unchanged; final order:
   `(none)`, DSA (› Stack / Queue / Linked List), Recursion, Two Pointers.
5. **Queue / Linked List stay `planned`** — selectable placeholders, with
   the `(planned)` suffix now also shown on sub-mode leaves inside the
   submenu (the old suffix logic only covered top-level rows).

## Implementation notes

- `config.js`: `DSA_MODES` gains `{ id: 'dsa', label: 'DSA', folder: true,
  subModes: [...] }` in position 2; the three former top-level entries move
  inside it with explicit `status` fields. `dsaEntryById` needs no change
  (flat sub-mode lookup already finds `stack`); `dsaFamily` needs no change.
- `dsa.js`: `buildDsaMenu` skips `dataset.value` for folders (click does
  nothing; `:focus-within` still opens/expands for keyboard users) and adds
  the per-leaf planned suffix when building submenus.
- `style.css`: `.dsa-folder > button` loses the pointer cursor — the row is
  an expander, not an option.
- Breadcrumb comes free: `selectDsaOption` already finds the parent by
  sub-mode id, so selecting Stack renders `DSA › Stack`.
- Verify: `dsaEntryById('stack').id === 'stack'`,
  `dsaFamily('stack') === 'stack'`, breadcrumb `DSA › Stack`.

## Known adjacent quirk (out of scope, parked)

Two Pointers' sub-mode entries carry no `status` field, so selecting e.g.
`two-pointers.two-sum` shows the "visualisation is planned" status hint even
though those modes have working tabs. Left untouched here (the block is the
user's hand-edited region); a separate one-line status pass can fix it later.

## Verification

node --check touched modules; the DSA audit updated (new top-level shape,
folder-not-selectable, per-leaf suffix, functional id-dispatch checks), the
full sim battery green (reverse/palindrome sims also eval the new
DSA_MODES block), and the user's browser check via start.bat.
