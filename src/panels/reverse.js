/* ═══════════════ Reverse Array/String tab (two-pointers sub-mode) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { detectTwoPointers, parseArrayValue, resolveDetectedFrame } from './twoPointers.js';
import { registerPane } from './registry.js';
import { hideOutputPanes } from './paneController.js';

const REVERSE_VIS_CAP = 30;  // max array elements displayed

// Which module-scope step was rendered last — the swap pulse fires only when
// a DIFFERENT step is drawn, so steady re-renders of the same step don't strobe.
let lastRenderedStep = -1;

export function renderReversePanel() {
  // Tab/body visibility is owned by paneController; this only renders content.
  if (state.dsaMode !== 'two-pointers.reverse-array-string') return;
  renderReverse();
}

export function renderReverse() {
  if (!state.steps.length) { hideOutputPanes(state.dsaMode); return; }

  // The one-time tab switch + jump to the first detected step happens in
  // render() via paneController's one-time engage, before the controls are drawn.

  // PERSISTENT ANIMATION (2026-11-06 design, made jump-safe 2026-11-20):
  // resolve the frame from the TARGET step, not from render history, so a
  // direct Last/First jump lands on the same frame as stepping there.
  // Detection-less steps freeze the nearest real frame (flashes suppressed).
  const frame = resolveDetectedFrame(detectTwoPointers, state.idx);
  if (!frame) {
    state.panes.lastValidFrame = -1;
    renderReversePanelContent(null);
    return;
  }
  state.panes.lastValidFrame = frame.frameStep;
  renderReversePanelContent(frame.detection, frame.frameStep, frame.frozen);
}

// Renders the current step's reverse visual into els.reverseBody.
// Ground truth only: values come verbatim from the tracer's per-step snapshots.
// (detection, frameStep, frozen): a frozen render re-draws the remembered
// frame — its own values (Q4), with the swap flash suppressed (a frozen
// re-render is never a new event).
function renderReversePanelContent(detection, frameStep = state.idx, frozen = false) {
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
  // value changed are the ones the swap line just touched. A frozen re-render
  // is never a new event (persistent-animation design Q1): flash suppressed.
  let swappedFrom = -1, swappedTo = -1;
  const pulse = !frozen && state.idx !== lastRenderedStep;
  const prevStep = frameStep > 0 ? state.steps[frameStep - 1] : null;
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

registerPane({
  id: 'reverse',
  label: 'Reverse Array/String',
  family: 'two-pointers',
  mode: 'two-pointers.reverse-array-string',
  tabId: 'tabReverse',
  bodyId: 'reverseBody',
  render: renderReversePanel,
  engage: { detect: detectTwoPointers, tab: 'reverse' },
});
