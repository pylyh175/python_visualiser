/* ═══════════════ Stack visualiser (Stack tab; 2026-11-03-stack-visualiser-design.md) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { STACK_VIS_CAP, STACK_CONTRACT } from '../config.js';
import { escapeHtml, treeValue } from '../utils.js';
import { hideOutTabsAll } from './shared.js';

// Lightweight text scan of the editor source (block parser; no AST library).
// Multi-line def headers and param defaults ending in a tuple degrade
// gracefully (value lost, op still detected — `sig` still matches because it
// is the def's line number).
export function scanStackSource(src) {
  const det = { found: false, cls: null, methods: {}, stackParam: 'self', pushParam: null };
  const paramNames = (text) => text.split(',')
    .map((p) => p.split(/[=:]/)[0].trim())
    .filter(Boolean);
  const lines = String(src).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const cm = lines[i].match(/^(\s*)class\s+([A-Za-z_]\w*)\s*[:(]/);
    if (!cm) continue;
    const clsIndent = cm[1].length;
    const methods = {};
    let j = i + 1;
    for (; j < lines.length; j++) {
      const t = lines[j];
      if (!t.trim()) continue;
      if (t.match(/^\s*/)[0].length <= clsIndent) break;   // dedent ends the body
      const dm = t.match(/^\s*def\s+([A-Za-z_]\w*)\s*\((.*?)\)\s*(?:->[^:]*)?:/);
      if (dm) {
        methods[dm[1]] = { line: j + 1, params: paramNames(dm[2]) };
      }
    }
    if (methods.push && methods.pop) {
      det.found = true;
      det.cls = cm[2];
      const m = {};
      for (const spec of STACK_CONTRACT) {
        const name = spec.names.find((n) => methods[n]);
        if (name) m[spec.key] = { name, line: methods[name].line };
      }
      det.methods = m;
      if (m.push) {
        const params = methods[m.push.name].params;
        det.stackParam = params[0] || 'self';
        det.pushParam = params[1] || null;
      }
      return det;
    }
  }
  return det;
}

// Which contract method does a recorded frame belong to? `sig` pins the
// method exactly (the runner provides co_firstlineno), so a same-named
// module-level function can never be confused with the class method.
export function stackOpKey(frame, det) {
  const m = det.methods;
  for (const key of Object.keys(m)) {
    if (frame.fn === m[key].name && frame.sig === m[key].line) return key;
  }
  return null;
}

function stackArg(frame, name) {
  if (name == null) return null;
  const a = frame.args || {};
  return a[name] === undefined ? null : a[name];
}

// Replay steps 0..upTo into op records, deduped by frame id, first-appearance
// order — same derivation shape as treeData: deterministic for any idx, and
// rewind is exact because nothing is mutated, only re-derived.
export function collectStackOps(upTo, det) {
  const recs = new Map();
  const last = Math.min(upTo, state.steps.length - 1);
  for (let s = 0; s <= last; s++) {
    const st = state.steps[s].stack || [];
    for (const e of st) {
      if (recs.has(e.id)) continue;
      const key = stackOpKey(e, det);
      if (!key) continue;
      recs.set(e.id, {
        key,
        value: key === 'push' ? stackArg(e, det.pushParam) : null,
        start: s,
        ret: null, retStep: null,
      });
    }
    for (const r of state.steps[s].ret || []) {
      const rec = recs.get(r.id);
      if (rec && rec.retStep === null) { rec.ret = r.value; rec.retStep = s; }
    }
  }
  return recs;
}

export function renderStack() {
  const det = state.stackScan;
  if (!det || !det.found) { hideOutTabsAll('stack'); return; }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  const recs = collectStackOps(state.idx, det);

  // Derive the current step's stack content (bottom→top, max STACK_VIS_CAP).
  let cells = [];
  let lastRet = null;
  let peekTop = false;
  let inits = 0;
  for (const rec of recs.values()) {
    if (rec.key === 'push') {
      cells.push({ v: rec.value, start: rec.start, id: rec.id });
    } else if (rec.key === 'pop') {
      cells.pop();
    }
    if ((rec.key === 'pop' || rec.key === 'peek' || rec.key === 'size' || rec.key === 'empty')
      && rec.retStep !== null && (!lastRet || rec.retStep >= lastRet.step)) {
      lastRet = { key: rec.key, value: rec.ret, step: rec.retStep };
    }
    if (rec.key === 'peek' && rec.retStep === null) peekTop = true;
    if (rec.key === 'init') inits++;
  }
  const totalSize = cells.length;
  const visibleCells = cells.slice(-STACK_VIS_CAP);

  // Track enter/leave by comparing with the previous step's cells. A cell is
  // "entering" if it's the top and its push started at this step; a cell is
  // "leaving" if it was the top at the previous step and is gone now
  // (rendered one extra frame so CSS can animate the departure).
  const prevIdx = Math.max(0, state.idx - 1);
  const prevRecs = collectStackOps(prevIdx, det);
  let prevCells = [];
  for (const rec of prevRecs.values()) {
    if (rec.key === 'push') prevCells.push({ id: rec.id });
    else if (rec.key === 'pop') prevCells.pop();
  }
  const prevTopId = prevCells.length ? prevCells[prevCells.length - 1].id : null;
  const currTopId = cells.length ? cells[cells.length - 1].id : null;
  const enteringId = (cells.length && cells[cells.length - 1].start === state.idx)
    ? cells[cells.length - 1].id : null;
  const leavingId = (prevTopId !== null && prevTopId !== currTopId) ? prevTopId : null;

  // Auto-switch at the first push/pop (like the tree's auto-switch at the
  // first recursive chain); a manual tab choice stays sticky (userTab).
  const opsSeen = [...recs.values()].some((r) => r.key === 'push' || r.key === 'pop');
  if (!state.userTab && !state.stackAnnounced && opsSeen) {
    state.stackAnnounced = true;
    state.outTab = 'stack';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabStack.classList.toggle('active', state.outTab === 'stack');
  els.output.hidden = state.outTab !== 'out';
  els.stackBody.hidden = state.outTab !== 'stack';
  if (state.outTab !== 'stack') return;

  // Build the visual stack: always STACK_VIS_CAP slots. The BOTTOM visual
  // rows (highest row index) hold the OLDEST items (bottom of the stack);
  // the newest item lands directly on top — LIFO (ground-truth-probed fix).
  const size = totalSize;
  const strip = ['size: ' + size, size === 0 ? '(empty)' : 'has items'];
  if (lastRet) strip.push(`last: ${det.methods[lastRet.key].name}() → ${treeValue(lastRet.value, 40)}`);
  if (inits > 1) strip.push(`${inits} Stack instances — ops combined in call order`);

  const slotHtml = [];
  const firstFilledRow = STACK_VIS_CAP - visibleCells.length;
  for (let row = STACK_VIS_CAP - 1; row >= 0; row--) {
    if (row < firstFilledRow) {
      // Empty slot above the stack
      slotHtml.push(`<div class="sbox sbox-empty"></div>`);
    } else {
      // Filled slot: row 7 → visibleCells[0], row 6 → visibleCells[1], …
      const cellIdx = (STACK_VIS_CAP - 1) - row;
      const cell = visibleCells[cellIdx];
      const isTop = cellIdx === visibleCells.length - 1;
      const cls = ['sbox', 'sbox-filled'];
      if (isTop) cls.push('sbox-top');
      if (isTop && peekTop) cls.push('sbox-peek');
      if (cell.id === enteringId) cls.push('sbox-enter');
      if (cell.id === leavingId) cls.push('sbox-leave');
      slotHtml.push(`<div class="${cls.join(' ')}">${escapeHtml(treeValue(cell.v, 40))}</div>`);
    }
  }

  els.stackBody.innerHTML =
    `<div class="sstrip">${strip.map(escapeHtml).join(' · ')}</div>` +
    `<div class="sstack">${slotHtml.join('\n')}</div>`;
  els.stackBody.scrollTop = 0;
}
