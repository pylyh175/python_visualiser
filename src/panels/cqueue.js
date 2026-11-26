/* ═══════════════ Circular Queue visualiser (2026-11-26 circular-queue design, grilled Q1–Q10) ═══════════════
   The backing array drawn as a donut ring, one segment per slot: index 0 at
   12 o'clock, indices clockwise (Q1), so "next slot" is always one step
   clockwise and wrap-around reads as ordinary motion.
     segments  queued (solid) / empty (faint outline) — no "freed" state: a
               circular queue reuses every slot (Q2)
     pointers  front (blue) and rear (red) arrows outside the ring that sweep
               ALONG the arc, so 3 → 0 turns forward (Q3); a non +1 jump
               (clear() → 0) snaps
     centre    the length counter + FULL / EMPTY — the field that settles
               front == rear (Q4)
     caption   shared with the Queue pane, plus the modulo arithmetic and the
               front == rear callout (Q5–Q6, queue.js describeQueue)
     strip     the same array as plain cells under the ring (Q7)
   Values drop in / fly out on single forward steps (Q8). Above 24 slots the
   segments carry no text — hover for the value (Q9). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue, treeValue } from '../utils.js';
import { beginFrame, setCaption, setLegend, showMessage } from './pointerKit.js';
import { runFacts, queueAt, describeQueue, val } from './queue.js';
import { hideOutTabsAll } from './shared.js';

const R_OUT = 100, R_IN = 60, R_MID = 80, R_IDX = 51;
const LABEL_MAX = 24;   // Q9: segments beyond this count carry no text
const SVG_NS = 'http://www.w3.org/2000/svg';

// Size without a length attribute: (rear - front) mod capacity (ambiguous
// when front == rear — the callout says so).
function fixSize(q) {
  if (q && !q.sizeName && q.arr.length) {
    q.size = ((q.rear - q.front) % q.arr.length + q.arr.length) % q.arr.length;
  }
  return q;
}

const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
};

// One annular sector from a0 to a1 degrees (clockwise from 12 o'clock).
function sector(a0, a1) {
  const [x0, y0] = polar(R_OUT, a0), [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1), [x3, y3] = polar(R_IN, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3}Z`;
}

// Persistent skeleton: segments are rebuilt only when the capacity changes,
// so class changes and pointer rotations transition between steps.
function ensureRing(body) {
  const old = body._cqView;
  if (old && body.contains(old.svg)) return old;
  body.innerHTML = `
    <div class="tp-head"><div class="tp-strip"></div></div>
    <div class="tp-caption" aria-live="polite"></div>
    <div class="cq-stage">
      <svg class="cq-ring" viewBox="-142 -142 284 284" role="img" aria-label="circular queue ring">
        <g class="cq-segs"></g>
        <g class="cq-ptr cq-front"><polygon points="0,-104 -7,-118 7,-118"/><g class="cq-lab"><text>front</text></g></g>
        <g class="cq-ptr cq-rear"><polygon points="0,-104 -7,-118 7,-118"/><g class="cq-lab"><text>rear</text></g></g>
        <text class="cq-c-lab" y="-14">length</text>
        <text class="cq-c-num" y="10"></text>
        <text class="cq-c-state" y="30"></text>
      </svg>
    </div>
    <div class="cq-strip"></div>
    <div class="tp-legend"></div>`;
  const q = (sel) => body.querySelector(sel);
  const v = {
    body, svg: q('.cq-ring'), segs: q('.cq-segs'), strip: q('.tp-strip'), caption: q('.tp-caption'),
    cells: q('.cq-strip'), legend: q('.tp-legend'),
    ptr: { front: q('.cq-front'), rear: q('.cq-rear') },
    num: q('.cq-c-num'), lab: q('.cq-c-lab'), st: q('.cq-c-state'),
    cap: -1, deg: { front: null, rear: null }, idx: { front: null, rear: null },
    flights: [], lastStep: -1, stepsRef: null, legendHtml: null,
  };
  body._cqView = v;
  return v;
}

function buildSegments(v, cap) {
  v.cap = cap;
  const step = 360 / cap;
  const gap = Math.min(1.6, step * 0.12);
  let html = '';
  for (let i = 0; i < cap; i++) {
    const a0 = i * step + gap / 2, a1 = (i + 1) * step - gap / 2;
    const [tx, ty] = polar(R_MID, i * step + step / 2);
    const [ix, iy] = polar(R_IDX, i * step + step / 2);
    html += `<g class="cq-seg" data-i="${i}"><title></title><path d="${sector(a0, a1)}"/>`
      + `<text class="cq-val" x="${tx}" y="${ty}"></text>`
      + `<text class="cq-idx" x="${ix}" y="${iy}">${cap <= LABEL_MAX ? i : ''}</text></g>`;
  }
  v.segs.innerHTML = html;
  v.deg = { front: null, rear: null };
  v.idx = { front: null, rear: null };
}

// Rotate a pointer to slot idx. A +1 (or −1 when stepping back) move adds
// one slot's worth of angle to the running total, so the wrap 3 → 0 keeps
// turning the same way; anything else snaps to the slot's own angle.
// `nudge` (degrees) sets front/rear side by side when they share a slot.
function placePointer(v, key, idx, cap, nudge, animate) {
  const el = v.ptr[key];
  const step = 360 / cap;
  const home = idx * step + step / 2;
  const prevIdx = v.idx[key], prevDeg = v.deg[key];
  let deg = home, sweep = false;
  if (animate && prevDeg !== null) {
    sweep = true;
    if (idx === prevIdx) deg = prevDeg;
    else if (idx === (prevIdx + 1) % cap) deg = prevDeg + step;
    else if (idx === (prevIdx - 1 + cap) % cap) deg = prevDeg - step;
    else sweep = false;   // a jump (clear() → 0): snap
  }
  v.idx[key] = idx;
  v.deg[key] = deg;
  const total = deg + nudge;
  const lab = el.querySelector('.cq-lab');
  if (!sweep) { el.style.transition = 'none'; lab.style.transition = 'none'; }
  el.style.transform = `rotate(${total}deg)`;
  // Counter-rotate the label so it stays upright through the sweep.
  lab.style.transform = `translate(0px, -128px) rotate(${-total}deg)`;
  if (!sweep) { void el.getBoundingClientRect(); el.style.transition = ''; lab.style.transition = ''; }
}

// A served value lifts out of its segment and fades.
function flyOut(v, i, text, ms) {
  if (!ms || typeof Element.prototype.animate !== 'function') return;
  const step = 360 / v.cap;
  const mid = i * step + step / 2;
  const [x, y] = polar(R_MID, mid);
  const [dx, dy] = polar(46, mid);
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('class', 'cq-val cq-fly');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.textContent = text;
  v.svg.appendChild(t);
  const anim = t.animate([
    { transform: 'translate(0px, 0px)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
  ], { duration: Math.round(ms * 1.6), easing: 'ease-out' });
  const done = () => t.remove();
  anim.onfinish = done;
  anim.oncancel = done;
  v.flights.push(anim);
}

function flashSeg(v, i, cls) {
  const g = v.segs.querySelector(`[data-i="${i}"]`);
  if (!g) return;
  g.classList.remove(cls);
  void g.getBoundingClientRect();
  g.classList.add(cls);
}

export function renderCQueuePanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const facts = runFacts();
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabCQueue.hidden = false;
  if (!state.userTab && !state.cqueueAnnounced && facts.oid !== null && state.idx >= facts.first) {
    state.cqueueAnnounced = true;
    state.outTab = 'cqueue';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabCQueue.classList.toggle('active', state.outTab === 'cqueue');
  els.output.hidden = state.outTab !== 'out';
  els.cqueueBody.hidden = state.outTab !== 'cqueue';
  if (state.outTab !== 'cqueue') return;

  const body = els.cqueueBody;
  const q = fixSize(facts.oid !== null ? queueAt(state.idx, facts) : null);
  if (!q || !q.arr.length) {
    body._cqView = null;
    showMessage(body, facts.oid === null
      ? 'No Circular Queue found — needs a class with an array plus front and rear indices.'
      : 'The queue has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const prevQ = fixSize(state.idx > facts.first ? queueAt(state.idx - 1, facts) : null);
  const v = ensureRing(body);
  const f = beginFrame(v);
  const cap = q.arr.length;
  if (v.cap !== cap) buildSegments(v, cap);

  const queued = (i) => ((i - q.front) % cap + cap) % cap < q.size;
  const label = (x) => (x === null ? '' : treeValue(x, cap <= 8 ? 6 : 4));
  for (const g of v.segs.children) {
    const i = Number(g.dataset.i);
    const cls = `cq-seg ${queued(i) ? 'cq-live' : 'cq-empty'}`;
    if (g.getAttribute('class').split(' ').slice(0, 2).join(' ') !== cls) {
      g.setAttribute('class', cls);
    }
    const t = g.querySelector('.cq-val');
    const text = cap <= LABEL_MAX ? label(q.arr[i]) : '';
    if (t.textContent !== text) t.textContent = text;
    g.querySelector('title').textContent = `${q.arrName}[${i}] = ${fmtValue(q.arr[i])}`;
  }

  // Side by side when both point at one slot (Q3).
  const same = q.front === q.rear;
  const nudge = same ? Math.min(360 / cap * 0.22, 9) : 0;
  placePointer(v, 'front', q.front, cap, -nudge, f.newStep);
  placePointer(v, 'rear', q.rear, cap, nudge, f.newStep);

  const full = q.size >= cap, empty = q.size === 0;
  v.lab.textContent = q.sizeName || 'size';
  v.num.textContent = `${q.size} / ${cap}`;
  v.st.textContent = full ? 'FULL' : empty ? 'EMPTY' : '';
  v.st.setAttribute('class', `cq-c-state${full ? ' cq-full' : ''}`);

  const badges = [];
  if (empty) badges.push('<span class="tp-badge">empty</span>');
  if (full) badges.push('<span class="tp-badge tp-badge-warn">full</span>');
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(q.varName || q.cls)}.${escapeHtml(q.arrName)}[${cap}]</span>
    <span class="tp-ptr tp-role-text-left">${escapeHtml(q.frontName)}=${q.front} <span class="tp-ptr-val">(val ${empty ? '—' : val(q.arr[q.front])})</span></span>
    <span class="tp-ptr tp-role-text-right">${escapeHtml(q.rearName)}=${q.rear} <span class="tp-ptr-val">(${full ? 'no free slot' : 'next free slot'})</span></span>
    <span>${escapeHtml(q.sizeName || 'size')} ${q.size} / ${cap}</span>
    ${badges.join(' ')}`;
  setCaption(v, describeQueue(q, prevQ, state.steps[state.idx], facts, true));

  // The same array as a plain list (Q7): colour-matched, no pointers.
  v.cells.innerHTML = q.arr.map((x, i) => `<div class="cq-cell ${queued(i) ? 'cq-live' : 'cq-empty'}" title="${escapeHtml(`${q.arrName}[${i}] = ${fmtValue(x)}`)}">`
    + `<span>${escapeHtml(cap <= LABEL_MAX ? label(x) : '')}</span><small>${i}</small></div>`).join('');

  const legend = [
    ['q-sw-dir', 'clockwise: append at rear, serve from front ·'],
    ['q-sw-live', 'queued'],
    ['q-sw-empty', 'empty — reusable'],
  ];
  setLegend(v, legend);

  // Entry / exit effects (Q8).
  if (f.newStep && prevQ && prevQ.arr.length === cap) {
    for (let i = 0; i < cap; i++) {
      if (prevQ.arr[i] === q.arr[i]) continue;
      if (q.arr[i] === null) {
        flashSeg(v, i, 'cq-leave');
        if (f.forward) flyOut(v, i, label(prevQ.arr[i]), f.ms);
      } else {
        flashSeg(v, i, 'cq-enter');
      }
    }
  }
}
