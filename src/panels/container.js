/* ═══════════════ Container With Most Water tab (two-pointers sub-mode) ═══════════════
   Mirrors reverse.js/palindrome.js: id-keyed tab, ground-truth-only animation,
   strobe-guarded pulse on max_area update.
   Proportional bar heights (2026-11-05-container-proportional-bars-design.md):
   - Scaling factor computed once from full array max & available height
   - Minimum 4px bar height for visibility
   - Bottom-aligned baseline, value labels above bars
   - Flat water line at waterLevel across container */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily } from '../config.js';
import { hideOutTabsAll } from './shared.js';
import { detectTwoPointers, parseArrayValue } from './twoPointers.js';

const CONTAINER_VIS_CAP = 30;

// Last rendered step — pulse fires only on a DIFFERENT step (no strobe on re-renders).
let lastRenderedStep = -1;

// Scaling cache: computed once at first detection, constant across all steps (Q3).
// { factor, maxVal, availHeight, minBarPx }
let containerScale = { factor: null, maxVal: null, availHeight: null, minBarPx: 4 };

export function renderContainerPanel() {
  const fam = dsaFamily(state.dsaMode);
  const isContainer = state.dsaMode === 'two-pointers.container-with-most-water';
  if (fam !== 'two-pointers' || !isContainer) {
    els.tabContainer.hidden = true;
    els.containerBody.hidden = true;
    return;
  }
  // Show the tab family for the container sub-mode
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabContainer.hidden = false;
  // Content first (renderContainer may auto-switch state.outTab / state.idx),
  // then visibility follows the (possibly updated) state.
  renderContainer();
  els.output.hidden = state.outTab !== 'out';
  els.containerBody.hidden = state.outTab !== 'container';
}

export function renderContainer() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }

  const locals = state.steps[state.idx]?.locals || {};
  const detection = detectTwoPointers(locals);

  // One-time auto-switch: tab appears on first detection if user hasn't picked manually
  if (detection && !state.userTab && !state.containerAnnounced) {
    state.containerAnnounced = true;
    state.outTab = 'container';
  }

  // If detection fails (e.g., final step after return), auto-advance to first valid step
  if (!detection && !state.userTab) {
    for (let i = 0; i < state.steps.length; i++) {
      const det = detectTwoPointers(state.steps[i]?.locals || {});
      if (det) {
        state.idx = i;
        if (!state.containerAnnounced) {
          state.containerAnnounced = true;
          state.outTab = 'container';
        }
        renderContainerPanelContent(det);
        return;
      }
    }
  }

  renderContainerPanelContent(detection);
}

// Renders the current step's container visual into els.containerBody.
// Ground truth only: height, left, right, max_area come verbatim from tracer snapshots.
function renderContainerPanelContent(detection) {
  if (!detection) {
    els.containerBody.innerHTML = `
      <div class="tp-strip">No container pattern detected — needs two pointers on a height array.</div>
      <div class="tp-empty">Use Prev/Next to navigate.</div>
    `;
    lastRenderedStep = -1;
    return;
  }

  const { arrName, arrValue, leftName, rightName, leftIdx, rightIdx } = detection;
  const arr = parseArrayValue(arrValue);
  if (!arr) { els.containerBody.innerHTML = ''; lastRenderedStep = -1; return; }

  const len = arr.length;
  const visLen = Math.min(len, CONTAINER_VIS_CAP);
  const startIdx = Math.max(0, Math.min(leftIdx, rightIdx) - 2);
  const endIdx = Math.min(len, startIdx + visLen);

  // Current step's max_area from tracer (ground truth)
  const maxAreaNow = typeof state.steps[state.idx]?.locals?.max_area === 'number'
    ? state.steps[state.idx].locals.max_area
    : 0;

  // Previous step's max_area for pulse detection
  let maxAreaPrev = -1;
  const prevStep = state.idx > 0 ? state.steps[state.idx - 1] : null;
  if (prevStep && typeof prevStep.locals?.max_area === 'number') {
    maxAreaPrev = prevStep.locals.max_area;
  }

  // Pulse on max_area INCREASE (strobe-guarded: only when step actually changes)
  const strobe = state.idx !== lastRenderedStep;
  const pulse = strobe && maxAreaNow > maxAreaPrev;
  lastRenderedStep = state.idx;

  // Water level = min(height[left], height[right])
  const waterLevel = (leftIdx >= 0 && rightIdx >= 0 && leftIdx < len && rightIdx < len)
    ? Math.min(arr[leftIdx], arr[rightIdx])
    : 0;
  const currentArea = (leftIdx >= 0 && rightIdx >= 0 && leftIdx < len && rightIdx < len)
    ? (rightIdx - leftIdx) * waterLevel
    : 0;

  // Compute scaling factor ONCE (first render with this array), then reuse
  // Available height = containerBody clientHeight minus strip (~40px) and padding
  if (containerScale.factor === null || containerScale.maxVal !== Math.max(...arr)) {
    const maxVal = Math.max(...arr);
    const containerEl = els.containerBody;
    const stripEl = containerEl.querySelector('.tp-strip');
    const stripH = stripEl ? stripEl.offsetHeight : 40;
    const padding = 24; // top+bottom padding
    const availH = Math.max(50, containerEl.clientHeight - stripH - padding);
    // Factor so maxVal maps to availH, with minimum bar enforcement
    const rawFactor = availH / maxVal;
    // Ensure minimum bar height of 4px for value=1
    const factor = Math.max(rawFactor, 4 / Math.max(1, Math.min(...arr.filter(v => v > 0))));
    containerScale = { factor, maxVal, availHeight: availH, minBarPx: 4 };
  }

  const { factor, minBarPx } = containerScale;
  const maxHeight = Math.max(...arr);

  // Build array strip cells with proportional heights and water fill
  let cellsHtml = '';
  for (let i = startIdx; i < endIdx; i++) {
    const isLeft = i === leftIdx;
    const isRight = i === rightIdx;
    const cls = ['tp-cell'];
    if (isLeft) cls.push('tp-left');
    if (isRight) cls.push('tp-right');
    if (isLeft && isRight) cls.push('tp-both');
    if (pulse) cls.push('tp-pulse');

    const val = arr[i];
    // Proportional bar height with minimum enforcement
    const barHeightPx = Math.max(minBarPx, Math.round(val * factor));
    // Water height within this cell: up to waterLevel, capped at cell height
    let waterHeightPx = 0;
    if (i > leftIdx && i < rightIdx && waterLevel > 0) {
      waterHeightPx = Math.min(barHeightPx, Math.round(Math.min(val, waterLevel) * factor));
    }

    const valStr = escapeHtml(fmtValue(val));
    cellsHtml += `
      <div class="${cls.join(' ')}" data-idx="${i}" style="height: ${barHeightPx}px;">
        <span class="tp-val">${valStr}</span>
        <div class="tp-water" style="height: ${waterHeightPx}px;"></div>
      </div>
    `;
  }

  const leftVal = leftIdx >= 0 && leftIdx < len ? escapeHtml(fmtValue(arr[leftIdx])) : '—';
  const rightVal = rightIdx >= 0 && rightIdx < len ? escapeHtml(fmtValue(arr[rightIdx])) : '—';

  // Area badge with pulse
  const areaBadge = pulse
    ? `<span class="tp-area tp-pulse">area = ${currentArea} (max ${maxAreaNow})</span>`
    : `<span class="tp-area">area = ${currentArea} (max ${maxAreaNow})</span>`;

  // Mark the array as container mode for CSS
  els.containerBody.innerHTML = `
    <div class="tp-strip">
      <span class="tp-arr">${escapeHtml(arrName)}[${len}]</span>
      <span class="tp-ptr tp-left-label">${escapeHtml(leftName)}=${leftIdx} → ${leftVal}</span>
      <span class="tp-ptr tp-right-label">${escapeHtml(rightName)}=${rightIdx} → ${rightVal}</span>
      <span class="tp-arr">${areaBadge}</span>
    </div>
    <div class="tp-array" data-container data-left="${leftIdx}" data-right="${rightIdx}">
      ${cellsHtml}
    </div>
  `;
}