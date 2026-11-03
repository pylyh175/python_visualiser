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
  const det = { found: false, cls: null, methods: {}, stackParam: 'self', pushParam: null, instanceVar: null, attrName: 'items' };
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
      if (t.match(/^\s*/)[0].length <= clsIndent) break;
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
      // Detect the stack instance variable (first assignment of the class)
      // j points to the first line after the class body (first non-indented line),
      // which is typically the first instance creation. Include it in the search.
      const afterClass = lines.slice(j).join('\n');
      const assignMatch = afterClass.match(new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*${cm[2]}\\s*\\(`));
      if (assignMatch) det.instanceVar = assignMatch[1];
      // Try to infer the internal attribute name from push body
      const pushBodyStart = methods.push ? methods.push.line : -1;
      if (pushBodyStart > 0) {
        const pushBodyLines = lines.slice(pushBodyStart, Math.min(lines.length, pushBodyStart + 10)).join('\n');
        const attrMatch = pushBodyMatch(pushBodyLines, det.stackParam);
        if (attrMatch) det.attrName = attrMatch;
      }
      return det;
    }
  }
  return det;
}

function pushBodyMatch(body, stackParam) {
  // Look for self.items.append, self.stack.append, self.data.append, etc.
  const patterns = [
    new RegExp(`${stackParam}\\.(\\w+)\\s*\\.\\s*append`),
    new RegExp(`${stackParam}\\['(\\w+)'\\]\\s*\\.\\s*append`),
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[1];
  }
  return null;
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

// Replay steps 0..upTo into op records, deduped by frame id, first-appearance
// order — same derivation shape as treeData: deterministic for any idx, and
// rewind is exact because nothing is mutated, only re-derived.
// We still detect push/pop/peek ops for animation triggers (enter/leave),
// but the actual displayed stack values come from reading the instance's
// internal attribute (e.g. self.items) from locals at the current step.
// This makes the visualizer faithful to what the code actually does
// (e.g. `self.items.append("1")` shows "1" even if push('A') was called).
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
        value: null,
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

// Parse the serialized instance string to extract the internal array.
// Format: "ClassName instance { attr: [\"a\", 2] }" or "ClassName instance { }"
// Handles nested brackets by tracking bracket depth.
function parseInstanceAttr(instanceStr, attrName) {
  if (typeof instanceStr !== 'string') return null;
  // Find the attribute section: attrName: [ ... ]
  const attrPrefix = attrName + ':';
  const prefixIdx = instanceStr.indexOf(attrPrefix);
  if (prefixIdx === -1) return [];
  // Find the opening bracket after the attribute name
  let bracketIdx = instanceStr.indexOf('[', prefixIdx);
  if (bracketIdx === -1) return [];
  // Parse balanced brackets to find the matching closing bracket
  let depth = 0;
  let endIdx = -1;
  for (let i = bracketIdx; i < instanceStr.length; i++) {
    const ch = instanceStr[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return [];
  const arrayStr = instanceStr.slice(bracketIdx, endIdx + 1);
  try {
    return JSON.parse(arrayStr);
  } catch (err) {
    return [];
  }
}

export function renderStack() {
  const det = state.stackScan;
  if (!det || !det.found) { hideOutTabsAll('stack'); return; }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;

  // Still collect ops for animation triggers (push/pop enter/leave)
  const recs = collectStackOps(state.idx, det);

  // Read the ACTUAL stack contents from locals at the current step.
  // This is the ground truth — what the user's code actually produced.
  let cells = [];
  let lastRet = null;
  let peekTop = false;
  let inits = 0;

  // Derive push/pop ops for animation tracking (same as before)
  for (const rec of recs.values()) {
    if (rec.key === 'push') {
      // We don't use rec.value for display anymore, but we need the id for animations
      cells.push({ v: null, start: rec.start, id: rec.id, isPush: true });
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

  // NOW: overwrite cell values with the ACTUAL stack contents from locals
  // at the current step. This is the ground truth.
  if (det.instanceVar) {
    const locals = state.steps[state.idx]?.locals || {};
    const instanceStr = locals[det.instanceVar];
    if (instanceStr) {
      const actualStack = parseInstanceAttr(instanceStr, det.attrName);
      // Replace cell values with actual stack contents (bottom→top)
      cells = actualStack.map((v, i) => ({ v, start: -1, id: `actual-${i}`, isPush: false }));
    }
  }

  const totalSize = cells.length;
  const visibleCells = cells.slice(-STACK_VIS_CAP);

  // Track enter/leave by comparing with the previous step's cells.
  // A cell is "entering" if it's the top and its push started at this step.
  // A cell is "leaving" if it was the top at the previous step and is gone now
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
  // the newest item lands directly on top — LIFO.
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