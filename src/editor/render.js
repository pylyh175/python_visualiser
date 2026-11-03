/* ═══════════════ Editor rendering: mirror behind the textarea ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
// stepArrowLines/rowAt live in navigation (single source for drawing AND
// auto-scroll). navigation in turn imports syncScroll from here for its
// glide settling — a function-only cycle, safe in ES modules (hoisted
// declarations, no top-level calls between the two).
import { stepArrowLines, rowAt } from '../navigation/steps.js';

// Size the spacer so the mirror's scroll range matches the textarea's exactly.
// The textarea reserves space for its own scrollbars, which the mirror
// (overflow: hidden) does not: its client box is smaller, so even with
// identical content the textarea can scroll further (scroll range =
// scrollHeight − clientHeight). Add that difference to the spacer; without it,
// offsets near the end of the range are silently clamped on the mirror side
// and the two texts drift apart, showing doubled, misaligned text. This must
// run after every mirror rebuild (renderEditor), not only on scroll: an
// innerHTML rebuild can otherwise clamp/reset the mirror's position.
function syncSpacerSize() {
  if (!state.mirrorSpacer) return;
  const t = els.textarea;
  const m = els.mirror;
  const w = t.scrollWidth + Math.max(0, m.clientWidth - t.clientWidth);
  const h = t.scrollHeight + Math.max(0, m.clientHeight - t.clientHeight);
  const ws = w + 'px';
  const hs = h + 'px';
  if (state.mirrorSpacer.style.width !== ws) state.mirrorSpacer.style.width = ws;
  if (state.mirrorSpacer.style.height !== hs) state.mirrorSpacer.style.height = hs;
}

export function renderEditor() {
  const text = els.textarea.value;
  const lines = text.split('\n');
  // Error state: on a syntax error there are no steps at all and the line
  // comes from programError; on a runtime error / limit stop it is the last
  // step, but only while that step is the one being viewed (stepping back
  // returns to the normal green/orange playback colours).
  // Steps are recorded on the tracer's line events, i.e. immediately
  // *before* the event's line runs. At step idx the line about to execute
  // is steps[idx].line (orange "next" arrow) and the line that just
  // executed is the previous step's, steps[idx-1].line (green arrow). The
  // first step has nothing executed yet, so only the next-line arrow
  // shows there. The runner's synthetic final step repeats the last real
  // line, so at the end the green arrow lands on that line and nothing is
  // left pending. Return steps (the runner records one at every call
  // return) complete a call on their own line — nothing is about to run
  // afterwards, so they show the green arrow on the return line only.
  // Error/limit final step: red buggy-line marker instead.
  // The arrow classification lives in stepArrowLines(): the same source is
  // what ensureStepVisible tracks, so drawing and auto-scroll can't drift.
  const { greenLine, orangeLine: nextLine, redLine } = stepArrowLines();

  const parts = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    let cls = 'row';
    let arrow = '';
    if (n === redLine) {
      cls += ' hl-error';
      arrow = '<span class="arrow arrow-error">▶</span>';
    } else if (n === greenLine) {
      cls += ' hl-current';
      arrow = '<span class="arrow arrow-prev">▶</span>';
    } else if (n === nextLine) {
      cls += ' hl-next';
      arrow = '<span class="arrow arrow-next">▶</span>';
    } else {
      arrow = '<span class="arrow"></span>';
    }
    parts.push(`<div class="${cls}"><span class="ln">${n}</span>${arrow}${escapeHtml(lines[i])}</div>`);
  }
  // Hidden spacer keeps the scroll ranges identical (see syncSpacerSize);
  // sized right after the rebuild via syncScroll below.
  parts.push('<div class="spacer"></div>');
  els.mirror.innerHTML = parts.join('');
  state.mirrorSpacer = els.mirror.lastElementChild;
  // Rebuilding innerHTML resets the mirror's scroll area; restore the exact
  // scroll offsets so the text stays glued to the line numbers. This is what
  // keeps Visualize / First / Prev / Next / Last from re-breaking alignment
  // when the code is scrolled (e.g. to the bottom) before them.
  syncScroll();
}

export function refresh() {
  renderEditor();
  syncScroll();
}

export function syncScroll() {
  // The mirror is its own scroll container, so the sticky line numbers
  // and arrows keep working while text scrolls underneath.
  const t = els.textarea;
  const m = els.mirror;
  // The textarea reserves space for its own scrollbars, which the mirror
  // (overflow: hidden) does not. syncSpacerSize keeps the mirror's scroll
  // range identical to the textarea's, so the copies below can never clamp
  // and the two texts stay aligned. Re-run on every scroll because scrollbar
  // visibility can change with size or content.
  syncSpacerSize();
  if (m.scrollTop !== t.scrollTop) m.scrollTop = t.scrollTop;
  if (m.scrollLeft !== t.scrollLeft) m.scrollLeft = t.scrollLeft;
}

els.textarea.addEventListener('scroll', syncScroll);
// Caret-follow triggers on caret movement only: clicks and keyboard
// navigation here, edits via the 'input' listener in editor/input.js.
// Scroll alone is deliberately never wired — manual scrolling must not be fought.
els.textarea.addEventListener('click', scheduleCaretFollow);
els.textarea.addEventListener('keyup', scheduleCaretFollow);

/* ---------- keep the caret inside the view while editing ---------- */

// Monospace advance of one character cell (measured once, lazily). Both
// editor layers share one font and tab-size, so text coordinates are exact
// for both vertical rows and horizontal columns.
function caretCellWidth() {
  if (state.caretCellW !== null) return state.caretCellW;
  try {
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(64);
    const cs = getComputedStyle(els.mirror);
    probe.style.cssText = 'position:absolute;visibility:hidden;top:-9999px;left:0;'
      + 'white-space:pre;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize;
    document.body.appendChild(probe);
    state.caretCellW = probe.getBoundingClientRect().width / 64;
    probe.remove();
  } catch (err) {
    state.caretCellW = 0;
  }
  if (!state.caretCellW) state.caretCellW = 8.4;   // sane monospace default at 14px
  return state.caretCellW;
}

// Caret's horizontal position in content coordinates. Each non-tab
// character advances one cell; a tab jumps to the next 4-cell stop
// (tab-size 4, as rendered).
function caretColumnX(linePrefix) {
  const cw = caretCellWidth();
  let x = 0;
  for (const ch of linePrefix) {
    if (ch === '\t') x = (Math.floor(x / (cw * 4)) + 1) * cw * 4;
    else x += cw;
  }
  return x;
}

// Follow the caret after it moves (typing, Enter, click, arrow keys):
// scroll the editor minimally when the caret left the visible area. Only
// caret-movement events reach this — wheel/scrollbar scrolling alone is
// never fought — and locked playback keeps its own tracking
// (ensureStepVisible), so the two behaviors cannot fight each other.
function keepCaretVisible() {
  const t = els.textarea;
  if (state.locked || document.activeElement !== t) return;
  const pos = t.selectionStart;
  const start = t.value.lastIndexOf('\n', pos - 1) + 1;
  const line = t.value.slice(0, start).split('\n').length;
  const row = rowAt(line);
  if (!row) return;
  let changed = false;
  const top = row.offsetTop;
  const bot = top + (row.offsetHeight);
  if (top < t.scrollTop) {
    t.scrollTop = Math.max(0, top);
    changed = true;
  } else if (bot > t.scrollTop + t.clientHeight) {
    t.scrollTop = Math.min(t.scrollHeight - t.clientHeight, bot - t.clientHeight);
    changed = true;
  }
  // Horizontal: the same policy along the caret column (long lines and
  // tabs are already priced in by caretColumnX).
  const x = caretColumnX(t.value.slice(start, pos));
  const cw = caretCellWidth();
  if (x < t.scrollLeft) {
    t.scrollLeft = Math.max(0, x);
    changed = true;
  } else if (x + cw > t.scrollLeft + t.clientWidth) {
    t.scrollLeft = Math.min(t.scrollWidth - t.clientWidth, x + cw - t.clientWidth);
    changed = true;
  }
  if (changed) syncScroll();
}

// One rAF pass after caret movement: glue the mirror first (a renderEditor
// rebuild can reset its scroll, see syncSpacerSize), then follow the caret.
export function scheduleCaretFollow() {
  if (state.caretFollowQueued) return;
  state.caretFollowQueued = true;
  requestAnimationFrame(() => {
    state.caretFollowQueued = false;
    syncScroll();
    keepCaretVisible();
  });
}
