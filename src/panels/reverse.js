/* ═══════════════ Reverse Array/String tab (two-pointers sub-mode) ═══════════════
   Ground truth only: values come verbatim from the tracer's per-step
   snapshots. 2026-11-24: shared kit — the swapped pair flies along an arc,
   settled cells (outside [left, right]) read "in place", the whole array
   always renders from index 0 when it fits (was anchored at min(l,r)-2,
   which hid the already-reversed head). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { dsaFamily } from '../config.js';
import { changedIndices } from './pointerLogic.js';
import { syncCells, placeMarkers, cellAt, flash, playSwap, ptrChip, setCaption, setLegend } from './pointerKit.js';
import {
  detectTwoPointers, parseArrayValue, renderPointerPane, buildCells, valHtml,
  describeMoves, frozenCaption,
} from './twoPointers.js';

export function renderReversePanel() {
  const fam = dsaFamily(state.dsaMode);
  const isReverse = state.dsaMode === 'two-pointers.reverse-array-string';
  if (fam !== 'two-pointers' || !isReverse) {
    els.tabReverse.hidden = true;
    els.reverseBody.hidden = true;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabReverse.hidden = false;
  // Visibility first so the persistent view can measure its cells.
  els.output.hidden = state.outTab !== 'out';
  els.reverseBody.hidden = state.outTab !== 'reverse';
  renderReverse();
}

export function renderReverse() {
  renderPointerPane(els.reverseBody, {
    detect: detectTwoPointers,
    empty: ['No reverse pattern detected — needs two pointers swapping a sequence.', 'Use Prev/Next to navigate.'],
    build: buildReverse,
  });
}

function buildReverse(ctx) {
  const { v, det, arr, frame, prev } = ctx;
  const l = det.leftIdx, r = det.rightIdx;
  const met = l >= r;
  const { specs, pointers, roles } = buildCells(arr, det, {
    fit: ctx.fit,
    // Outside [left, right] is settled; once the pointers meet, all of it is.
    cellCls: (i) => (met || i < l || i > r ? ['tp-done'] : []),
  });
  syncCells(v.array, specs);
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(det.arrName)}[${arr.length}]</span>
    ${ptrChip(det.leftName, l, valHtml(arr, l), roles[0])}
    ${ptrChip(det.rightName, r, valHtml(arr, r), roles[1])}`;

  // Swap = cells whose value changed since the previous recorded step (the
  // swap line itself is the step before its effect shows).
  const prevStep = frame.frameStep > 0 ? state.steps[frame.frameStep - 1] : null;
  const before = parseArrayValue(prevStep?.locals?.[det.arrName]);
  const changed = changedIndices(before, arr);
  const swap = changed.length === 2 ? changed : null;

  let cap;
  if (frame.frozen) cap = frozenCaption(frame);
  else if (swap) {
    const [a, b] = swap;
    cap = `swapped ${escapeHtml(det.arrName)}[${a}] ↔ ${escapeHtml(det.arrName)}[${b}] (${valHtml(arr, b)} ↔ ${valHtml(arr, a)})`;
  } else if (changed.length) {
    cap = `${changed.length === 1 ? 'wrote' : 'changed'} ${changed.map((k) => `${escapeHtml(det.arrName)}[${k}]`).join(', ')}`;
  } else if (met) {
    cap = `<span class="tp-cap-good">${escapeHtml(det.leftName)} ≥ ${escapeHtml(det.rightName)} — pointers met, every element is in place</span>`;
  } else {
    cap = describeMoves(prev, det) || `swap ${escapeHtml(det.arrName)}[${l}] and ${escapeHtml(det.arrName)}[${r}] next`;
  }
  setCaption(v, cap);
  setLegend(v, [['tp-sw-done', 'in place (already swapped)'], ['tp-sw-live', 'not yet visited']]);
  placeMarkers(v, pointers, ctx.animate);
  if (swap && ctx.travel) playSwap(v, swap[0], swap[1], ctx.ms);
  else if (ctx.animate) for (const k of changed) flash(cellAt(v, k), 'tp-swap');
}