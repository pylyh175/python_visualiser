/* ═══════════════ Two Pointers visualiser (Two Pointers tab) ═══════════════
   Detection + frame resolution shared by every two-pointers pane, and the
   pane for the generic mode and its Two Sum / Remove Duplicate sub-modes
   (2026-11-24 visualisation-upgrade design: shared kit, sliding markers,
   settled regions, ground-truth captions, ghost slots, pin control). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';
import { dsaFamily, dsaEntryById } from '../config.js';
import { hideOutTabsAll } from './shared.js';
import {
  PTR_NAME_PAIRS, detectSequencePointers, pointerRoles, pointerBands,
  changedIndices, cmpSymbol, findNumberLocal,
} from './pointerLogic.js';
import {
  ensureView, showMessage, beginFrame, syncCells, placeMarkers, cellAt, flash,
  ptrChip, setCaption, setLegend, renderPin, onPin, fitCells, gapSpec,
} from './pointerKit.js';

export { PTR_NAME_PAIRS };

const TWOPTR_VIS_CAP = 30;  // max array elements displayed

// Two pointers over a list/tuple in one step's locals. Uses the run's static
// index hints (which names really index which array) and the user's pin.
export function detectTwoPointers(locals) {
  return detectSequencePointers(locals, {
    kind: 'array', hints: state.pointerHints, pin: state.pointerPin,
  });
}

// Parse array value from tracer's serialized format.
export function parseArrayValue(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

/* ---------- per-run detection cache ----------
   resolveDetectedFrame / prevFrame / best-so-far scans revisit the same
   steps on every render; detection is a pure function of (step, detector,
   hints, pin), so memoise it per run. A new trace (new steps array) or a
   pin change starts a fresh cache. */
let cache = { steps: null, map: new Map() };
export function clearDetectCache() { cache = { steps: null, map: new Map() }; }
onPin(clearDetectCache);

export function detectAtStep(detect, i) {
  if (cache.steps !== state.steps) cache = { steps: state.steps, map: new Map() };
  let memo = cache.map.get(detect);
  if (!memo) { memo = new Array(state.steps.length); cache.map.set(detect, memo); }
  if (memo[i] === undefined) memo[i] = detect(state.steps[i]?.locals || {}) || null;
  return memo[i];
}

// Deterministic persistent-animation frame (2026-11-20 jump-sync fix):
//   1. the step's own detection — a real, non-frozen frame;
//   2. the nearest EARLIER detected step — the last ground truth the code had;
//   3. the nearest LATER detected step — a jump before the pattern engaged;
//   4. null — the whole trace never detected (honest empty state).
// `frozen` tells the renderer to suppress pulses/flights: the frame belongs
// to another step, so it is not a new animation event.
export function resolveDetectedFrame(detect, idx = state.idx) {
  const n = state.steps.length;
  const own = detectAtStep(detect, idx);
  if (own) return { detection: own, frameStep: idx, frozen: false };
  for (let i = idx - 1; i >= 0; i--) {
    const det = detectAtStep(detect, i);
    if (det) return { detection: det, frameStep: i, frozen: true };
  }
  for (let i = idx + 1; i < n; i++) {
    const det = detectAtStep(detect, i);
    if (det) return { detection: det, frameStep: i, frozen: true };
  }
  return null;
}

// Innermost frame id at a step (frames of one call share it).
export function callIdAt(i) {
  const st = state.steps[i]?.stack || [];
  return st.length ? st[st.length - 1].id : null;
}

// The nearest earlier detected step of the SAME call — what the pointers
// looked like one move ago. Captions describe the change between the two.
export function prevFrame(detect, frameStep) {
  const cid = callIdAt(frameStep);
  for (let i = frameStep - 1; i >= 0; i--) {
    const det = detectAtStep(detect, i);
    if (!det) continue;
    return callIdAt(i) === cid ? { detection: det, step: i } : null;
  }
  return null;
}

// One-time engage for a pointer pane, run by render() BEFORE anything is
// drawn: when the current step has no detection, jump to the first step that
// does, and (for sub-mode panes) switch to the pane's tab. Gated on the
// pane's announce latch so it fires once per run and never fights the user.
export function engagePointerPane(detect, latchKey, tab = null) {
  if (!state.steps.length || state.userTab || state[latchKey]) return;
  const hit = (i) => detectAtStep(detect, i);
  let at = hit(state.idx) ? state.idx : -1;
  for (let i = 0; at < 0 && i < state.steps.length; i++) if (hit(i)) at = i;
  if (at < 0) return;   // never detected: stay put, the pane shows its empty state
  state.idx = at;
  state[latchKey] = true;
  if (tab) state.outTab = tab;
}

/* ---------- shared cell + caption builders (used by every array pane) ---------- */

export const inRange = (arr, i) => i >= 0 && i < arr.length;
export const valHtml = (arr, i, fmt = fmtValue) => (inRange(arr, i) ? escapeHtml(fmt(arr[i])) : '—');

// Cells for the visible bands plus ghost slots (-1 / len) when a pointer
// has stepped off an end. `fit` = cells that fit the pane (fitCells): the
// whole sequence when it fits, else a window around EACH pointer with a
// "…N…" gap between (2026-11-24 viewport design — a single window cropped
// the far pointer of a converging pair on narrow screens).
// cellCls(i) adds region classes per index.
export function buildCells(arr, det, { fit = TWOPTR_VIS_CAP, cellCls = () => [], fmt = fmtValue } = {}) {
  const len = arr.length;
  const l = det.leftIdx, r = det.rightIdx;
  const ghosts = (l === -1 || r === -1 ? 1 : 0) + (l === len || r === len ? 1 : 0);
  const bands = pointerBands(len, l, r, Math.max(3, Math.min(TWOPTR_VIS_CAP, fit) - ghosts));
  const start = bands[0][0], end = bands[bands.length - 1][1];
  const [roleL, roleR] = pointerRoles(det.leftName, det.rightName);
  const ptrCls = (i) => {
    const c = [];
    if (i === l) c.push(`tp-at-${roleL}`);
    if (i === r) c.push(`tp-at-${roleR}`);
    if (i === l && i === r) c.push('tp-both');
    return c;
  };
  const specs = [];
  if (start === 0 && (l === -1 || r === -1)) {
    specs.push({ key: 'ghost-lo', idx: -1, text: '', cls: ['tp-cell', 'tp-ghost', ...ptrCls(-1)].join(' '), title: 'one slot before the start — the pointer has left the array' });
  }
  bands.forEach(([s, e], b) => {
    if (b > 0) specs.push(gapSpec(`gap${b}`, s - bands[b - 1][1]));
    for (let i = s; i < e; i++) {
      specs.push({ key: `c${i}`, idx: i, text: fmt(arr[i]), cls: ['tp-cell', ...ptrCls(i), ...cellCls(i)].join(' ') });
    }
  });
  if (end === len && (l === len || r === len)) {
    specs.push({ key: 'ghost-hi', idx: len, text: '', cls: ['tp-cell', 'tp-ghost', ...ptrCls(len)].join(' '), title: 'one past the end — the pointer has left the array' });
  }
  return {
    specs, start, end, roles: [roleL, roleR],
    pointers: [
      { name: det.leftName, idx: l, role: roleL },
      { name: det.rightName, idx: r, role: roleR },
    ],
  };
}

// "left 0 → 1 · right 5 → 4" for whichever pointers moved.
export function describeMoves(prevDet, det) {
  if (!prevDet) return '';
  const parts = [];
  if (prevDet.leftIdx !== det.leftIdx) parts.push(`${det.leftName} ${prevDet.leftIdx} → ${det.leftIdx}`);
  if (prevDet.rightIdx !== det.rightIdx) parts.push(`${det.rightName} ${prevDet.rightIdx} → ${det.rightIdx}`);
  return parts.map(escapeHtml).join(' · ');
}

export function frozenCaption(frame) {
  return `<span class="tp-cap-muted">⏸ holding step ${frame.frameStep + 1}'s pointers — this step runs outside the two-pointer loop</span>`;
}

// Shared render flow for every array pane: resolve the frame, build the
// persistent view, hand the per-mode builder everything it needs.
export function renderPointerPane(body, { detect, kind = 'array', variant = 'cells', empty, build }) {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const frame = resolveDetectedFrame(detect, state.idx);
  if (!frame) {
    state.lastValidFrame = -1;
    showMessage(body, empty[0], empty[1]);
    return;
  }
  state.lastValidFrame = frame.frameStep;
  const det = frame.detection;
  const arr = kind === 'string' ? det.arrValue : parseArrayValue(det.arrValue);
  if (!arr) { showMessage(body, empty[0], empty[1]); return; }
  const v = ensureView(body, variant);
  const f = beginFrame(v);
  const prev = prevFrame(detect, frame.frameStep);
  const prevArr = prev ? (kind === 'string' ? prev.detection.arrValue : parseArrayValue(prev.detection.arrValue)) : null;
  const fit = fitCells(v);
  v.lastFit = fit;
  build({
    v, det, arr, frame, prev: prev && prev.detection, prevArr, fit,
    animate: f.newStep && !frame.frozen,          // flashes / pulses
    travel: f.forward && !frame.frozen && f.ms > 0, // flights (single forward step only)
    ms: f.ms,
  });
  renderPin(v, state.steps[frame.frameStep]?.locals, kind);
}

/* ---------- the generic / Two Sum / Remove Duplicate pane ---------- */

function buildGeneric(ctx) {
  const { v, det, arr, frame, prev } = ctx;
  const { specs, pointers, roles } = buildCells(arr, det, { fit: ctx.fit });
  syncCells(v.array, specs);
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(det.arrName)}[${arr.length}]</span>
    ${ptrChip(det.leftName, det.leftIdx, valHtml(arr, det.leftIdx), roles[0])}
    ${ptrChip(det.rightName, det.rightIdx, valHtml(arr, det.rightIdx), roles[1])}`;
  setCaption(v, frame.frozen ? frozenCaption(frame) : (describeMoves(prev, det) || '<span class="tp-cap-muted">no pointer moved on this step</span>'));
  setLegend(v, []);
  placeMarkers(v, pointers, ctx.animate);
}

const TARGET_NAMES = ['target', 'goal', 'want', 'k', 't', 'sum', 'total'];

function buildTwoSum(ctx) {
  const { v, det, arr, frame, prev } = ctx;
  const l = det.leftIdx, r = det.rightIdx;
  const loc = state.steps[frame.frameStep]?.locals || {};
  const tName = findNumberLocal(loc, TARGET_NAMES, [det.leftName, det.rightName, det.arrName]);
  const target = tName ? loc[tName] : null;
  const both = inRange(arr, l) && inRange(arr, r);
  const sum = both ? arr[l] + arr[r] : null;
  const numeric = typeof sum === 'number';
  // Converging search: everything outside [left, right] has been ruled out.
  const { specs, pointers, roles } = buildCells(arr, det, {
    fit: ctx.fit,
    cellCls: (i) => (l <= r && (i < l || i > r) ? ['tp-out'] : []),
  });
  syncCells(v.array, specs);

  let badge = '';
  if (numeric) {
    const rel = target != null ? cmpSymbol(sum, target) : null;
    const tone = rel === '=' ? 'tp-badge-good' : rel ? 'tp-badge-warn' : '';
    badge = `<span class="tp-badge ${tone}">${escapeHtml(fmtValue(arr[l]))} + ${escapeHtml(fmtValue(arr[r]))} = ${sum}${rel ? ` ${rel} ${escapeHtml(tName)} ${target}` : ''}</span>`;
  }
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(det.arrName)}[${arr.length}]</span>
    ${ptrChip(det.leftName, l, valHtml(arr, l), roles[0])}
    ${ptrChip(det.rightName, r, valHtml(arr, r), roles[1])}
    ${badge}`;

  let cap;
  if (frame.frozen) cap = frozenCaption(frame);
  else if (numeric && target != null && sum === target) {
    cap = `<span class="tp-cap-good">✓ ${escapeHtml(det.arrName)}[${l}] + ${escapeHtml(det.arrName)}[${r}] = ${target} — pair found</span>`;
  } else if (prev && target != null && inRange(arr, prev.leftIdx) && inRange(arr, prev.rightIdx)) {
    const ps = arr[prev.leftIdx] + arr[prev.rightIdx];
    if (l > prev.leftIdx && r === prev.rightIdx) {
      cap = `sum ${ps} ${cmpSymbol(ps, target)} ${escapeHtml(tName)} ${target} → <b>${escapeHtml(det.leftName)}</b> moved ${prev.leftIdx} → ${l}${ps < target ? ' (need a bigger sum)' : ''}`;
    } else if (r < prev.rightIdx && l === prev.leftIdx) {
      cap = `sum ${ps} ${cmpSymbol(ps, target)} ${escapeHtml(tName)} ${target} → <b>${escapeHtml(det.rightName)}</b> moved ${prev.rightIdx} → ${r}${ps > target ? ' (need a smaller sum)' : ''}`;
    } else {
      cap = describeMoves(prev, det);
    }
  }
  if (!cap) cap = numeric ? `compare ${escapeHtml(det.arrName)}[${l}] + ${escapeHtml(det.arrName)}[${r}] with ${tName ? escapeHtml(tName) : 'the target'}` : describeMoves(prev, det);
  setCaption(v, cap);
  setLegend(v, [['tp-sw-live', 'still possible'], ['tp-sw-out', 'ruled out']]);
  placeMarkers(v, pointers, ctx.animate);
  if (ctx.animate && numeric && target != null && sum === target) {
    flash(cellAt(v, l), 'tp-found');
    flash(cellAt(v, r), 'tp-found');
  }
}

function buildRemoveDuplicates(ctx) {
  const { v, det, arr, frame, prev, prevArr } = ctx;
  const [roleA, roleB] = pointerRoles(det.leftName, det.rightName);
  // Writer = the slow pointer (i / slow / write …), reader = the fast one.
  const writerIsLeft = !(roleA === 'fast' || roleB === 'slow');
  const wName = writerIsLeft ? det.leftName : det.rightName;
  const rName = writerIsLeft ? det.rightName : det.leftName;
  const w = writerIsLeft ? det.leftIdx : det.rightIdx;
  const r = writerIsLeft ? det.rightIdx : det.leftIdx;
  const { specs, pointers, roles } = buildCells(arr, det, {
    fit: ctx.fit,
    cellCls: (i) => (i < w ? ['tp-kept'] : (w <= r && i >= w && i < r ? ['tp-stale'] : [])),
  });
  syncCells(v.array, specs);

  const cmpReady = inRange(arr, r) && inRange(arr, w - 1);
  const isNew = cmpReady && JSON.stringify(arr[r]) !== JSON.stringify(arr[w - 1]);
  const badge = cmpReady
    ? `<span class="tp-badge ${isNew ? 'tp-badge-good' : 'tp-badge-warn'}">${escapeHtml(det.arrName)}[${escapeHtml(rName)}]=${valHtml(arr, r)} vs ${escapeHtml(det.arrName)}[${escapeHtml(wName)}-1]=${valHtml(arr, w - 1)} → ${isNew ? 'new value' : 'duplicate'}</span>`
    : '';
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(det.arrName)}[${arr.length}]</span>
    ${ptrChip(det.leftName, det.leftIdx, valHtml(arr, det.leftIdx), roles[0])}
    ${ptrChip(det.rightName, det.rightIdx, valHtml(arr, det.rightIdx), roles[1])}
    ${badge}`;

  const writes = changedIndices(prevArr, arr);
  let cap;
  if (frame.frozen) cap = frozenCaption(frame);
  else {
    const parts = [];
    for (const k of writes) parts.push(`wrote ${valHtml(arr, k)} into ${escapeHtml(det.arrName)}[${k}]`);
    if (prev) {
      const pw = writerIsLeft ? prev.leftIdx : prev.rightIdx;
      const pr = writerIsLeft ? prev.rightIdx : prev.leftIdx;
      if (w > pw) parts.push(`${escapeHtml(wName)} ${pw} → ${w}: ${w} unique value${w === 1 ? '' : 's'} kept`);
      if (r > pr && w === pw && !writes.length) {
        const wasDup = inRange(arr, pr) && inRange(arr, pw - 1) && JSON.stringify(arr[pr]) === JSON.stringify(arr[pw - 1]);
        parts.push(wasDup
          ? `${escapeHtml(det.arrName)}[${pr}]=${valHtml(arr, pr)} repeats the last kept value → skipped, ${escapeHtml(rName)} → ${r}`
          : `${escapeHtml(rName)} ${pr} → ${r}`);
      } else if (r > pr) {
        parts.push(`${escapeHtml(rName)} ${pr} → ${r}`);
      }
    }
    // Nothing moved on this step: state the comparison the loop is making.
    if (!parts.length && cmpReady) {
      parts.push(isNew
        ? `${escapeHtml(det.arrName)}[${r}]=${valHtml(arr, r)} differs from the last kept value ${valHtml(arr, w - 1)} — a new value`
        : `${escapeHtml(det.arrName)}[${r}]=${valHtml(arr, r)} equals the last kept value — a duplicate`);
    }
    cap = parts.join(' · ') || `${escapeHtml(wName)} writes, ${escapeHtml(rName)} reads`;
  }
  setCaption(v, cap);
  setLegend(v, [['tp-sw-kept', `kept (unique prefix, before ${wName})`], ['tp-sw-stale', 'already read'], ['tp-sw-live', 'unread']]);
  placeMarkers(v, pointers, ctx.animate);
  if (ctx.animate) for (const k of writes) flash(cellAt(v, k), 'tp-write');
}

export function renderTwoPointers() {
  const mode = state.dsaMode;
  const build = mode === 'two-pointers.two-sum' ? buildTwoSum
    : mode === 'two-pointers.remove-duplicate' ? buildRemoveDuplicates
      : buildGeneric;
  renderPointerPane(els.twoPtrsBody, {
    detect: detectTwoPointers,
    empty: ['No two-pointer pattern detected — needs two indices into the same list.', 'Use Prev/Next to navigate, or pin the pointers with ⚙ once a list is in scope.'],
    build,
  });
}

export function renderTwoPointersPanel() {
  const fam = dsaFamily(state.dsaMode);
  if (fam !== 'two-pointers') {
    els.tabTwoPtrs.hidden = true;
    els.twoPtrsBody.hidden = true;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabTwoPtrs.hidden = false;
  // The tab reads the sub-mode's own name (Two Sum / Remove Duplicate).
  const entry = dsaEntryById(state.dsaMode);
  const label = entry.id === 'two-pointers' ? 'Two Pointers' : entry.label;
  if (els.tabTwoPtrs.textContent !== label) els.tabTwoPtrs.textContent = label;
  els.output.hidden = state.outTab !== 'out';
  els.twoPtrsBody.hidden = state.outTab !== 'two-pointers';
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