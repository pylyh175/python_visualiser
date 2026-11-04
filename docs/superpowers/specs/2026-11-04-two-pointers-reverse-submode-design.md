# Two Pointers sub-mode visualisers — Reverse Array/String (design)

Date: 2026-11-04
Status: grilled + agreed (all four recommendations accepted)
Predecessors: 2026-11-03-dsa-dropdown-design.md, 2026-11-03-dsa-mode-gating-design.md,
2026-11-03-stack-visualiser-design.md, 2026-11-04 hierarchical hover dropdown + id-based dispatch

## Scope

The dropdown's Two Pointers submenu gains three registry entries (user-added in
config.js): `two-pointers.reverse-array-string`, `two-pointers.valid-palindrome`,
`two-pointers.container-with-most-water`. This session implements **Reverse
Array/String only**; the other two keep working through the generic Two Pointers
tab until their own sessions (Q4).

## Visualiser extension: Reverse Array/String tab (Q1)

- New tab family member driven by the **id**: the tab bar shows
  `Output | Reverse Array/String` precisely when
  `state.dsaMode === 'two-pointers.reverse-array-string'`; the generic
  `Two Pointers` tab is hidden in that case and returns for any other
  two-pointers selection.
- Mode dispatch continues through `dsaFamily(state.dsaMode)` + the exact id;
  no label text is ever matched (2026-11-04 id-dispatch decision).
- New static markup: `#tabReverse` button + `#reverseBody` body, same patterns
  as the existing tab family. New module `src/panels/reverse.js` mirrors
  `twoPointers.js` structure: `renderReversePanel()` (visibility) +
  `renderReverse()` (content) + auto-advance reusing the factory
  `detectTwoPointers()` now exported from `twoPointers.js`.

## Animation from ground truth (Q2)

- The tracer already snapshots every variable per step; runner.py stays
  untouched. Rendered frames are the recorded truth: the array strip shows each
  step's actual values, with blue `left` / red `right` cursor labels
  (`left=N → value`).
- Swap flash: when the current step's snapshot of the detected array differs
  element-wise from the previous step's snapshot of the same variable, the
  changed cells get a `.tp-swap` pulse. Swap detection is ground-truth value
  comparison — no source parsing, no invented states.
- The pulse fires per distinct step (module-level last-rendered-step guard), so
  steady re-renders of the same step don't strobe.

## Honest failure (Q3)

If detection fails (no two pointer vars over an array-like local), the Reverse
body shows only a muted message — "No reverse pattern detected — needs two
pointers swapping a sequence" — mirroring the Stack tab's
"No Stack found — needs a class with push() and pop()." No fake animation, no
fallback to the generic visual, `state.idx` untouched except by the existing
`!userTab` auto-advance pattern (navigate forward to the first detected step).

## Auto-switch (Q1 wording)

Stack-style one-time auto-switch: on the first render where the reverse pattern
is detected and the user has not manually chosen a tab this run
(`!state.userTab`, `!state.reverseAnnounced`), `state.outTab = 'reverse'` and
`state.reverseAnnounced = true`. Reset sites match `stackAnnounced`
(state.js initial, runner.js run start, output.js family switch, shared.js
hideOutTabsAll).

## Run flow

Unchanged and already correct: the runner executes the whole program (the
example's `print(nums)` output is recorded), successful runs land on the final
step so the Output tab holds the reversed-array print, and the Reverse tab
auto-switches to the final reversed frame.

## outFam semantics change

`state.outFam` previously stored the family string; it now stores the **full
current DSA id**, so switching between the generic `two-pointers` and a
sub-mode also resets the manual tab choice (without it, tab 'two-pointers'
could stay selected with its body hidden — an invisible panel).

## Verification

node --check on every touched module; DSA audit extended with sub-mode,
tab-markup, swap-flash and honest-failure checks; full regression sweep
(16 files) green; runner.py byte-identical (audit re-checks).
