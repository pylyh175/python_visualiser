/* ═══════════════ Reverse Array/String tab (two-pointers sub-mode) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily } from '../config.js';
import { hideOutTabsAll } from './shared.js';
import { detectTwoPointers, parseArrayValue } from './twoPointers.js';

const REVERSE_VIS_CAP = 30;  // max array elements displayed

// Which module-scope step was rendered last — the swap pulse fires only when
// a DIFFERENT step is drawn, so steady re-renders of the same step don't strobe.
let lastRenderedStep = -1;

export function renderReversePanel() {
  const fam = dsaFamily(state.dsaMode);
  const isReverse = state.dsaMode === 'two-pointers.reverse-array-string';
  if (fam !== 'two-pointers' || !isReverse) {
    els.tabReverse.hidden = true;
    els.reverseBody.hidden = true;
    return;
  }
  // Show the tab family for the reverse sub-mode (same as renderTwoPointersPanel)
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabReverse.hidden = false;
  // Content first (renderReverse may auto-switch state.outTab / state.idx),
  // then visibility follows the (possibly updated) state.
  renderReverse();
  els.output.hidden = state.outTab !== 'out';
  els.reverseBody.hidden = state.outTab !== 'reverse';
}

export function renderReverse() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }

  const locals = state.steps[state.idx]?.locals || {};
  const detection = detectTwoPointers(locals);

  // Stack-style one-time auto-switch: the tab exists the moment the pattern is
  // detected and the user hasn't manually picked a tab this run
  // (2026-11-04-two-pointers-reverse-submode-design.md).
  if (detection && !state.userTab && !state.reverseAnnounced) {
    state.reverseAnnounced = true;
    state.outTab = 'reverse';
  }

  // If detection fails at current step (e.g., final step after the function
  // returns, or pointer out of bounds), auto-advance to the first step with a
  // valid detection — same pattern as renderTwoPointers, never when the user
  // manually chose a tab. The auto-switch is applied here too: it must happen
  // on the very first render, even when step 0 itself is not a detected step.
  // ONE-TIME (2026-11-06 navigation fix): the advance is gated on the same
  // reverseAnnounced latch as the tab switch — before, every detection-less
  // render re-fired the scan and HIJACKED the user's step navigation (Next
  // snapped back to the first detected step). Once engaged, stepping is free.
  if (!detection && !state.userTab && !state.reverseAnnounced) {
    for (let i = 0; i < state.steps.length; i++) {
      const det = detectTwoPointers(state.steps[i]?.locals || {});
      if (det) {
        state.idx = i;
        if (!state.reverseAnnounced) {
          state.reverseAnnounced = true;
          state.outTab = 'reverse';
        }
        renderReversePanelContent(det);
        return;
      }
    }
  }

  renderReversePanelContent(detection);
}

// Renders the current step's reverse visual into els.reverseBody.
// Ground truth only: values come verbatim from the tracer's per-step snapshots.
function renderReversePanelContent(detection) {
  if (!detection) {
    els.reverseBody.innerHTML = `
      <div class="tp-strip">No reverse pattern detected — needs two pointers swapping a sequence.</div>
      <div class="tp-empty">Use Prev/Next to navigate.</div>
    `;
    lastRenderedStep = -1;
    return;
  }

  const { arrName, arrValue, leftName, rightName, leftIdx, rightIdx } = detection;
  const arr = parseArrayValue(arrValue);
  if (!arr) { els.reverseBody.innerHTML = ''; lastRenderedStep = -1; return; }

  const len = arr.length;
  const visLen = Math.min(len, REVERSE_VIS_CAP);
  const startIdx = Math.max(0, Math.min(leftIdx, rightIdx) - 2);
  const endIdx = Math.min(len, startIdx + visLen);

  // Swap flash is ground truth: compare this step's snapshot of the detected
  // array with the previous step's snapshot of the same variable — cells whose
  // value changed are the ones the swap line just touched.
  let swappedFrom = -1, swappedTo = -1;
  const pulse = state.idx !== lastRenderedStep;
  const prevStep = state.idx > 0 ? state.steps[state.idx - 1] : null;
  const prevArr = parseArrayValue(prevStep?.locals?.[arrName]);
  if (pulse && prevArr && prevArr.length === arr.length) {
    for (let i = 0; i < arr.length; i++) {
      if (JSON.stringify(prevArr[i]) !== JSON.stringify(arr[i])) {
        if (swappedFrom < 0) swappedFrom = i;
        else if (swappedTo < 0) swappedTo = i;
      }
    }
  }
  lastRenderedStep = state.idx;

  // Array strip cells with cursor + swap classes
  let cellsHtml = '';
  for (let i = startIdx; i < endIdx; i++) {
    const isLeft = i === leftIdx;
    const isRight = i === rightIdx;
    const isSwapped = pulse && (i === swappedFrom || i === swappedTo);
    const cls = ['tp-cell'];
    if (isLeft) cls.push('tp-left');
    if (isRight) cls.push('tp-right');
    if (isLeft && isRight) cls.push('tp-both');
    if (isSwapped) cls.push('tp-swap');
    cellsHtml += `<div class="${cls.join(' ')}" data-idx="${i}">${escapeHtml(fmtValue(arr[i]))}</div>`;
  }

  const leftVal = leftIdx >= 0 && leftIdx < len ? escapeHtml(fmtValue(arr[leftIdx])) : '—';
  const rightVal = rightIdx >= 0 && rightIdx < len ? escapeHtml(fmtValue(arr[rightIdx])) : '—';

  els.reverseBody.innerHTML = `
    <div class="tp-strip">
      <span class="tp-arr">${escapeHtml(arrName)}[${len}]</span>
      <span class="tp-ptr tp-left-label">${escapeHtml(leftName)}=${leftIdx} → ${leftVal}</span>
      <span class="tp-ptr tp-right-label">${escapeHtml(rightName)}=${rightIdx} → ${rightVal}</span>
    </div>
    <div class="tp-array" data-left="${leftIdx}" data-right="${rightIdx}">
      ${cellsHtml}
    </div>
  `;
}
