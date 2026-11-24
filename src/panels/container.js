/* ═══════════════ Container With Most Water tab (two-pointers sub-mode) ═══════════════
   Thin bars + one water rectangle between the pointer bars
   (2026-11-05/06 container designs). 2026-11-24 upgrade on the shared kit:
   - bars persist between steps: heights, colours and the water SLIDE
     instead of the whole pane (and the water) being rebuilt from zero;
   - the best container so far stays as a dashed outline;
   - the caption names the rule behind each move (the shorter wall moves);
   - bars outside [left, right] are dimmed — those walls are ruled out;
   - "best" is computed from the recorded heights + pointers, and the code's
     own best variable is shown by whatever name it has (was hard-coded
     `max_area`, so the template's `maxArea` read 0 and pulsed every step). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily } from '../config.js';
import { cmpSymbol, findBestLocal, pointerRoles, visibleWindow } from './pointerLogic.js';
import { syncCells, placeMarkers, flash, ptrChip, setCaption, setLegend } from './pointerKit.js';
import {
  detectTwoPointers, parseArrayValue, renderPointerPane, detectAtStep, callIdAt,
  inRange, valHtml, frozenCaption, describeMoves,
} from './twoPointers.js';

const CONTAINER_VIS_CAP = 30;
const BAR_WIDTH = 10;       // fallback bar width; the device class sets --tp-bar-w (viewport design)
const TOP_BAND = 24;        // above bars: value label (CSS padding-top)
const BOTTOM_BAND = 18;     // below bars: index label (CSS padding-bottom)
const PROVISIONAL_AVAIL_H = 200;  // factor stub for renders into a hidden body
const BODY_PAD_H = 16;      // #containerBody 8px left + 8px right
const MIN_GAP = 2;          // below this, horizontal scroll takes over
const MAX_GAP = 72;         // clamp for tiny arrays — remainder stays centered
const MIN_BAR_PX = 4;

// Kept for runner.js's resetRun contract; the scale is now derived from the
// live array height on every visible render, so there is nothing to reset.
export function resetContainerScale() { }

// Resize hook: any size change of #containerBody re-renders the container
// so bar heights / gaps / water track the tab (same step ⇒ no pulse).
let containerRO = null;
export function initContainerResize() {
  if (containerRO || typeof ResizeObserver === 'undefined') return;
  containerRO = new ResizeObserver(() => {
    if (!state.steps.length) return;
    if (state.dsaMode !== 'two-pointers.container-with-most-water') return;
    if (els.containerBody.hidden) return;
    renderContainer();
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
  els.output.hidden = state.outTab !== 'out';
  els.containerBody.hidden = state.outTab !== 'container';
  renderContainer();
}

export function renderContainer() {
  renderPointerPane(els.containerBody, {
    detect: detectTwoPointers,
    variant: 'bars',
    empty: ['No container pattern detected — needs two pointers on a height array.', 'Use Prev/Next to navigate.'],
    build: buildContainer,
  });
}

const areaOf = (h, l, r) => (inRange(h, l) && inRange(h, r) && l < r
  ? (r - l) * Math.min(h[l], h[r]) : null);

// Best container among this call's recorded frames up to `upTo` — computed
// from ground-truth heights + pointers, independent of variable names.
function bestSoFar(upTo) {
  const cid = callIdAt(upTo);
  let best = null;
  for (let i = 0; i <= upTo; i++) {
    const det = detectAtStep(detectTwoPointers, i);
    if (!det || callIdAt(i) !== cid) continue;
    const h = parseArrayValue(det.arrValue);
    if (!h) continue;
    const a = areaOf(h, det.leftIdx, det.rightIdx);
    if (a != null && (!best || a > best.area)) best = { area: a, l: det.leftIdx, r: det.rightIdx, level: Math.min(h[det.leftIdx], h[det.rightIdx]), step: i };
  }
  return best;
}

function buildContainer(ctx) {
  const { v, det, arr, frame, prev } = ctx;
  const l = det.leftIdx, r = det.rightIdx;
  const len = arr.length;
  const [roleL, roleR] = pointerRoles(det.leftName, det.rightName);
  const clamp = (x) => Math.max(0, Math.min(len - 1, x));
  // Bar width follows the device class (--tp-bar-w: phone 8 · laptop 10 · monitor 16).
  const barW = parseFloat(getComputedStyle(els.containerBody).getPropertyValue('--tp-bar-w')) || BAR_WIDTH;
  // Bars that fit the pane at the minimum gap (phones fit fewer than 30).
  const paneW = (els.containerBody.clientWidth || v.lastWidth || window.innerWidth / 2) - BODY_PAD_H;
  if (els.containerBody.clientWidth) v.lastWidth = els.containerBody.clientWidth;
  const barCap = Math.max(8, Math.min(CONTAINER_VIS_CAP, Math.floor((paneW + MIN_GAP) / (barW + MIN_GAP))));
  const [startIdx, endIdx] = visibleWindow(len, clamp(l), clamp(r), barCap);

  // Scale from the array's live height (visible) or a provisional stub.
  const nums = arr.filter((x) => typeof x === 'number');
  const maxVal = Math.max(1, ...nums);
  const minNonZero = Math.max(1, Math.min(...nums.filter((x) => x > 0), maxVal));
  const visible = !els.containerBody.hidden && v.array.clientHeight > 0;
  const availH = visible ? Math.max(60, v.array.clientHeight - TOP_BAND - BOTTOM_BAND) : PROVISIONAL_AVAIL_H;
  const factor = Math.max(availH / maxVal, MIN_BAR_PX / minNonZero);

  // Responsive horizontal spacing: gap grows with the tab width.
  const numVisible = endIdx - startIdx;
  const innerW = (els.containerBody.clientWidth || 400) - BODY_PAD_H;
  const fillGap = Math.floor((innerW - numVisible * barW) / Math.max(1, numVisible - 1));
  const gap = Math.min(MAX_GAP, Math.max(MIN_GAP, fillGap));
  v.array.style.setProperty('--gap', `${gap}px`);
  // Narrow screens: value labels would collide — keep only the pointer bars'.
  v.array.classList.toggle('tp-tight', gap < 14);

  const specs = [];
  for (let i = startIdx; i < endIdx; i++) {
    const c = ['tp-cell'];
    if (i === l) c.push(`tp-at-${roleL}`);
    if (i === r) c.push(`tp-at-${roleR}`);
    if (i === l && i === r) c.push('tp-both');
    if (l <= r && (i < l || i > r)) c.push('tp-out');
    const val = arr[i];
    const hPx = Math.max(MIN_BAR_PX, Math.round((typeof val === 'number' ? val : 0) * factor));
    specs.push({
      key: `c${i}`, idx: i, cls: c.join(' '),
      html: `<span class="tp-val">${escapeHtml(fmtValue(val))}</span>`,
      style: `height: ${hPx}px; width: ${barW}px;`,
    });
  }
  syncCells(v.array, specs);

  // Persistent overlays (water + best outline) live inside the array.
  let water = v.array.querySelector(':scope > .tp-water-container');
  if (!water) {
    water = document.createElement('div');
    water.className = 'tp-water-container hidden';
    v.array.appendChild(water);
  }
  let bestEl = v.array.querySelector(':scope > .tp-best');
  if (!bestEl) {
    bestEl = document.createElement('div');
    bestEl.className = 'tp-best hidden';
    bestEl.innerHTML = '<span class="tp-best-tag"></span>';
    v.array.appendChild(bestEl);
  }

  const level = inRange(arr, l) && inRange(arr, r) ? Math.min(arr[l], arr[r]) : 0;
  const area = areaOf(arr, l, r);
  const best = bestSoFar(frame.frameStep);
  const prevBest = frame.frameStep > 0 ? bestSoFar(frame.frameStep - 1) : null;
  const improved = !!best && best.step === frame.frameStep && (!prevBest || best.area > prevBest.area);
  const loc = state.steps[frame.frameStep]?.locals || {};
  const bestVar = findBestLocal(loc, [det.leftName, det.rightName, 'currentArea', 'current_area', 'area', 'curr', 'cur']);

  placeRect(v, water, l, r, level * factor, area != null && level > 0);
  placeRect(v, bestEl, best ? best.l : -1, best ? best.r : -1, best ? best.level * factor : 0,
    !!best && !(best.l === l && best.r === r));
  if (best) bestEl.firstChild.textContent = `best ${best.area}`;

  const areaTxt = area != null ? `area = ${r - l} × ${level} = ${area}` : 'area = —';
  const bestTxt = best ? `best so far ${best.area}` : 'best so far —';
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(det.arrName)}[${len}]</span>
    ${ptrChip(det.leftName, l, valHtml(arr, l), roleL)}
    ${ptrChip(det.rightName, r, valHtml(arr, r), roleR)}
    <span class="tp-area">${areaTxt}</span>
    <span class="tp-badge${improved ? ' tp-badge-good' : ''}">${bestTxt}${bestVar ? ` · ${escapeHtml(bestVar)} = ${loc[bestVar]}` : ''}</span>`;

  let cap;
  if (frame.frozen) cap = frozenCaption(frame);
  else if (prev && inRange(arr, prev.leftIdx) && inRange(arr, prev.rightIdx)) {
    const a = arr[prev.leftIdx], b = arr[prev.rightIdx];
    const pre = `${escapeHtml(det.arrName)}[${prev.leftIdx}]=${a} ${cmpSymbol(a, b)} ${escapeHtml(det.arrName)}[${prev.rightIdx}]=${b}`;
    const why = a === b
      ? 'equal walls — neither can hold more water with a narrower gap, so either may move'
      : "the shorter wall limits the water, so keeping it can't do better";
    if (l > prev.leftIdx && r === prev.rightIdx) {
      cap = `${pre} → <b>${escapeHtml(det.leftName)}</b> moves in: ${why}`;
    } else if (r < prev.rightIdx && l === prev.leftIdx) {
      cap = `${pre} → <b>${escapeHtml(det.rightName)}</b> moves in: ${why}`;
    } else {
      cap = describeMoves(prev, det);
    }
  }
  if (improved && !frame.frozen) cap = `<span class="tp-cap-good">new best: ${best.area}</span>${cap ? ' · ' + cap : ''}`;
  if (!cap) cap = l >= r ? '<span class="tp-cap-good">pointers met — every wall pair worth trying has been tried</span>' : 'water fills up to the shorter wall';
  setCaption(v, cap);
  setLegend(v, [['tp-sw-water', 'current container'], ['tp-sw-best', 'best so far'], ['tp-sw-out', 'ruled out']]);
  placeMarkers(v, [
    { name: det.leftName, idx: l, role: roleL },
    { name: det.rightName, idx: r, role: roleR },
  ], ctx.animate);
  if (ctx.animate && improved) flash(water, 'tp-pulse');
}

// Position an overlay rectangle between the inner edges of bars l and r,
// `heightPx` tall from the baseline. Geometry is read synchronously (the
// cells were just reconciled), so no requestAnimationFrame is needed.
function placeRect(v, el, l, r, heightPx, show) {
  const lb = v.array.querySelector(`:scope > [data-idx="${l}"]`);
  const rb = v.array.querySelector(`:scope > [data-idx="${r}"]`);
  const base = v.array.getBoundingClientRect();
  if (!show || !lb || !rb || l >= r || !base.width || heightPx <= 0) {
    el.classList.add('hidden');
    return;
  }
  const lr = lb.getBoundingClientRect(), rr = rb.getBoundingClientRect();
  const left = lr.right - base.left + v.array.scrollLeft;
  const width = rr.left - lr.right;
  if (width <= 0) { el.classList.add('hidden'); return; }
  const wasHidden = el.classList.contains('hidden');
  if (wasHidden) el.style.transition = 'none';
  el.classList.remove('hidden');
  el.style.left = `${left}px`;
  el.style.width = `${width}px`;
  el.style.height = `${Math.round(heightPx)}px`;
  if (wasHidden) { void el.offsetWidth; el.style.transition = ''; }
}