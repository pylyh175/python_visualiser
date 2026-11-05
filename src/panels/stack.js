/* ═══════════════ Stack visualiser (Stack tab; 2026-11-03-stack-visualiser-design.md) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { STACK_VIS_CAP, STACK_FIGURE_CAP, STACK_CONTRACT } from '../config.js';
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

// The tracer records only the FIRST MAX_ITEMS (100) of a container; when the
// live content is longer, runner.py appends the recorded fact
// "… +N more" INSIDE the recorded array. That string is a fact about hidden
// content, never an element: split it off so it can't draw as a phantom slot
// — it becomes the cap-chip above the contents instead. The hidden side is
// always the TOP (first-of-content recording policy).
function splitTrailerMore(arr) {
  if (!Array.isArray(arr)) return { items: arr, more: 0 };
  const last = arr[arr.length - 1];
  if (typeof last === 'string') {
    const match = last.match(/^… \+(\d+) more$/);
    if (match) return { items: arr.slice(0, -1), more: Number(match[1]) };
  }
  return { items: arr, more: 0 };
}

// Multi-instance (2026-11-05-stack-multi-instance-design.md, grilled Q2–Q5):
// each instance of the tracked class becomes its own figure, in
// first-recorded construction order. Identity is the runner's per-frame
// `oid` — a recorded fact of execution, not an inference. Contents come
// from recorded steps ONLY: while one of the instance's frames is the
// recorded top frame, the figure reads that step's `self` snapshot
// (`step.locals` belongs to the top frame); between calls the figure keeps
// that LAST RECORDED snapshot (sticky). Everything is re-derived from steps
// 0..upTo on every render — nothing is mutated, so rewind is exact.
export function collectStackFigures(upTo, det) {
  const byOid = new Map();   // oid -> figure; insertion order = first appearance
  const last = Math.min(upTo, state.steps.length - 1);
  for (let s = 0; s <= last; s++) {
    const step = state.steps[s];
    const frames = step.stack || [];
    for (const e of frames) {
      if (e.oid == null || !stackOpKey(e, det)) continue;
      let fig = byOid.get(e.oid);
      if (!fig) {
        fig = { oid: e.oid, firstStep: s, ops: new Map(), selfStr: null };
        byOid.set(e.oid, fig);
      }
      if (!fig.ops.has(e.id)) {
        fig.ops.set(e.id, { key: stackOpKey(e, det), start: s, ret: null, retStep: null });
      }
    }
    // Content: the figure whose frame is this step's recorded top.
    if (topHasOid(frames, det) && byOid.has(frames[frames.length - 1].oid)) {
      const fig = byOid.get(frames[frames.length - 1].oid);
      const selfStr = (step.locals || {}).self;
      if (typeof selfStr === 'string') fig.selfStr = selfStr;   // sticky overwrite
    }
    // Return records: a frame id belongs to exactly one instance.
    for (const r of step.ret || []) {
      for (const fig of byOid.values()) {
        const rec = fig.ops.get(r.id);
        if (rec && rec.retStep === null) { rec.ret = r.value; rec.retStep = s; }
      }
    }
  }
  return [...byOid.values()];
}

function topHasOid(frames, det) {
  const top = frames[frames.length - 1];
  return top && top.oid != null && !!stackOpKey(top, det);
}

// The multi figure row (grilled Q3, Q5–Q7). Each figure is the existing
// 8-slot visual driven by THAT instance's own op replay and last-recorded
// self snapshot; the strip shows only its own facts. Cap: the first
// STACK_FIGURE_CAP instances draw figures, the rest collapse into a chip.
function renderStackMulti(figs, det) {
  const prevByOid = new Map(collectStackFigures(Math.max(0, state.idx - 1), det)
    .map((f) => [f.oid, f]));
  const shown = figs.slice(0, STACK_FIGURE_CAP);
  const moreCount = figs.length - shown.length;

  const rowHtml = shown.map((fig, n) => {
    // That instance's own op replay for animation triggers (solo semantics).
    const idCells = [];
    let lastRet = null;
    let peekTop = false;
    for (const rec of [...fig.ops.values()]) {
      if (rec.key === 'push') idCells.push({ start: rec.start, id: fig.oid + ':' + rec.id });
      else if (rec.key === 'pop') idCells.pop();
      if ((rec.key === 'pop' || rec.key === 'peek' || rec.key === 'size' || rec.key === 'empty')
        && rec.retStep !== null && (!lastRet || rec.retStep >= lastRet.step)) {
        lastRet = { key: rec.key, value: rec.ret, step: rec.retStep };
      }
      if (rec.key === 'peek' && rec.retStep === null) peekTop = true;
    }
    // REAL contents: the last recorded self snapshot of THIS instance —
    // same overwrite shape as the solo path (value cells replace replay).
    const actual = splitTrailerMore(parseInstanceAttr(fig.selfStr, det.attrName));
    const hiddenMore = actual.more;
    const cells = actual.items.map((v, i) => ({ v, start: -1, id: fig.oid + ':actual-' + i }));
    // Growth (2026-11-05 dynamic-growth design Q1–Q3): EVERY recorded item
    // draws — bigger figures grow beyond the 8-slot minimum (their own
    // growth, independent of the other figures), and the tracer's sentinel
    // count keeps the strip honest about the hidden top (Q4/Q5).
    const totalSize = cells.length + hiddenMore;
    const slotRows = Math.max(STACK_VIS_CAP, cells.length);   // min slot count for ≤8
    const visibleCells = cells;

    // Enter/leave per figure — the exact solo derivation (current top id
    // vs the previous step's replay top; the overwrite makes on/off-enter
    // matches the same solo semantics, no invented divergence).
    const prev = prevByOid.get(fig.oid);
    let prevCells = [];
    if (prev) {
      for (const rec of [...prev.ops.values()]) {
        if (rec.key === 'push') prevCells.push({ id: prev.oid + ':' + rec.id });
        else if (rec.key === 'pop') prevCells.pop();
      }
    }
    const prevTopId = prevCells.length ? prevCells[prevCells.length - 1].id : null;
    const currTopId = cells.length ? cells[cells.length - 1].id : null;
    const enteringId = (cells.length && cells[cells.length - 1].start === state.idx)
      ? cells[cells.length - 1].id : null;
    const leavingId = (prevTopId !== null && prevTopId !== currTopId) ? prevTopId : null;

    // The solo slot loop, parameterised by this figure's cells.
    const size = totalSize;
    const slotHtml = [];
    for (let row = slotRows - 1; row >= 0; row--) {
      // Filled slot: row (slotRows-1) → visibleCells[0], the row above →
      // visibleCells[1], …; beyond the content → empty slots (only ever
      // shown while the figure is ≤ STACK_VIS_CAP — grown figures have
      // exactly their content height, no filler).
      const cellIdx = (slotRows - 1) - row;
      if (cellIdx >= visibleCells.length) {
        slotHtml.push(`<div class="sbox sbox-empty"></div>`);
      } else {
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
    if (hiddenMore > 0) {
      // The chip rides above the contents: the hidden side is always the
      // TOP (tracer records the FIRST 100), and in the column-reverse
      // stack the last DOM child renders visually first.
      slotHtml.push(`<div class="sbox-cap">… +${hiddenMore} more — tracer records the first 100</div>`);
    }

    const strip = [`size: ${size}${hiddenMore > 0 ? ' (tracer-capped)' : ''}`,
      size === 0 ? '(empty)' : 'has items'];
    if (lastRet) strip.push(`last: ${det.methods[lastRet.key].name}() → ${treeValue(lastRet.value, 40)}`);

    return `<div class="sfig">`
      + `<div class="sfig-label">Stack #${n + 1}</div>`
      + `<div class="sstrip">${strip.map(escapeHtml).join(' · ')}</div>`
      + `<div class="sstack">${slotHtml.join('\n')}</div>`
      + `</div>`;
  });

  if (moreCount > 0) {
    rowHtml.push(`<div class="sfig-more">… +${moreCount} more</div>`);
  }
  els.stackBody.innerHTML = `<div class="sfigures">${rowHtml.join('\n')}</div>`;
  els.stackBody.scrollTop = 0;
}

export function renderStack() {
  const det = state.stackScan;
  if (!det || !det.found) { hideOutTabsAll(state.dsaMode); return; }
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
  let hiddenMore = 0;   // sentinelled top content the tracer didn't record

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
      const actualStack = splitTrailerMore(parseInstanceAttr(instanceStr, det.attrName));
      hiddenMore = actualStack.more;
      // Replace cell values with actual stack contents (bottom→top)
      cells = actualStack.items.map((v, i) => ({ v, start: -1, id: `actual-${i}`, isPush: false }));
    }
  }

  // Growth (2026-11-05 dynamic-growth design Q1–Q6): EVERY recorded item
  // draws — the figure grows beyond the 8-slot minimum instead of losing
  // bottom items; the tracer's own 100-item cap is the only ceiling.
  const totalSize = cells.length + hiddenMore;
  const slotRows = Math.max(STACK_VIS_CAP, cells.length);   // ≤8 keeps exactly today's figure
  const visibleCells = cells;

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

  // Multi-instance: more than one instance of the tracked class draws as its
  // own figure (2026-11-05 design, grilled Q3–Q7). Identity comes from the
  // runner's per-frame `oid`; with only one instance this stays untouched.
  const figs = collectStackFigures(state.idx, det);
  if (figs.length > 1) return renderStackMulti(figs, det);

  // Build the visual stack: at least STACK_VIS_CAP slots; once the content
  // exceeds the minimum the figure grows to its content height. The BOTTOM
  // visual rows (highest row index) hold the OLDEST items (bottom of the
  // stack); the newest item lands directly on top — LIFO.
  const size = totalSize;
  const strip = ['size: ' + size + (hiddenMore > 0 ? ' (tracer-capped)' : ''),
    size === 0 ? '(empty)' : 'has items'];
  if (lastRet) strip.push(`last: ${det.methods[lastRet.key].name}() → ${treeValue(lastRet.value, 40)}`);
  if (inits > 1) strip.push(`${inits} Stack instances — ops combined in call order`);

  const slotHtml = [];
  for (let row = slotRows - 1; row >= 0; row--) {
    // Filled slot: row (slotRows-1) → visibleCells[0], the row above →
    // visibleCells[1], …; beyond the content → empty slots (only ever shown
    // while the figure is ≤ STACK_VIS_CAP: grown figures have exactly their
    // content height, no filler — grilled Q3).
    const cellIdx = (slotRows - 1) - row;
    if (cellIdx >= visibleCells.length) {
      // Empty slot above the stack
      slotHtml.push(`<div class="sbox sbox-empty"></div>`);
    } else {
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
  if (hiddenMore > 0) {
    // The chip rides above the contents: the hidden side is always the TOP
    // (the tracer records the FIRST 100), and in the column-reverse stack
    // the last DOM child renders visually first — a scrolled pane therefore
    // opens on the newest recorded item with the hidden top stated honestly
    // (grilled Q4).
    slotHtml.push(`<div class="sbox-cap">… +${hiddenMore} more — tracer records the first 100</div>`);
  }

  els.stackBody.innerHTML =
    `<div class="sstrip">${strip.map(escapeHtml).join(' · ')}</div>` +
    `<div class="sstack">${slotHtml.join('\n')}</div>`;
  els.stackBody.scrollTop = 0;
}
