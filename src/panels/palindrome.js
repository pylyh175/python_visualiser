/* ═══════════════ Valid Palindrome tab (two-pointers sub-mode) ═══════════════
   Mirrors reverse.js (2026-11-05-valid-palindrome-submode-design.md): id-keyed
   tab, ground-truth-only animation, strobe-guarded flash, honest failure. */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { dsaFamily } from '../config.js';
import { hideOutTabsAll } from './shared.js';
import { PTR_NAME_PAIRS } from './twoPointers.js';

const PAL_VIS_FULL = 40;   // strings up to this length render UNSPLIT
const PAL_WINDOW_HALF = 6; // windowed strings: 12 cells per window
const INDEX_CAP = 500;     // defensive parity with the runner's string cap

// Which step was rendered last — the mismatch pulse fires only when a
// DIFFERENT step is drawn (same strobe guard as reverse.js's swap flash).
let lastRenderedStep = -1;

// Detect a palindrome-check pattern: a string local with two pointer-like
// int index vars (same naming pairs as the generic two-pointers detector).
// Strings fall through detectTwoPointers (JS strings aren't array-likes),
// so per the design this helper lives here rather than forking twoPointers.
// Returns { sName, sValue, leftName, rightName, leftIdx, rightIdx } or null.
export function detectPalindrome(locals) {
  const entries = Object.entries(locals || {});
  const strings = entries.filter(([_, v]) => typeof v === 'string' && v.length > 0 && v.length <= INDEX_CAP);
  if (strings.length === 0) return null;
  for (const [sName, sVal] of strings) {
    const len = sVal.length;
    const indexVars = entries.filter(([name, v]) =>
      typeof v === 'number' && Number.isInteger(v) && v >= -len && v < len);
    for (const [a, b] of PTR_NAME_PAIRS) {
      const leftE = indexVars.find(([n]) => n === a);
      const rightE = indexVars.find(([n]) => n === b);
      if (leftE && rightE) {
        return {
          sName, sValue: sVal,
          leftName: a, rightName: b,
          leftIdx: leftE[1], rightIdx: rightE[1],
        };
      }
    }
  }
  return null;
}

// Comparison state for the current step, recomputed from the recorded values
// only (grilled follow-up: skip-test steps must NOT read as mismatches):
//   'none'  — pointer out of range
//   'skip'  — a pointer sits on a non-alphanumeric: the code is SKIPPING,
//             not comparing — neutral, never flash
//   'match' — both alphanumeric, equal case-insensitively (green =)
//   'diff'  — both alphanumeric, different (factual neutral ≠ — the verdict
//             flash below is return-gated, so this never claims a verdict)
function compareState(sVal, leftIdx, rightIdx) {
  if (leftIdx < 0 || rightIdx < 0 || leftIdx >= sVal.length || rightIdx >= sVal.length) return 'none';
  const alnum = (ch) => /[a-z0-9]/i.test(ch);
  if (!alnum(sVal[leftIdx]) || !alnum(sVal[rightIdx])) return 'skip';
  return sVal[leftIdx].toLowerCase() === sVal[rightIdx].toLowerCase() ? 'match' : 'diff';
}

// Whole-trace lookups over RECORDED facts only (no source parsing; precedent:
// recursion.js whole-run verdicts). verdicts: runner's return records keyed by
// frame id ({id, value} entries carried on the parent's next recorded step).
// lastInCall: each call frame's last recorded step — for a call that returned
// false, its left/right THERE is the terminating pair.
function callFacts(steps) {
  const verdicts = new Map();
  const lastInCall = new Map();
  for (let i = 0; i < steps.length; i++) {
    for (const r of steps[i].ret || []) if (!verdicts.has(r.id)) verdicts.set(r.id, r.value);
    const stack = steps[i].stack || [];
    const top = stack[stack.length - 1];
    if (top && top.fn && top.fn !== '<module>') lastInCall.set(top.id, i);
  }
  return { verdicts, lastInCall };
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
  // Content first (renderPalindrome may auto-switch state.outTab / state.idx),
  // then visibility follows the (possibly updated) state.
  renderPalindrome();
  els.output.hidden = state.outTab !== 'out';
  els.palindromeBody.hidden = state.outTab !== 'palindrome';
}

export function renderPalindrome() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }

  const locals = state.steps[state.idx]?.locals || {};
  const detection = detectPalindrome(locals);

  // Stack-style one-time auto-switch, applied also inside the auto-advance
  // below — it must happen on the very first render even when step 0 itself
  // is not a detected step (grilled Q6; mirrors reverse.js).
  if (detection && !state.userTab && !state.palindromeAnnounced) {
    state.palindromeAnnounced = true;
    state.outTab = 'palindrome';
  }

  // ONE-TIME (2026-11-06 navigation fix, mirrors reverse.js): the advance is
  // gated on the same palindromeAnnounced latch — every detection-less render
  // used to re-fire the scan and hijack step navigation.
  if (!detection && !state.userTab && !state.palindromeAnnounced) {
    for (let i = 0; i < state.steps.length; i++) {
      const det = detectPalindrome(state.steps[i]?.locals || {});
      if (det) {
        state.idx = i;
        if (!state.palindromeAnnounced) {
          state.palindromeAnnounced = true;
          state.outTab = 'palindrome';
        }
        renderPalindromePanelContent(det);
        return;
      }
    }
  }

  renderPalindromePanelContent(detection);
}

// Renders the current step's palindrome visual into els.palindromeBody.
// Ground truth only: s and pointers come verbatim from the tracer snapshots.
function renderPalindromePanelContent(detection) {
  if (!detection) {
    els.palindromeBody.innerHTML = `
      <div class="tp-strip">No palindrome-check pattern detected — needs two pointers moving over a sequence.</div>
      <div class="tp-empty">Use Prev/Next to navigate.</div>
    `;
    lastRenderedStep = -1;
    return;
  }

  const { sName, sValue, leftName, rightName, leftIdx, rightIdx } = detection;
  const len = sValue.length;
  const cmp = compareState(sValue, leftIdx, rightIdx);

  // The current step's call facts — recorded verdict + terminating pair for
  // False calls (grilled follow-up: the flash is return-gated, never the raw
  // value comparison).
  const { verdicts, lastInCall } = callFacts(state.steps);
  const stack = state.steps[state.idx].stack || [];
  const top = stack[stack.length - 1];
  const fid = top && top.fn && top.fn !== '<module>' ? top.id : null;
  const verdict = fid != null ? verdicts.get(fid) : undefined;
  let termPair = null;
  if (verdict === false) {
    const lastIdx = lastInCall.get(fid);
    if (lastIdx != null) {
      const lastLocals = state.steps[lastIdx].locals || {};
      if (typeof lastLocals[leftName] === 'number' && typeof lastLocals[rightName] === 'number') {
        termPair = [lastLocals[leftName], lastLocals[rightName]];
      }
    }
  }

  // Layout: whole string when short; otherwise two windows around the
  // pointers, merged when they overlap, with a hide-label between (grilled Q4).
  const bands = [];
  if (len <= PAL_VIS_FULL) {
    bands.push([0, len]);
  } else {
    const lEnd = Math.min(len, leftIdx + PAL_WINDOW_HALF + 1);
    const lStart = Math.max(0, Math.min(leftIdx, lEnd - 1) - PAL_WINDOW_HALF);
    const rEnd = Math.min(len, rightIdx + PAL_WINDOW_HALF + 1);
    const rStart = Math.max(0, Math.min(rightIdx, rEnd - 1) - PAL_WINDOW_HALF);
    if (rStart <= lEnd) {
      bands.push([Math.min(lStart, rStart), Math.max(lEnd, rEnd)]);
    } else {
      bands.push([lStart, lEnd], [rStart, rEnd]);
    }
  }

  // Mismatch flash, RETURN-GATED: only the terminating pair of a call whose
  // false verdict the runner recorded — plus the strobe guard as in reverse.js.
  const strobe = state.idx !== lastRenderedStep;
  lastRenderedStep = state.idx;
  const flash = strobe && verdict === false && termPair != null
    && leftIdx === termPair[0] && rightIdx === termPair[1];

  const isAlnum = (ch) => /[a-z0-9]/i.test(ch);   // value-derived presentation
  const cellHtml = (i) => {
    const ch = sValue[i];
    const cls = ['tp-cell'];
    if (i === leftIdx && i === rightIdx) cls.push('tp-both');
    else if (i === leftIdx) cls.push('tp-left');
    else if (i === rightIdx) cls.push('tp-right');
    if (!isAlnum(ch)) cls.push('pal-dim');
    if (flash && (i === leftIdx || i === rightIdx)) cls.push('tp-swap');
    return `<div class="${cls.join(' ')}" data-idx="${i}">${escapeHtml(ch)}</div>`;
  };

  let strip = '';
  bands.forEach(([start, end], b) => {
    if (b > 0) {
      strip += `<div class="pal-gap">… ${(start - bands[b - 1][1]).toLocaleString()} chars hidden …</div>`;
    }
    for (let i = start; i < end; i++) strip += cellHtml(i);
  });

  const lv = leftIdx >= 0 && leftIdx < len ? escapeHtml(sValue[leftIdx]) : '—';
  const rv = rightIdx >= 0 && rightIdx < len ? escapeHtml(sValue[rightIdx]) : '—';
  // Factual, value-only badge (≠ never claims a verdict — see grill round 2).
  const badge = cmp === 'skip' ? '<span class="pal-badge">— skipping</span>'
    : cmp === 'match' ? '<span class="pal-badge pal-match">= equal</span>'
    : cmp === 'diff' ? '<span class="pal-badge pal-diff">≠ differs</span>'
    : '<span class="pal-badge">—</span>';
  // Verdict chips from the call's RECORDED return (Q1/Q3 follow-up).
  const chip = verdict === false && termPair != null && leftIdx === termPair[0] && rightIdx === termPair[1]
    ? '<span class="pal-chip pal-chip-false">✗ call returned False</span>'
    : verdict === true && leftIdx >= rightIdx
      ? '<span class="pal-chip pal-chip-true">✓ call returned True</span>'
      : '';

  els.palindromeBody.innerHTML = `
    <div class="tp-strip">
      <span class="tp-arr">${escapeHtml(sName)}[${len}]</span>
      <span class="tp-ptr tp-left-label">${escapeHtml(leftName)}=${leftIdx} → ${lv}</span>
      <span class="tp-ptr tp-right-label">${escapeHtml(rightName)}=${rightIdx} → ${rv}</span>
      <span class="tp-arr">s[left] vs s[right] ${badge}</span>
      ${chip}
    </div>
    <div class="tp-array pal-array" data-left="${leftIdx}" data-right="${rightIdx}">
      ${strip}
    </div>
  `;
}
