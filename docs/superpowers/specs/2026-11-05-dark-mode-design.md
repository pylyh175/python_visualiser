# Dark mode — design (grilled 2026-11-05)

## User request

Implement a dark mode. The toggle icon goes at the right corner of the top bar,
same row as the "Python Code Visualizer" title.

## Ground-truth facts (gathered before grilling)

- The CSS is half-variable already: 12 `:root` colors with 75 `var()` uses, plus
  75 hardcoded hex uses.
- The **visualisation panes** (`#outputBody`, `#treeBody`, `#stackBody`,
  `#twoPtrsBody`, `#reverseBody`, `#palindromeBody`, the `.outtabs`,
  `.sbox*`, `.tp-*` families) are ALREADY dark (`#111827` bg, `#f9fafb` text)
  in both themes — they read like black terminals on the light chrome.
- The **editor** paints its text via the ghost-fix single-copy arrangement:
  `.mirror { color: #111827 }` (2 copies earlier caused doubled text during fast
  scroll — audit checks pin those literals), `caret-color: #111827`, gutter
  `.ln` `#9ca3af`, translucent selection `rgba(37,99,235,0.30)`. Its
  background is `var(--panel)` (white today).
- **FOUC risk**: `main.js` is a deferred ES module that also boots Pyodide; a
  theme applied only there flashes light on every dark-default load. A tiny
  inline `<head>` script can set the attribute before the stylesheet applies.
- Header today: `<h1>🐍 Python Code Visualiser</h1>` + status pill; no right
  corner element. Button language is emoji/glyphs (🐍 ▶ ✎ ⏮), no icon library.

## Grilled decisions (user answered "Yes" to all six)

1. **Variable-override theme, panes untouched.** `:root[data-theme="dark"]`
   overrides the chrome palette (page, panels, header, buttons, tabs, legends,
   dropdowns). The dark visualisation panes stay byte-identical in both themes
   — no rendered-figure check changes.
2. **Editor goes dark too.** Its light literals become variables —
   `--text` (mirror text + caret), new `--gutter` (line numbers), new
   `--text-body` (`#varsBody td.v`). Light values are the EXACT former hexes,
   so light mode computes identical colors; the ghost-fix arrangement is
   preserved by construction (one glyph layer, translucent selection), with
   audit checks re-pinned to the variables.
3. **Persistence + no flash.** Choice stored in `localStorage` (`viz.theme`);
   with no stored choice the OS `prefers-color-scheme` decides; an inline
   `<head>` script sets `data-theme` before first paint. Button handler lives
   in a side-effect-import module (`src/theme.js`) wired the established way.
4. **Toggle button**: right corner of the header row (`margin-left: auto`),
   🌙 in light mode / ☀️ in dark mode, `aria-pressed` + dynamic `aria-label`,
   no icon library.
5. **Instant swap** — no fade/transition; deterministic for probes/audit.
6. **Verification**: audit gains a dark-mode group (pre-paint script, dark
   block, button + aria, editor/vars variable conversion, panes untouched),
   headless Edge screenshots of BOTH themes from real CSS+markup, and the
   full battery green with pane checks unchanged.

## Implementation shape

- `index.html`: inline pre-paint theme script before the stylesheet; header
  gains `<button id="themeToggle">` after the status pill.
- `style.css`: three light literals become vars (`--text` reuse, `--gutter`,
  `--text-body`; `:root` gains the two new light values), plus a
  `:root[data-theme="dark"]` override block:
  `--bg #0f172a`, `--panel #1e293b`, `--border #334155`, `--text #e5e7eb`,
  `--muted #94a3b8`, `--accent #3b82f6`, `--green #34d399`, translucent
  highlight bgs, `--gutter #64748b`, `--text-body #d1d5db`.
- `src/theme.js`: side-effect module applying-syncing icon/aria + click
  toggle + `localStorage`; `dom.js` gains `themeToggle`; `main.js` imports it.
