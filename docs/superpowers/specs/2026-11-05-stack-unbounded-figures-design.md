# Stack multi-instance: unbounded figures — design (grilled 2026-11-05)

## User report

When users create a lot of Stack instances, the tab collapses everything past the
first 4 (`STACK_FIGURE_CAP`) into a muted `… +N more` chip. Expected: show ALL
stacks in the stack tab.

## Ground-truth facts (gathered before grilling)

- `renderStackMulti` draws `figs.slice(0, STACK_FIGURE_CAP = 4)` and renders
  `<div class="sfig-more">… +N more</div>` for the rest.
- The `.sfigures` row already scrolls horizontally at ANY count (never-stack
  fix, 2026-11-05): `flex-wrap: nowrap; overflow-x: auto`, fixed 180px
  figures with `flex-shrink: 0`. Nothing in the layout depends on the cap.
- Downstream things that PINNED the old behavior: `STACK_FIGURE_CAP` in
  `config.js` (+ import + slice + header comment in `stack.js`), the
  `.sfig-more` CSS block, the multi sim's section 6 ("cap + chip", 6 synthetic
  instances asserting 4 figures + chip), and 3 audit checks
  (config constant, chip text in stack.js, `.sfig-more` CSS).
- Disambiguation: TWO different "… +N more" chips exist. This feature removes
  only the INSTANCE-collapse chip. The per-figure tracer-cap chip
  (`sbox-cap`, "… +N more — tracer records the first 100") is a different
  fact about ONE stack's hidden items past the recorder's 100-item cap and
  stays as designed (dynamic-growth doc Q4).

## Grilled decisions (user answered "Yes" to all four)

1. **Unbounded figures.** Every instance draws as its own full figure — label,
   strip, own dynamic growth — at any count (2, 6, 20…).
2. **Layout rule unchanged.** Side by side, `nowrap`, fixed 180px figures,
   never wrapping into rows; the pane scrolls horizontally arbitrarily far.
3. **Tracer cap chip stays.** Only the instance-collapse chip is removed.
4. **Full cleanup, no dormant code.** `STACK_FIGURE_CAP` deleted from
   `config.js` and `stack.js`; `.sfig-more` CSS deleted; the sim's cap section
   rewritten to pin unbounded rendering; audit checks rewritten to pin the
   absence of the cap + chip.

## Implementation shape

- `config.js`: delete the `STACK_FIGURE_CAP` block (comment + constant).
- `stack.js`: drop it from the import line; delete the `shown`/`moreCount`
  slice + chip push in `renderStackMulti`; map over ALL figures; header
  comment updated (cap reference removed).
- `style.css`: delete the `.sfig-more` rule.
- Multi sim section 6 rewritten: 6 synthetic instances → 6 complete figures,
  every label present (`Stack #5`, `Stack #6`), no `sfig-more` element.
- Byte-exact guarantee: ≤4 instances (like today's two-instance traces) render
  byte-identically — the removed code only ever ran past 4 figures.

## Verification

- Multi sim rewritten section 6 + all existing sections stay green (two real
  instances: labels, own strips, rewind exactness).
- Growth sim unchanged-green (its two-figure checks don't touch the cap).
- Audit: 3 cap pins replaced by pins of the NEW behavior (constant absent from
  config + stack, no `sfig-more` anywhere, `.sfigures`/`.sfig-label` intact).
- Headless Edge probe of a 6-instance real render in real CSS: 6 complete
  figures side by side with a horizontal scrollbar, no chip.
