/* ═══════════════ Queue visualiser (Queue tab; 2026-11-26 queue design) ═══════════════
   A linear array queue drawn like the two-pointer panes: the backing array
   as cells, `front` and `rear` as gliding markers, and a caption that says
   what the last line did in queue terms.
     queued  front <= i < rear  solid cells (the items still waiting)
     freed   i < front          hatched: served slots a linear queue never
                                reuses — why it can report "full" with room
     empty   i >= rear          dashed: room left at the rear
   Ground truth only: every fact comes from the runner's per-step memory
   graph (`step.mem`) — the instance node with a list attribute plus integer
   front/rear attributes — and its recorded frames, returns and exceptions.
   shortcut: one queue per run (the first instance detected); upgrade to one
   figure per instance like the stack pane when a demo needs two queues. */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue, treeValue } from '../utils.js';
import { ensureView, beginFrame, fitCells, syncCells, placeMarkers, cellAt, flash, ptrChip, setCaption, setLegend, showMessage } from './pointerKit.js';
import { buildCells } from './twoPointers.js';
import { hideOutTabsAll } from './shared.js';

const FRONT_NAMES = ['front', 'head', 'first'];
const REAR_NAMES = ['rear', 'tail', 'back', 'end', 'last'];
const SIZE_NAMES = ['length', 'size', 'count', 'n'];

// The queue held by one step's memory graph: the instance node `oid` (or,
// with oid null, the first instance that qualifies).
function queueIn(step, oid) {
  const mem = step && step.mem;
  if (!mem || !mem.nodes) return null;
  const ids = oid != null ? [String(oid)] : Object.keys(mem.nodes);
  for (const id of ids) {
    const node = mem.nodes[id];
    if (!node || node.t !== 'inst') continue;
    const attrs = new Map((node.items || []).filter(Array.isArray));
    const pick = (names) => names.find((n) => Number.isInteger(attrs.get(n)));
    const frontName = pick(FRONT_NAMES), rearName = pick(REAR_NAMES);
    if (!frontName || !rearName) continue;
    let arrName = null, list = null;
    for (const [k, v] of attrs) {
      const n = v && typeof v === 'object' && 'ref' in v ? mem.nodes[String(v.ref)] : null;
      if (n && n.t === 'list') { arrName = k; list = n; break; }
    }
    if (!list) continue;
    const arr = [];
    for (const it of list.items || []) {
      if (it && typeof it === 'object' && 'more' in it) break;   // tracer cap
      arr.push(it && typeof it === 'object' && 'ref' in it ? '⋯' : it);
    }
    const sizeName = SIZE_NAMES.find((n) => Number.isInteger(attrs.get(n)));
    // The variable holding it (q), preferring a real name over `self`.
    const roots = Object.entries(mem.roots || {}).filter(([, r]) => r && String(r.ref) === id).map(([k]) => k);
    return {
      oid: id, cls: node.cls, arrName, arr,
      frontName, rearName, front: attrs.get(frontName), rear: attrs.get(rearName),
      size: sizeName ? attrs.get(sizeName) : attrs.get(rearName) - attrs.get(frontName),
      varName: roots.find((k) => k !== 'self') || null,
    };
  }
  return null;
}

// Run-level facts, cached per trace: the locked queue oid, its first step,
// and every recorded frame that ran ON it (id -> {fn, args}).
let cache = { steps: null };
function runFacts() {
  if (cache.steps === state.steps) return cache;
  let oid = null, first = -1;
  for (let i = 0; i < state.steps.length && oid === null; i++) {
    const q = queueIn(state.steps[i], null);
    if (q) { oid = q.oid; first = i; }
  }
  const calls = new Map();
  if (oid !== null) {
    for (const st of state.steps) {
      for (const e of st.stack || []) {
        if (String(e.oid) === oid && !calls.has(e.id)) calls.set(e.id, { fn: e.fn, args: e.args || {} });
      }
    }
  }
  cache = { steps: state.steps, oid, first, calls };
  return cache;
}

// The queue at step i (held from the last step that recorded it).
function queueAt(i, facts) {
  for (let s = i; s >= facts.first && s >= 0; s--) {
    const q = queueIn(state.steps[s], facts.oid);
    if (q) return q;
  }
  return null;
}

// Does the trace contain a queue at all? (Output-tab note, auto-switch.)
export function queueFound() {
  return runFacts().oid !== null;
}

// Python spelling for booleans (the tracer's JSON says true/false).
const val = (x) => escapeHtml(typeof x === 'boolean' ? (x ? 'True' : 'False') : treeValue(x, 24));
const callText = (c) => {
  const args = Object.entries(c.args).filter(([k]) => k !== 'self').map(([k, x]) => `${k}=${treeValue(x, 16)}`);
  return `${c.fn}(${args.join(', ')})`;
};

// What the last executed line did, in queue terms (most specific first).
function describe(q, prevQ, step, facts) {
  const i0 = (name) => `${escapeHtml(q.arrName)}[${name}]`;
  for (const x of step.exc || []) {
    const c = facts.calls.get(x.id);
    if (!c) continue;
    let why = '';
    if (q.rear >= q.arr.length && q.front > 0) {
      why = ` — only ${q.size} item${q.size === 1 ? '' : 's'} queued, but ${escapeHtml(q.rearName)} hit the end of the array`;
    }
    return `<span class="q-cap-err">✗ ${escapeHtml(callText(c))} raised ${escapeHtml(x.exc)}${why}</span>`;
  }
  for (const r of step.ret || []) {
    const c = facts.calls.get(r.id);
    if (!c || c.fn === '__init__') continue;
    let note = '';
    if (r.value === true && q.rear >= q.arr.length && q.front > 0) {
      note = ` — <span class="tp-cap-warn">${escapeHtml(q.rearName)} reached the end — ${q.front} freed slot${q.front === 1 ? '' : 's'} at the front can't be reused (a Circular Queue fixes this)</span>`;
    }
    return `<b>${escapeHtml(c.fn)}()</b> returned <b>${val(r.value)}</b>${note}`;
  }
  if (prevQ) {
    const moves = [];
    if (prevQ.arr.length === q.arr.length) {
      for (let i = 0; i < q.arr.length; i++) {
        if (prevQ.arr[i] === q.arr[i]) continue;
        moves.push(q.arr[i] === null
          ? `${i0(i)} = None — <b>${val(prevQ.arr[i])}</b> left the queue`
          : `stored <b>${val(q.arr[i])}</b> at ${i0(i)}`);
      }
    } else {
      moves.push(`new array of ${q.arr.length} slots`);
    }
    if (prevQ.front !== q.front) {
      moves.push(`${escapeHtml(q.frontName)} ${prevQ.front} → ${q.front}`
        + (q.front > prevQ.front ? ` (slot ${prevQ.front} is freed — a linear queue never reuses it)` : ''));
    }
    if (prevQ.rear !== q.rear) moves.push(`${escapeHtml(q.rearName)} ${prevQ.rear} → ${q.rear}`);
    if (moves.length) return moves.join(' · ');
  }
  const top = (step.stack || [])[(step.stack || []).length - 1];
  const c = top && facts.calls.get(top.id);
  if (c && c.fn !== '__init__') return `<span class="tp-cap-muted">running ${escapeHtml(callText(c))}</span>`;
  // Nothing changed: say what the next operations would do.
  const next = [];
  next.push(q.size ? `serve() would take <b>${val(q.arr[q.front])}</b> from ${i0(q.front)}` : 'empty — serve() would raise');
  next.push(q.rear < q.arr.length ? `append() would store at ${i0(q.rear)}` : `append() would raise — ${escapeHtml(q.rearName)} is past the end`);
  return `<span class="tp-cap-muted">${next.join(' · ')}</span>`;
}

export function renderQueuePanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const facts = runFacts();
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabQueue.hidden = false;
  // Auto-switch once the queue exists (like the stack's first push); a
  // manual tab choice stays sticky (userTab).
  if (!state.userTab && !state.queueAnnounced && facts.oid !== null && state.idx >= facts.first) {
    state.queueAnnounced = true;
    state.outTab = 'queue';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabQueue.classList.toggle('active', state.outTab === 'queue');
  els.output.hidden = state.outTab !== 'out';
  els.queueBody.hidden = state.outTab !== 'queue';
  if (state.outTab !== 'queue') return;

  const body = els.queueBody;
  const q = facts.oid !== null ? queueAt(state.idx, facts) : null;
  if (!q) {
    showMessage(body, facts.oid === null
      ? 'No Queue found — needs a class with an array plus front and rear indices.'
      : 'The queue has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const step = state.steps[state.idx];
  const prevQ = state.idx > facts.first ? queueAt(state.idx - 1, facts) : null;
  const v = ensureView(body);
  const f = beginFrame(v);
  const fit = fitCells(v);
  v.lastFit = fit;

  const det = { leftIdx: q.front, rightIdx: q.rear, leftName: q.frontName, rightName: q.rearName };
  const { specs, pointers } = buildCells(q.arr, det, {
    fit,
    cellCls: (i) => [i < q.front ? 'q-freed' : i < q.rear ? 'q-live' : 'q-empty'],
    fmt: (x) => (x === null ? '' : treeValue(x, 8)),
  });
  for (const s of specs) {
    if (s.idx >= 0 && s.idx < q.arr.length) s.title = `${q.arrName}[${s.idx}] = ${fmtValue(q.arr[s.idx])}`;
    if (s.key === 'ghost-hi') {
      s.text = 'end';
      s.cls += ' q-end';
      s.title = `${q.rearName} = ${q.arr.length}: past the end — no free slot at the rear`;
    }
  }
  syncCells(v.array, specs);

  const cap = q.arr.length;
  const full = q.rear >= cap;
  const badges = [];
  if (q.size === 0) badges.push('<span class="tp-badge">empty</span>');
  if (full) badges.push(q.front > 0
    ? `<span class="tp-badge tp-badge-warn">full — ${q.front} freed slot${q.front === 1 ? '' : 's'} wasted</span>`
    : '<span class="tp-badge tp-badge-warn">full</span>');
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(q.varName || q.cls)}.${escapeHtml(q.arrName)}[${cap}]</span>
    <span>size ${q.size} / ${cap}</span>
    ${ptrChip(q.frontName, q.front, q.front < cap && q.front < q.rear ? val(q.arr[q.front]) : '—', 'left')}
    <span class="tp-ptr tp-role-text-right">${escapeHtml(q.rearName)}=${q.rear} <span class="tp-ptr-val">(${full ? 'past the end' : 'next free slot'})</span></span>
    ${badges.join(' ')}`;

  setCaption(v, describe(q, prevQ, step, facts));
  setLegend(v, [
    ['q-sw-dir', 'FIFO: append at rear, serve from front ·'],
    ['q-sw-live', 'queued (served from front)'],
    ['q-sw-freed', 'freed — served, never reused'],
    ['q-sw-empty', 'empty — room at rear'],
  ]);
  placeMarkers(v, pointers.map((p, n) => ({ ...p, role: n ? 'right' : 'left' })), f.newStep);

  // Entry / exit effects on a single forward step: a value stored at the
  // rear drops in, a value served from the front flies out.
  if (f.newStep && prevQ && prevQ.arr.length === q.arr.length) {
    for (let i = 0; i < cap; i++) {
      if (prevQ.arr[i] === q.arr[i]) continue;
      if (q.arr[i] === null) {
        if (f.forward && f.ms) flyOut(v, i, treeValue(prevQ.arr[i], 8), f.ms);
      } else {
        flash(cellAt(v, i), 'q-enter');
      }
    }
  }
}

// A served value lifts out of its slot and fades (the slot turns hatched).
function flyOut(v, idx, text, ms) {
  const cell = cellAt(v, idx);
  if (!cell || typeof Element.prototype.animate !== 'function') return;
  const base = v.track.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  if (!base.width) return;
  const ghost = document.createElement('div');
  ghost.className = 'tp-fly';
  ghost.textContent = text;
  ghost.style.left = `${r.left - base.left}px`;
  ghost.style.top = `${r.top - base.top}px`;
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  v.track.appendChild(ghost);
  const anim = ghost.animate([
    { transform: 'translate(0, 0)', opacity: 1 },
    { transform: `translate(-${Math.round(r.width * 0.6)}px, -${Math.round(r.height * 0.8)}px)`, opacity: 0 },
  ], { duration: Math.round(ms * 1.6), easing: 'ease-out' });
  const done = () => ghost.remove();
  anim.onfinish = done;
  anim.oncancel = done;
  v.flights.push(anim);
}
