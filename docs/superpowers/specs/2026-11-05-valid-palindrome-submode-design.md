# Two Pointers sub-mode visualisers — Valid Palindrome (design)

Date: 2026-11-05
Status: grilled + agreed (all six recommendations accepted)
Predecessors: 2026-11-04-two-pointers-reverse-submode-design.md (pattern to mirror),
2026-11-04 hierarchical hover dropdown + id-based dispatch

## Scope

`two-pointers.valid-palindrome` (already registered in config.js) gets its own
dedicated tab visualiser, following the Reverse Array/String template: id-keyed
routing, ground-truth-only animation, stack-style auto-switch, honest failure.
`container-with-most-water` stays on the generic Two Pointers tab until its own
session.

## Tab structure (Q1)

Tab bar becomes `Output | Valid Palindrome` exactly when
`state.dsaMode === 'two-pointers.valid-palindrome'`. The generic Two Pointers
tab AND the Reverse tab are both hidden in that case — the three are mutually
exclusive per problem. `state.outTab` gains `'palindrome'`; routing in
`output.js` mirrors the `isReverse` branch with an `isPalindrome` branch keyed
on the id (never a label). New markup `#tabPalindrome` + `#palindromeBody`; new
`src/panels/palindrome.js` mirrors `reverse.js` (renderPalindromePanel →
renderPalindrome → content, then visibility follows the possibly-updated
state).

## Detection (Q6 wrinkle)

`detectTwoPointers` only matches array-likes (JS strings are primitives and
fall through `isArrayLike`) — the probe confirmed string locals serialize as
plain JS strings. New exported helper `detectPalindrome(locals)` in
`palindrome.js`: a string local + two integer index vars forming one of the
SAME name pairs — `PTR_NAME_PAIRS` gets exported from `twoPointers.js` so the
naming heuristics stay unified (no forked pairs). Returns
`{ sName, sValue, leftName, rightName, leftIdx, rightIdx }` or null. Module
frames (no strings) → null, exactly like Reverse.

## Animation from ground truth (Q2)

- Char cells: each recorded character of the CURRENT call's `s` is its own
  cell with its index (whole-string indexing kept even when windowed).
- Blue `left` / red `right` cursor labels with values (`left=3 → 'e'`).
- Per-step comparison badge: `s[left]` vs `s[right]` colored match/mismatch,
  computed purely by comparing recorded values (`toLowerCase` equality — the
  client-side transcription of the code's `.lower()`). Out-of-range pointers →
  neutral badge.
- Mismatch flash: amber `.tp-swap`-style pulse on the two compared cells when
  the current step's comparison is a mismatch, gated by the same module-level
  `lastRenderedStep` strobe guard as Reverse.

## Presentation derived from values (Q3)

Non-alphanumeric characters render dimmed (`.pal-dim`, `/[a-z0-9]/i` over the
recorded char) — presentation over ground truth, like `fmtValue`; no invented
skip animation.

## Windowing (Q4)

Runner caps strings at 500 chars. When `s.length <= 40` the strip renders
whole; otherwise TWO windows — one around `left`, one around `right` (12 cells
each), separated by a muted `… N chars hidden …` label, windows merged when
they overlap/abut. Correct global indexing always shown.

## Multiple calls (Q5)

No invented verdicts: the three example calls flow by per-step as recorded
(each with its own `s`/pointers); prints stay in the Output tab. Auto-advance
jumps to the first detected step (first call), same pattern as Reverse.

## Honest failure + auto-switch (Q6)

Stack/Reverse pattern: one-time auto-switch on first detection
(`!state.userTab && !state.palindromeAnnounced`), announced flag reset at the
same sites as `reverseAnnounced` (state.js init, runner.js resetRun, output.js
family switch, shared.js hideOutTabsAll). Else muted message:
"No palindrome-check pattern detected — needs two pointers moving over a
sequence." No fake animation, no navigation when nothing is found.

## Follow-up grill round (2026-11-05, all three accepted — probe-exposed issue)

The probe showed many recorded steps are skip-while TESTS where the pointers
sit on characters the code has not compared yet (e.g. `left` on `'a'`, `right`
still on `'r'` mid-skip). A purely value-based mismatch comparison yells
"mismatch" there — mislabeling dozens of steps of calls that end True. Fix:

- Badge is value-only and factual: `—` when a pointer is on a non-alphanumeric
  (skipping), green `=` when equal case-insensitively, neutral `≠` when the
  current pair differs but nothing has been decided yet.
- The amber mismatch FLASH is return-gated: it fires only when the current
  step's call has a RECORDED `ret === false` (runner records per-return values
  keyed by frame id) AND the on-screen pair equals that call's terminating
  pair (the left/right of the call's last recorded step). Never invented, never
  predicted.
- Symmetric True praise (Q3): a green chip "✓ call returned True" when the
  current call's recorded verdict is True and the pointers have crossed;
  amber chip "✗ call returned False" at the terminating pair alongside the
  flash. All whole-trace lookups are recorded facts (precedent: recursion.js
  whole-run verdicts), not source parsing.

## Verification

node --check every touched module; `viz_palindrome_probe.py` (user's exact
example + counterexample line + single-string call through real
`runner.__viz_run`) + `viz_palindrome_sim.js` against the REAL
palindrome.js/twoPointers.js sources (detection windows, skip-skim pointer
jumps, match/mismatch badge vs ground-truth comparison, mismatch cell
identification, strobe guard, windowed long string, honest failure); DSA audit
extended with the palindrome mirror checks; full regression sweep green;
runner.py byte-untouched (audit re-checks).
