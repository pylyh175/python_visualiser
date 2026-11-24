/* ═══════════════ Valid Palindrome tab (two-pointers sub-mode) ═══════════════
   2026-11-05-valid-palindrome-submode-design.md: id-keyed tab, ground-truth
   only, strobe-guarded flash, honest failure. 2026-11-24: shared kit —
   sliding markers, verified region, captions for skips / matches, labels
   use the code's own names (was a hard-coded "s[left] vs s[right]"). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { dsaFamily } from '../config.js';
import { detectSequencePointers, pointerRoles, pointerBands } from './pointerLogic.js';
import { syncCells, placeMarkers, cellAt, flash, ptrChip, setCaption, setLegend, gapSpec } from './pointerKit.js';
import { PTR_NAME_PAIRS, renderPointerPane, frozenCaption, describeMoves } from './twoPointers.js';

export { PTR_NAME_PAIRS };

const PAL_VIS_FULL = 40;   // most cells ever drawn (wide monitors); fewer when the pane is narrower
const INDEX_CAP = 500;     // defensive parity with the runner's string cap

// A string local with two pointer-like int index vars (same naming pairs
// and index hints as the array detector). Returns the shared detection
// shape { arrName, arrValue, leftName, rightName, leftIdx, rightIdx } | null.
export function detectPalindrome(locals) {
  return detectSequencePointers(locals, {
    kind: 'string', hints: state.pointerHints, pin: state.pointerPin, maxStrLen: INDEX_CAP,
  });
}

const isAlnum = (ch) => /[a-z0-9]/i.test(ch || '');
// Display form of one character: whitespace is invisible in a cell or a
// caption, so it reads as an explicit symbol (display only — values untouched).
const shown = (ch) => (ch === ' ' ? '␣' : ch === '\t' ? '⇥' : ch === '\n' ? '↵' : ch);

// Comparison state recomputed from the recorded values only:
//   'none' — pointer out of range · 'skip' — a pointer is on a
//   non-alphanumeric (the code is skipping, not comparing) · 'match' /
//   'diff' — both alphanumeric, equal / different case-insensitively.
function compareState(sVal, l, r) {
  if (l < 0 || r < 0 || l >= sVal.length || r >= sVal.length) return 'none';
  if (!isAlnum(sVal[l]) || !isAlnum(sVal[r])) return 'skip';
  return sVal[l].toLowerCase() === sVal[r].toLowerCase() ? 'match' : 'diff';
}

// Whole-trace facts (cached per run): each call's recorded return value
// and its last recorded step (where a False call's terminating pair sits).
let factsCache = { steps: null, facts: null };
function callFacts(steps) {
  if (factsCache.steps === steps) return factsCache.facts;
  const verdicts = new Map();
  const lastInCall = new Map();
  for (let i = 0; i < steps.length; i++) {
    for (const r of steps[i].ret || []) if (!verdicts.has(r.id)) verdicts.set(r.id, r.value);
    const stack = steps[i].stack || [];
    const top = stack[stack.length - 1];
    if (top && top.fn && top.fn !== '<module>') lastInCall.set(top.id, i);
  }
  factsCache = { steps, facts: { verdicts, lastInCall } };
  return factsCache.facts;
}

export function renderPalindromePanel() {
  const fam = dsaFamily(state.dsaMode);
  const isPalindrome = state.dsaMode === 'two-pointers.valid-palindrome';
  if (fam !== 'two-pointers' || !isPalindrome) {
    els.tabPalindrome.hidden = true;
    els.palindromeBody.hidden = true;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabPalindrome.hidden = false;
  els.output.hidden = state.outTab !== 'out';
  els.palindromeBody.hidden = state.outTab !== 'palindrome';
  renderPalindrome();
}

export function renderPalindrome() {
  renderPointerPane(els.palindromeBody, {
    detect: detectPalindrome,
    kind: 'string',
    empty: ['No palindrome-check pattern detected — needs two pointers moving over a string.', 'Use Prev/Next to navigate.'],
    build: buildPalindrome,
  });
}

function buildPalindrome(ctx) {
  const { v, det, frame, prev } = ctx;
  const s = det.arrValue;
  const sName = det.arrName, lName = det.leftName, rName = det.rightName;
  const l = det.leftIdx, r = det.rightIdx;
  const len = s.length;
  const cmp = compareState(s, l, r);
  const [roleL, roleR] = pointerRoles(lName, rName);

  // The frame step's call facts — recorded verdict + terminating pair.
  const { verdicts, lastInCall } = callFacts(state.steps);
  const stack = state.steps[frame.frameStep].stack || [];
  const top = stack[stack.length - 1];
  const fid = top && top.fn && top.fn !== '<module>' ? top.id : null;
  const verdict = fid != null ? verdicts.get(fid) : undefined;
  let termPair = null;
  if (verdict === false) {
    const lastIdx = lastInCall.get(fid);
    const lastLocals = lastIdx != null ? state.steps[lastIdx].locals || {} : {};
    if (typeof lastLocals[lName] === 'number' && typeof lastLocals[rName] === 'number') {
      termPair = [lastLocals[lName], lastLocals[rName]];
    }
  }
  const atTerm = verdict === false && termPair != null && l === termPair[0] && r === termPair[1];

  // Layout: the whole string when it fits the pane; otherwise a window
  // around each pointer, merged when they meet, with a "…N…" gap between
  // (shared pointerBands — sized to the screen, 2026-11-24 viewport design).
  const ghosts = (l === -1 || r === -1 ? 1 : 0) + (l === len || r === len ? 1 : 0);
  const bands = pointerBands(len, l, r, Math.max(3, Math.min(PAL_VIS_FULL, ctx.fit) - ghosts));

  const met = l >= r;
  const ptrCls = (i) => {
    const c = [];
    if (i === l) c.push(`tp-at-${roleL}`);
    if (i === r) c.push(`tp-at-${roleR}`);
    if (i === l && i === r) c.push('tp-both');
    return c;
  };
  const specs = [];
  if (bands[0][0] === 0 && (l === -1 || r === -1)) {
    specs.push({ key: 'ghost-lo', idx: -1, text: '', cls: ['tp-cell', 'tp-ghost', ...ptrCls(-1)].join(' ') });
  }
  bands.forEach(([start, end], b) => {
    if (b > 0) specs.push(gapSpec(`gap${b}`, start - bands[b - 1][1], 'characters'));
    for (let i = start; i < end; i++) {
      const c = ['tp-cell', ...ptrCls(i)];
      if (!isAlnum(s[i])) c.push('pal-dim');
      // Outside [left, right] has been checked (matched or skipped).
      if (verdict !== false && (met || i < l || i > r)) c.push('tp-done');
      specs.push({ key: `c${i}`, idx: i, text: shown(s[i]), cls: c.join(' ') });
    }
  });
  if (bands[bands.length - 1][1] === len && (l === len || r === len)) {
    specs.push({ key: 'ghost-hi', idx: len, text: '', cls: ['tp-cell', 'tp-ghost', ...ptrCls(len)].join(' ') });
  }
  syncCells(v.array, specs);
  v.array.classList.add('pal-array');

  const ch = (i) => (i >= 0 && i < len ? escapeHtml(shown(s[i])) : '—');
  // Factual, value-only badge (≠ never claims a verdict).
  const badge = cmp === 'skip' ? '<span class="pal-badge">— skipping</span>'
    : cmp === 'match' ? '<span class="pal-badge pal-match">= equal</span>'
      : cmp === 'diff' ? '<span class="pal-badge pal-diff">≠ differs</span>'
        : '<span class="pal-badge">—</span>';
  const chip = atTerm
    ? '<span class="pal-chip pal-chip-false">✗ call returned False</span>'
    : verdict === true && met
      ? '<span class="pal-chip pal-chip-true">✓ call returned True</span>'
      : '';
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(sName)}[${len}]</span>
    ${ptrChip(lName, l, ch(l), roleL)}
    ${ptrChip(rName, r, ch(r), roleR)}
    <span class="tp-arr">${escapeHtml(sName)}[${escapeHtml(lName)}] vs ${escapeHtml(sName)}[${escapeHtml(rName)}] ${badge}</span>
    ${chip}`;

  // Caption: what the last move was, from the previous frame of this call.
  let cap;
  if (frame.frozen) cap = frozenCaption(frame);
  else if (atTerm) cap = `<span class="tp-cap-warn">'${ch(l)}' ≠ '${ch(r)}' — mismatch, so the string is not a palindrome</span>`;
  else if (prev) {
    const parts = [];
    const pl = prev.leftIdx, pr = prev.rightIdx;
    const prevCmp = compareState(s, pl, pr);
    if (l > pl && r < pr && prevCmp === 'match') {
      parts.push(`'${ch(pl)}' = '${ch(pr)}' (ignoring case) — both pointers move in`);
    } else {
      if (l > pl) parts.push(pl >= 0 && pl < len && !isAlnum(s[pl])
        ? `${escapeHtml(lName)} skipped '${ch(pl)}' (not a letter or digit)`
        : `${escapeHtml(lName)} ${pl} → ${l}`);
      if (r < pr) parts.push(pr >= 0 && pr < len && !isAlnum(s[pr])
        ? `${escapeHtml(rName)} skipped '${ch(pr)}' (not a letter or digit)`
        : `${escapeHtml(rName)} ${pr} → ${r}`);
    }
    cap = parts.join(' · ') || describeMoves(prev, det);
  }
  if (!cap) {
    cap = met ? `<span class="tp-cap-good">pointers met — every pair matched</span>`
      : cmp === 'skip' ? 'a pointer is on a non-alphanumeric character — it will be skipped'
        : `compare '${ch(l)}' with '${ch(r)}'`;
  }
  setCaption(v, cap);
  setLegend(v, [['tp-sw-done', 'checked'], ['tp-sw-dim', 'ignored (not a letter/digit)'], ['tp-sw-live', 'still to check']]);
  placeMarkers(v, [
    { name: lName, idx: l, role: roleL },
    { name: rName, idx: r, role: roleR },
  ], ctx.animate);
  if (ctx.animate && atTerm) {
    flash(cellAt(v, l), 'tp-swap');
    flash(cellAt(v, r), 'tp-swap');
  }
}