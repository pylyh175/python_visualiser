/* ═══════════════ Container With Most Water tab (two-pointers sub-mode) ═══════════════
   Mirrors reverse.js/palindrome.js: id-keyed tab, ground-truth-only animation,
   strobe-guarded pulse on max_area update.
   Water between thin bars (2026-11-05-container-water-between-bars-design.md):
   - Fixed 8px bars with flexible gaps
   - Single water rectangle between pointer bars
   - Water height = min(height[left], height[right])
   - Smooth transitions on pointer moves */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily } from '../config.js';
import { hideOutTabsAll } from './shared.js';
import { detectTwoPointers, parseArrayValue } from './twoPointers.js';

const CONTAINER_VIS_CAP = 30;
// Thin fixed bars (2026-11-06-container-finalized-bars-design.md Q3)
const BAR_WIDTH = 10;  // fixed thin bar width (matches CSS)

// Label clearance bands (Q2) — CSS mirrors these exact values:
const TOP_BAND = 24;      // above bars: value label (tp-val top:-16)
const BOTTOM_BAND = 18;   // below bars: index label (::before bottom:-14)
const BODY_PAD = 8;       // #containerBody 4px top + 4px bottom
const STRIP_MARGIN = 8;   // .tp-strip margin-bottom
const PROVISIONAL_AVAIL_H = 300;  // factor stub for renders into a hidden body
// Responsive horizontal spacing (2026-11-06-responsive-container-bars-design.md R2):
const BODY_PAD_H = 16;    // #containerBody 8px left + 8px right
const MIN_GAP = 2;        // below this, horizontal scroll takes over
const MAX_GAP = 72;       // clamp for tiny arrays — remainder stays centered

// Last rendered step — pulse fires only on a DIFFERENT step (no strobe on re-renders).
let lastRenderedStep = -1;

// Responsive scale (2026-11-06-responsive-container-bars-design.md R1,
// superseding the locked-scale Q1 of the finalized-bars design): recomputed
// whenever the pane height or the array max changes, so bars/water always fit
// the CURRENT tab size. Only VISIBLE renders write the cache — a hidden body
// has no usable clientHeight (staleness here was the original growth bug);
// hidden renders use a provisional, uncached factor. resetRun →
// resetContainerScale() still gives every new run a clean first measurement.
let containerScale = null;

export function resetContainerScale() {
  containerScale = null;
}

// Resize hook (R3): any size change of #containerBody re-renders the container
// path so bar heights/gaps/water track the tab. Strobe guard keeps these
// re-renders pulse-free (same step ⇒ no pulse).
let containerRO = null;

export function initContainerResize() {
  if (containerRO || typeof ResizeObserver === 'undefined') return;
  containerRO = new ResizeObserver(() => {
    if (!state.steps.length) return;
    if (state.dsaMode !== 'two-pointers.container-with-most-water') return;
    if (els.containerBody.hidden) return;
    renderContainerPanel();
  });
  containerRO.observe(els.containerBody);
}

export function renderContainerPanel() {
  const fam = dsaFamily(state.dsaMode);
  const isContainer = state.dsaMode === 'two-pointers.container-with-most-water';
  if (fam !== 'two-pointers' || !isContainer) {
    els.tabContainer.hidden = true;
    els.containerBody.hidden = true;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabContainer.hidden = false;
  renderContainer();
  els.output.hidden = state.outTab !== 'out';
  els.containerBody.hidden = state.outTab !== 'container';
}

export function renderContainer() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }

  const locals = state.steps[state.idx]?.locals || {};
  const detection = detectTwoPointers(locals);

  if (detection && !state.userTab && !state.containerAnnounced) {
    state.containerAnnounced = true;
    state.outTab = 'container';
  }

  // ONE-TIME (2026-11-06 navigation fix, mirrors reverse.js): the advance is
  // gated on the same containerAnnounced latch — every detection-less render
  // used to re-fire the scan and hijack step navigation (Next from an early
  // step snapped back to the first detected step; stepping into the final step
  // teleported back too, because its merged snapshot fails detection).
  if (!detection && !state.userTab && !state.containerAnnounced) {
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
// Ground truth only: height, left, right, max_area from tracer snapshots.
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
  // For small arrays (<= CONTAINER_VIS_CAP), always show all bars
  // by anchoring the window at the start. Only use pointer-centric window
  // for large arrays where windowing is necessary.
  let startIdx, endIdx;
  if (len <= CONTAINER_VIS_CAP) {
    startIdx = 0;
    endIdx = len;
  } else {
    startIdx = Math.max(0, Math.min(leftIdx, rightIdx) - 2);
    endIdx = Math.min(len, startIdx + visLen);
  }
  console.log('[container] Step', state.idx, ':', { leftIdx, rightIdx, len, visLen, startIdx, endIdx, visibleCount: endIdx - startIdx });

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

  // Pulse on max_area INCREASE (strobe-guarded)
  const strobe = state.idx !== lastRenderedStep;
  const pulse = strobe && maxAreaNow > maxAreaPrev;
  lastRenderedStep = state.idx;

  // Water level = min(height[left], height[right]) — update module-level for positionWater()
  waterLevel = (leftIdx >= 0 && rightIdx >= 0 && leftIdx < len && rightIdx < len)
    ? Math.min(arr[leftIdx], arr[rightIdx])
    : 0;
  const currentArea = (leftIdx >= 0 && rightIdx >= 0 && leftIdx < len && rightIdx < len)
    ? (rightIdx - leftIdx) * waterLevel
    : 0;

  // Responsive scale (R1): recomputed whenever the pane height or the array
  // max changes; only visible renders write the cache (hidden bodies have no
  // usable clientHeight — a stale measurement here was the original growth bug).
  const maxVal = Math.max(...arr);
  const containerEl = els.containerBody;
  if (!els.containerBody.hidden) {
    const stripEl = containerEl.querySelector('.tp-strip');
    const stripH = stripEl ? stripEl.offsetHeight : 36;
    // Bands (Q2): TOP_BAND above bars for the value label, BOTTOM_BAND below
    // bars for the index label; BODY_PAD + STRIP_MARGIN are the fixed chrome.
    const availH = Math.max(80, containerEl.clientHeight - stripH - STRIP_MARGIN - BODY_PAD - TOP_BAND - BOTTOM_BAND);
    const minNonZero = Math.max(1, Math.min(...arr.filter(v => v > 0)));
    if (!containerScale || containerScale.maxVal !== maxVal || containerScale.availHeight !== availH) {
      containerScale = {
        factor: Math.max(availH / maxVal, 4 / minNonZero),
        maxVal,
        availHeight: availH,
        minBarPx: 4,
      };
    }
  }
  // Hidden-body render: provisional factor, NOT cached (scale re-locks on the
  // first visible render of this run).
  const factor = containerScale
    ? containerScale.factor
    : Math.max(PROVISIONAL_AVAIL_H / maxVal, 4 / Math.max(1, Math.min(...arr.filter(v => v > 0))));
  const minBarPx = 4;

  // Both pointers in visible window?
  const leftInView = leftIdx >= startIdx && leftIdx < endIdx;
  const rightInView = rightIdx >= startIdx && rightIdx < endIdx;
  const bothInView = leftInView && rightInView;

  // Responsive horizontal spacing (R2): the gap grows with the tab width so
  // the group fills it, clamped to [MIN_GAP, MAX_GAP] — beyond the clamp the
  // CSS `safe center` keeps the row centered; below MIN_GAP the x-scroll
  // takes over (very large arrays).
  const numVisible = endIdx - startIdx;
  const gapsNeeded = Math.max(1, numVisible - 1);
  const innerW = (containerEl?.clientWidth || 400) - BODY_PAD_H;
  const fillGap = Math.floor((innerW - numVisible * BAR_WIDTH) / gapsNeeded);
  const estGap = Math.min(MAX_GAP, Math.max(MIN_GAP, fillGap));

  // Build bar cells
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
    const barHeightPx = Math.max(minBarPx, Math.round(val * factor));
    const valStr = escapeHtml(fmtValue(val));

    cellsHtml += `
      <div class="${cls.join(' ')}" data-idx="${i}" data-array-idx="${i}" style="height: ${barHeightPx}px; width: ${BAR_WIDTH}px;">
        <span class="tp-val">${valStr}</span>
      </div>
    `;
  }

  const leftVal = leftIdx >= 0 && leftIdx < len ? escapeHtml(fmtValue(arr[leftIdx])) : '—';
  const rightVal = rightIdx >= 0 && rightIdx < len ? escapeHtml(fmtValue(arr[rightIdx])) : '—';

  // Area badge with pulse
  const areaBadge = pulse
    ? `<span class="tp-area tp-pulse">area = ${currentArea} (max ${maxAreaNow})</span>`
    : `<span class="tp-area">area = ${currentArea} (max ${maxAreaNow})</span>`;

  // Water container element (only if both pointers in view)
  let waterHtml = '';
  if (bothInView && waterLevel > 0) {
    // Position will be set after layout via JS
    waterHtml = `<div class="tp-water-container" style="height: 0px;"></div>`;
  } else {
    waterHtml = `<div class="tp-water-container hidden"></div>`;
  }

  els.containerBody.innerHTML = `
    <div class="tp-strip">
      <span class="tp-arr">${escapeHtml(arrName)}[${len}]</span>
      <span class="tp-ptr tp-left-label">${escapeHtml(leftName)}=${leftIdx} → ${leftVal}</span>
      <span class="tp-ptr tp-right-label">${escapeHtml(rightName)}=${rightIdx} → ${rightVal}</span>
      <span class="tp-arr">${areaBadge}</span>
    </div>
    <div class="tp-array" data-container data-left="${leftIdx}" data-right="${rightIdx}" style="--gap: ${estGap}px;">
      ${cellsHtml}
      ${waterHtml}
    </div>
  `;

  // After paint: position the water container using actual bar positions
  if (bothInView && waterLevel > 0) {
    // Use requestAnimationFrame to wait for layout
    requestAnimationFrame(() => positionWater());
  }
}

// Position water container between the two pointer bars
function positionWater() {
  const arrayEl = els.containerBody?.querySelector('.tp-array[data-container]');
  if (!arrayEl) return;

  const leftIdx = parseInt(arrayEl.dataset.left, 10);
  const rightIdx = parseInt(arrayEl.dataset.right, 10);
  if (leftIdx >= rightIdx) return;

  const leftBar = arrayEl.querySelector(`.tp-cell[data-array-idx="${leftIdx}"]`);
  const rightBar = arrayEl.querySelector(`.tp-cell[data-array-idx="${rightIdx}"]`);
  const waterEl = arrayEl.querySelector('.tp-water-container');
  if (!leftBar || !rightBar || !waterEl) return;

  const arrayRect = arrayEl.getBoundingClientRect();
  const leftRect = leftBar.getBoundingClientRect();
  const rightRect = rightBar.getBoundingClientRect();

  // Water spans from right edge of left bar to left edge of right bar
  const waterLeft = leftRect.right - arrayRect.left;
  const waterWidth = rightRect.left - leftRect.right;
  // Scale locked per run (Q1): factor 0 before the lock keeps the water hidden
  // until bars have their final, locked scale.
  const waterHeight = Math.round(waterLevel * (containerScale ? containerScale.factor : 0));

  if (waterWidth <= 0 || waterHeight <= 0) {
    waterEl.classList.add('hidden');
    return;
  }

  waterEl.classList.remove('hidden');
  waterEl.style.left = `${waterLeft}px`;
  waterEl.style.width = `${waterWidth}px`;
  waterEl.style.height = `${waterHeight}px`;

  // Pulse class on water container too
  if (arrayEl.querySelector('.tp-cell.tp-pulse')) {
    waterEl.classList.add('tp-pulse');
  } else {
    waterEl.classList.remove('tp-pulse');
  }
}

// Store waterLevel for positionWater closure
let waterLevel = 0;