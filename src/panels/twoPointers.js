/* ═══════════════ Two Pointers visualiser (Two Pointers tab) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily } from '../config.js';
import { hideOutTabsAll } from './shared.js';

const TWOPTR_VIS_CAP = 30;  // max array elements displayed

// Name heuristics for pointer-like variables
const PTR_NAME_PAIRS = [
  ['left', 'right'], ['l', 'r'], ['start', 'end'], ['i', 'j'],
  ['slow', 'fast'], ['low', 'high'], ['lo', 'hi'], ['begin', 'end'],
  ['first', 'last'], ['head', 'tail'],
];

// Detect if a value looks like an array/list
function isArrayLike(v) {
  return v && typeof v === 'object' && typeof v.length === 'number';
}

// Scan the current step's locals for two-pointer candidates.
// Returns { arrName, leftName, rightName, arrValue, leftIdx, rightIdx } or null.
// Exported: the per-problem two-pointers tab visualisers (reverse.js, …)
// reuse the exact same detection instead of forking heuristics.
export function detectTwoPointers(locals) {
  const entries = Object.entries(locals || {});
  // Find all array-like variables
  const arrays = entries.filter(([_, v]) => isArrayLike(v));
  if (arrays.length === 0) return null;

  // For each array, find integer variables that index it
  for (const [arrName, arrVal] of arrays) {
    const arrLen = arrVal.length;
    // Find integer locals that could be indices into this array
    const indexVars = entries.filter(([name, v]) => {
      if (typeof v !== 'number') return false;
      if (!Number.isInteger(v)) return false;
      // Check if this variable is used to index the array in the source
      // (we can't easily check source here, so use heuristics)
      return v >= -arrLen && v < arrLen; // valid index range
    });

    if (indexVars.length < 2) continue;

    // Score pairs of index variables
    let bestPair = null, bestScore = -1;
    for (let i = 0; i < indexVars.length; i++) {
      for (let j = i + 1; j < indexVars.length; j++) {
        const [name1, val1] = indexVars[i];
        const [name2, val2] = indexVars[j];
        let score = 0;
        // Name pair heuristic
        for (const [a, b] of PTR_NAME_PAIRS) {
          if ((name1 === a && name2 === b) || (name1 === b && name2 === a)) {
            score += 10;
          }
        }
        // Monotonic opposite directions (classic two pointers)
        if ((val1 < val2 && name1.includes('left') && name2.includes('right')) ||
            (val1 > val2 && name1.includes('right') && name2.includes('left'))) {
          score += 5;
        }
        // Different names
        if (name1 !== name2) score += 1;
        if (score > bestScore) {
          bestScore = score;
          bestPair = { left: name1, right: name2, leftVal: val1, rightVal: val2 };
        }
      }
    }

    if (bestPair && bestScore > 0) {
      return {
        arrName,
        arrValue: arrVal,
        leftName: bestPair.left,
        rightName: bestPair.right,
        leftIdx: bestPair.leftVal,
        rightIdx: bestPair.rightVal,
      };
    }
  }
  return null;
}

// Parse array value from tracer's serialized format (exported for the
// per-problem tab visualisers, like detectTwoPointers).
export function parseArrayValue(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch { return null; }
  }
  return null;
}

export function renderTwoPointers() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }

  const locals = state.steps[state.idx]?.locals || {};
  const detection = detectTwoPointers(locals);

  // If detection fails at current step (e.g., final step after function returns,
  // or pointer out of bounds), auto-advance to first step with valid detection.
  // This runs both on initial load (idx=0) and after a run completes (idx=last).
  if (!detection && !state.userTab) {
    for (let i = 0; i < state.steps.length; i++) {
      if (detectTwoPointers(state.steps[i]?.locals || {})) {
        state.idx = i;
        // Re-detect at new index
        const newLocals = state.steps[state.idx]?.locals || {};
        const newDetection = detectTwoPointers(newLocals);
        renderTwoPointersPanelContent(newDetection);
        return;
      }
    }
  }

  // Render current step's data. If detection fails at this step
  // (e.g., final step after function returns, or pointer out of bounds),
  // show info message without changing state.idx — navigation to other
  // steps still works.
  renderTwoPointersPanelContent(detection);
}

// Renders the Two Pointers visual content into els.twoPtrsBody
// Does NOT manipulate visibility - that's handled by renderOutPanel based on state.outTab
function renderTwoPointersPanelContent(detection) {
  if (!detection) {
    els.twoPtrsBody.innerHTML = `
      <div class="tp-strip">Select "Two Pointers" mode and run code with two indices on the same array.</div>
      <div class="tp-empty">No two-pointer pattern detected. Use Prev/Next to navigate.</div>
    `;
    return;
  }

  const { arrName, arrValue, leftName, rightName, leftIdx, rightIdx } = detection;
  const arr = parseArrayValue(arrValue);
  if (!arr) { hideOutTabsAll(state.dsaMode); return; }

  const len = arr.length;
  const visLen = Math.min(len, TWOPTR_VIS_CAP);
  const startIdx = Math.max(0, Math.min(leftIdx, rightIdx) - 2);
  const endIdx = Math.min(len, startIdx + TWOPTR_VIS_CAP);

  // Build array strip HTML
  let cellsHtml = '';
  for (let i = startIdx; i < endIdx; i++) {
    const isLeft = i === leftIdx;
    const isRight = i === rightIdx;
    const cls = ['tp-cell'];
    if (isLeft) cls.push('tp-left');
    if (isRight) cls.push('tp-right');
    if (isLeft && isRight) cls.push('tp-both');
    const val = escapeHtml(fmtValue(arr[i]));
    cellsHtml += `<div class="${cls.join(' ')}" data-idx="${i}">${val}</div>`;
  }

  // Pointer labels
  const leftLabel = `${leftName}=${leftIdx}`;
  const rightLabel = `${rightName}=${rightIdx}`;
  const leftVal = leftIdx >= 0 && leftIdx < len ? escapeHtml(fmtValue(arr[leftIdx])) : '—';
  const rightVal = rightIdx >= 0 && rightIdx < len ? escapeHtml(fmtValue(arr[rightIdx])) : '—';

  // Render the visual content into the Two Pointers body
  const leftLabelHtml = `${leftName}=${leftIdx}`;
  const rightLabelHtml = `${rightName}=${rightIdx}`;

  els.twoPtrsBody.innerHTML = `
    <div class="tp-strip">
      <span class="tp-arr">${escapeHtml(arrName)}[${len}]</span>
      <span class="tp-ptr tp-left-label">${escapeHtml(leftLabelHtml)} → ${leftVal}</span>
      <span class="tp-ptr tp-right-label">${escapeHtml(rightLabelHtml)} → ${rightVal}</span>
    </div>
    <div class="tp-array" data-left="${leftIdx}" data-right="${rightIdx}">
      ${cellsHtml}
    </div>
  `;
}

export function renderTwoPointersPanel() {
  const fam = dsaFamily(state.dsaMode);
  if (fam !== 'two-pointers') {
    els.tabTwoPtrs.hidden = true;
    els.twoPtrsBody.hidden = true;
    return;
  }
  // Show the tab family for two-pointers mode
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabTwoPtrs.hidden = false;
  // Visibility of output vs twoPtrsBody is controlled by state.outTab
  els.output.hidden = state.outTab !== 'out';
  els.twoPtrsBody.hidden = state.outTab !== 'two-pointers';
  // Render the visual content
  renderTwoPointers();
}

els.tabTwoPtrs.addEventListener('click', () => {
  if (state.steps.length) state.userTab = true;
  renderTwoPointersPanel();
});

export function initTwoPointersTab() {
  // Called from bootstrap to ensure tab exists
  if (!els.tabTwoPtrs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tabTwoPtrs';
    btn.textContent = 'Two Pointers';
    btn.hidden = true;
    els.outTabs.appendChild(btn);
    els.tabTwoPtrs = btn;
    btn.addEventListener('click', () => {
      if (state.steps.length) state.userTab = true;
      renderTwoPointersPanel();
    });
  }
}
