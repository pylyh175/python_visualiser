/* ═══════════════ Binary Search Tree pane (2026-11-29 BST design) ═══════════════
   Draws the view model of panels/bstFacts.js in the Recursion tab's visual
   language, but for the DATA tree:
   - an SVG tree in in-order layout (x = sorted rank, y = depth), nodes as
     pills [key / item] that glide when the tree changes; new nodes grow out
     of their slot, removed nodes drop and fade (Q2–Q3, Q6);
   - the path of live frames highlighted, a gliding `current` tag, a dashed
     ghost slot where code reached a None child (red on a miss) (Q4);
   - return chips travel up the edge to the caller; the case-3 key copy
     flies into its node; changed links glow (Q5–Q6);
   - height badges, in-order visit numbers and the result strip (Q7);
   - header: operation badge + size / height / visited, a call-stack column
     (below the tree on a narrow pane) and the caption (Q1, Q8, Q11, Q14). */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { setCaption, setLegend, showMessage, flash, animMs } from './pointerKit.js';
import { hideOutTabsAll } from './shared.js';
import { vizScale } from '../viewportClass.js';
import { analyse, frameAt, treeFound, py } from './bstFacts.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const NODE_H = 34;
const LEVEL_H = 66;
const GAP = 12;
const PAD = 18;
const TOP = 22;      // room for the root tag above the root
const CHAR_W = 7.4;

let cache = { steps: null, facts: null };
function facts() {
  if (cache.steps !== state.steps) cache = { steps: state.steps, facts: analyse(state.steps) };
  return cache.facts;
}

export function bstFound() {
  return state.steps.length > 0 && treeFound(facts());
}

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const label = (x, cap) => (typeof x === 'string' ? (x.length > cap ? x.slice(0, cap) + '…' : x) : py(x, cap));

function ensureView(body) {
  const old = body._bstView;
  if (old && body.contains(old.svg)) return old;
  body.innerHTML = `
    <div class="tp-strip bst-strip"></div>
    <div class="tp-caption" aria-live="polite"></div>
    <div class="bst-main">
      <div class="bst-scroll">
        <svg class="bst-svg" xmlns="${SVGNS}"><g class="bst-edges"></g><g class="bst-nodes"></g><g class="bst-tags"></g><g class="bst-fly"></g></svg>
      </div>
      <div class="rt-stack bst-stack"></div>
    </div>
    <div class="bst-result" hidden></div>
    <div class="tp-legend"></div>`;
  const q = (s) => body.querySelector(s);
  const v = {
    body, strip: q('.bst-strip'), caption: q('.tp-caption'), main: q('.bst-main'), scroll: q('.bst-scroll'),
    svg: q('.bst-svg'), gEdges: q('.bst-edges'), gNodes: q('.bst-nodes'), gTags: q('.bst-tags'), gFly: q('.bst-fly'),
    stack: q('.bst-stack'), result: q('.bst-result'), legend: q('.tp-legend'),
    nodeEls: new Map(), edgeEls: new Map(), tagEls: new Map(), flights: [], lastStep: -1, stepsRef: null, legendHtml: null,
  };
  if (typeof ResizeObserver !== 'undefined') {
    v.ro = new ResizeObserver(() => {
      const w = v.body.clientWidth;
      if (!w || w === v.lastW) return;
      v.lastW = w;
      v.main.classList.toggle('bst-narrow', w < 700);
      if (v.lastModel) drawTree(v, v.lastModel, false, 0);
    });
    v.ro.observe(body);
  }
  body._bstView = v;
  return v;
}

// In-order layout with the ghost / new node slotted in as its parent's child.
function layout(t, slot) {
  const items = [];
  const seen = new Set();
  const slotItem = (d) => {
    const n = slot.oid ? t.loose.get(slot.oid) : null;
    items.push({ key: slot.oid ? `n${slot.oid}` : 'ghost', node: n, ghost: !slot.oid, depth: d, parent: slot.parent ? `n${slot.parent}` : null });
  };
  const visit = (oid, d, parent) => {
    if (!oid || seen.has(oid) || !t.nodes.has(oid)) return;
    seen.add(oid);
    const n = t.nodes.get(oid);
    if (slot && slot.parent === oid && slot.side === 'left') slotItem(d + 1); else visit(n.left, d + 1, oid);
    items.push({ key: `n${oid}`, node: n, depth: d, parent: parent ? `n${parent}` : null });
    if (slot && slot.parent === oid && slot.side === 'right') slotItem(d + 1); else visit(n.right, d + 1, oid);
  };
  if (!t.root && slot && !slot.parent) slotItem(0);
  else visit(t.root, 0, null);
  let x = PAD;
  let maxD = 0;
  for (const it of items) {
    const k = it.node ? label(it.node.key, 8) : 'None';
    const s = it.node && it.node.hasItem !== false ? label(it.node.item, 8) : '';
    it.label = it.node && it.node.hasKey === false ? '…' : k;
    it.sub = s;
    it.w = Math.max(40, Math.max(it.label.length, s.length) * CHAR_W + 16);
    it.x = x + it.w / 2;
    x += it.w + GAP;
    it.y = TOP + it.depth * LEVEL_H;
    maxD = Math.max(maxD, it.depth);
  }
  return { items, byKey: new Map(items.map((it) => [it.key, it])), W: Math.max(x - GAP + PAD, 120), H: TOP + maxD * LEVEL_H + NODE_H + 40 };
}

function fitScale(v, W) {
  const vp = state.viewport || { device: 'laptop' };
  const base = vizScale(vp.device);
  const avail = v.scroll.clientWidth - 4;
  if (avail <= 0) return base;
  return Math.max(0.6, Math.min(base, avail / W));
}

function drawTree(v, out, newStep, ms) {
  const t = out.tree;
  const L = layout(t, out.slot);
  const scale = fitScale(v, L.W);
  v.svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
  v.svg.setAttribute('width', Math.ceil(L.W * scale));
  v.svg.setAttribute('height', Math.ceil(L.H * scale));

  // Edges: parent bottom → child top.
  const seenE = new Set();
  for (const it of L.items) {
    if (!it.parent) continue;
    const p = L.byKey.get(it.parent);
    if (!p) continue;
    const ek = it.ghost || (out.slot && it.key === `n${out.slot.oid}`) ? 'slot' : it.key;
    seenE.add(ek);
    let path = v.edgeEls.get(ek);
    if (!path) { path = svgEl('path'); v.gEdges.appendChild(path); v.edgeEls.set(ek, path); }
    const d = `M ${p.x} ${p.y + NODE_H} L ${it.x} ${it.y}`;
    path.setAttribute('d', d);
    path.style.d = `path("${d}")`;
    const mark = out.edges.get(ek);
    path.setAttribute('class', `bst-edge${ek === 'slot' ? ' bst-edge-slot' : ''}${mark === 'path' ? ' bst-edge-path' : ''}${mark === 'new' ? ' bst-edge-new' : ''}${out.slot && ek === 'slot' && out.slot.state === 'miss' ? ' bst-edge-miss' : ''}`);
  }
  for (const [k, el] of v.edgeEls) if (!seenE.has(k)) { el.remove(); v.edgeEls.delete(k); }

  // Nodes (and the ghost slot).
  const seenN = new Set();
  for (const it of L.items) {
    seenN.add(it.key);
    let g = v.nodeEls.get(it.key);
    const isNew = !g || g.classList.contains('bst-gone');
    if (isNew) {
      if (g) g.remove();
      g = svgEl('g', { class: 'bst-node' });
      g.appendChild(svgEl('rect', { class: 'bst-box', rx: 9, ry: 9, y: 0, height: NODE_H }));
      g.appendChild(svgEl('text', { class: 'bst-key', 'text-anchor': 'middle' }));
      g.appendChild(svgEl('text', { class: 'bst-item', 'text-anchor': 'middle', y: 28 }));
      const hb = svgEl('g', { class: 'bst-hbadge' });
      hb.appendChild(svgEl('rect', { rx: 6, ry: 6, height: 13, y: -8 }));
      hb.appendChild(svgEl('text', { 'text-anchor': 'middle', y: 2 }));
      g.appendChild(hb);
      const vb = svgEl('g', { class: 'bst-vbadge' });
      vb.appendChild(svgEl('circle', { r: 8, cy: -2 }));
      vb.appendChild(svgEl('text', { 'text-anchor': 'middle', y: 1.5 }));
      g.appendChild(vb);
      g.appendChild(svgEl('title'));
      v.gNodes.appendChild(g);
      v.nodeEls.set(it.key, g);
      // Grow out of the parent (or appear in place when it is the root).
      const from = it.parent && L.byKey.get(it.parent);
      g.style.transition = 'none';
      g.style.opacity = '0';
      g.style.transform = from && ms ? `translate(${from.x}px, ${from.y}px) scale(0.4)` : `translate(${it.x}px, ${it.y}px)`;
      void g.getBoundingClientRect();
      g.style.transition = '';
    }
    const oid = it.key.slice(1);
    const mark = it.ghost ? null : out.marks.get(oid);
    const cls = ['bst-node'];
    if (it.ghost) cls.push('bst-ghost', `bst-ghost-${out.slot.state}`);
    else if (out.slot && out.slot.oid === oid) cls.push('bst-new');
    if (mark) cls.push(`bst-${mark}`);
    g.setAttribute('class', cls.join(' '));
    g.style.opacity = '1';
    g.style.transform = `translate(${it.x}px, ${it.y}px)`;
    const [box, tk, ti, hb, vb, title] = g.children;
    box.setAttribute('x', -it.w / 2);
    box.setAttribute('width', it.w);
    tk.setAttribute('y', it.sub ? 15 : 21);
    if (tk.textContent !== it.label) tk.textContent = it.label;
    if (ti.textContent !== it.sub) ti.textContent = it.sub;
    const hv = it.ghost ? undefined : out.heights.get(oid);
    hb.style.display = hv === undefined ? 'none' : '';
    if (hv !== undefined) {
      const txt = `h=${hv}`;
      const bw = txt.length * 6 + 8;
      hb.setAttribute('transform', `translate(${it.w / 2 - 4}, 0)`);
      hb.firstChild.setAttribute('x', -bw / 2); hb.firstChild.setAttribute('width', bw);
      hb.lastChild.textContent = txt;
    }
    const vn = it.ghost ? undefined : out.visits.get(oid);
    vb.style.display = vn === undefined ? 'none' : '';
    if (vn !== undefined) { vb.setAttribute('transform', `translate(${-it.w / 2 + 2}, 0)`); vb.lastChild.textContent = String(vn); }
    title.textContent = it.ghost ? 'None — an empty child link' : `key ${label(it.node.key, 30)} · item ${label(it.node.item, 30)}`;
  }
  for (const [k, g] of v.nodeEls) {
    if (seenN.has(k) || g.classList.contains('bst-gone')) continue;
    // Removed: drop and fade, then go.
    g.classList.add('bst-gone');
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform);
    if (m) g.style.transform = `translate(${m[1]}px, ${Number(m[2]) + 34}px)`;
    g.style.opacity = '0';
    setTimeout(() => { if (g.classList.contains('bst-gone')) { g.remove(); if (v.nodeEls.get(k) === g) v.nodeEls.delete(k); } }, ms + 60);
  }

  // Tags: the root tag above the root, the others stacked under their node.
  const seenT = new Set();
  const below = new Map();
  for (const tg of out.tags) {
    const it = L.byKey.get(tg.target);
    if (!it) continue;
    const id = tg.role === 'root' ? '@root' : tg.name;
    seenT.add(id);
    let el = v.tagEls.get(id);
    const fresh = !el;
    if (fresh) {
      el = svgEl('text', { 'text-anchor': 'middle' });
      v.gTags.appendChild(el);
      v.tagEls.set(id, el);
    }
    el.setAttribute('class', `bst-tag${tg.role === 'root' ? ' bst-tag-root' : tg.name === 'current' || tg.name === 'node' ? ' bst-tag-cur' : ''}`);
    let y;
    if (tg.role === 'root') { y = it.y - 12; el.textContent = `${tg.name} ▼`; }
    else { const row = below.get(tg.target) || 0; below.set(tg.target, row + 1); y = it.y + NODE_H + 13 + row * 12; el.textContent = row ? tg.name : `▲ ${tg.name}`; }
    if (fresh || !newStep) { el.style.transition = 'none'; }
    el.style.transform = `translate(${it.x}px, ${y}px)`;
    if (fresh || !newStep) { void el.getBoundingClientRect(); el.style.transition = ''; }
  }
  for (const [k, el] of v.tagEls) if (!seenT.has(k)) { el.remove(); v.tagEls.delete(k); }
  v.scaleNow = scale;
  return L;
}

function playFlights(v, out, L, ms) {
  if (!ms || typeof Element.prototype.animate !== 'function') return;
  for (const f of out.flights) {
    const a = L.byKey.get(f.from), b = L.byKey.get(f.to);
    if (!a || !b) continue;
    const bw = f.text.length * CHAR_W + 14;
    const g = svgEl('g', { class: `bst-flyval bst-fly-${f.kind}` });
    g.appendChild(svgEl('rect', { x: -bw / 2, y: -9, width: bw, height: 18, rx: 9, ry: 9 }));
    const tx = svgEl('text', { 'text-anchor': 'middle', y: 4 });
    tx.textContent = f.text;
    g.appendChild(tx);
    v.gFly.appendChild(g);
    const ay = f.kind === 'ret' ? a.y : a.y + NODE_H / 2;
    const by = f.kind === 'ret' ? b.y + NODE_H : b.y + NODE_H / 2;
    const anim = g.animate([
      { transform: `translate(${a.x}px, ${ay}px)`, opacity: 1 },
      { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(ay, by) - (f.kind === 'copy' ? 30 : 0)}px)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${b.x}px, ${by}px)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${b.x}px, ${by}px)`, opacity: 0 },
    ], { duration: Math.round(ms * 2), easing: 'ease-in-out' });
    const done = () => g.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    v.flights.push(anim);
  }
}

function keepInView(v, out, L, ms) {
  const act = [...out.marks].find(([, m]) => m === 'active' || m === 'found' || m === 'dup');
  const it = act ? L.byKey.get(`n${act[0]}`) : out.slot ? L.byKey.get(out.slot.oid ? `n${out.slot.oid}` : 'ghost') : null;
  if (!it) return;
  const sc = v.scroll, s = v.scaleNow || 1;
  const vw = sc.clientWidth, vh = sc.clientHeight;
  if (!vw || !vh) return;
  const sr = sc.getBoundingClientRect(), gr = v.svg.getBoundingClientRect();
  const ox = gr.left - sr.left + sc.scrollLeft, oy = gr.top - sr.top + sc.scrollTop;
  const x1 = (it.x - 70) * s + ox, x2 = (it.x + 70) * s + ox, y1 = (it.y - 24) * s + oy, y2 = (it.y + NODE_H + 40) * s + oy;
  let left = sc.scrollLeft, top = sc.scrollTop;
  if (x1 < left || x2 > left + vw) left = Math.max(0, (x1 + x2) / 2 - vw / 2);
  if (y1 < top || y2 > top + vh) top = Math.max(0, (y1 + y2) / 2 - vh / 2);
  if (left !== sc.scrollLeft || top !== sc.scrollTop) sc.scrollTo({ left, top, behavior: ms > 0 ? 'smooth' : 'auto' });
}

export function renderBstPanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const F = facts();
  const first = F.tables.length ? F.tables[0].first : -1;
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabBst.hidden = false;
  if (!state.userTab && !state.bstAnnounced && first >= 0 && state.idx >= first) {
    state.bstAnnounced = true;
    state.outTab = 'bst';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabBst.classList.toggle('active', state.outTab === 'bst');
  els.output.hidden = state.outTab !== 'out';
  els.bstBody.hidden = state.outTab !== 'bst';
  if (state.outTab !== 'bst') return;

  const body = els.bstBody;
  if (first < 0 || state.idx < first) {
    if (body._bstView && body._bstView.ro) body._bstView.ro.disconnect();
    body._bstView = null;
    showMessage(body, first < 0
      ? 'No Binary Search Tree found — needs a class with root and nodes with left/right.'
      : 'The tree has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const v = ensureView(body);
  const sameRun = v.stepsRef === state.steps;
  if (!sameRun) {
    v.gEdges.innerHTML = ''; v.gNodes.innerHTML = ''; v.gTags.innerHTML = ''; v.gFly.innerHTML = '';
    v.nodeEls.clear(); v.edgeEls.clear(); v.tagEls.clear();
  }
  const forward = sameRun && state.idx === v.lastStep + 1;
  const newStep = !sameRun || state.idx !== v.lastStep;
  v.stepsRef = state.steps;
  v.lastStep = state.idx;
  for (const a of v.flights) { try { a.cancel(); } catch (err) { /* done */ } }
  v.flights = [];
  const ms = animMs();
  body.style.setProperty('--tp-anim', `${ms}ms`);
  v.svg.style.setProperty('--tp-anim', `${ms}ms`);

  const out = frameAt(F, state.idx);
  v.lastModel = out;
  const c = out.counters;
  const op = out.op;
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(out.tree ? out.tree.cls : 'tree')}</span>
    ${op ? `<span class="tp-ptr${op.live ? '' : ' bst-op-last'}">${op.live ? '' : '<span class="tp-cap-muted">last: </span>'}${escapeHtml(op.label)}</span>` : ''}
    ${out.badge ? `<span class="tp-badge ${out.badge.kind === 'err' ? 'ht-badge-err' : 'tp-badge-good'}">${escapeHtml(out.badge.text)}</span>` : ''}
    ${out.caseBadge ? `<span class="tp-badge tp-badge-warn">${escapeHtml(out.caseBadge)}</span>` : ''}
    ${c ? `<span class="bst-counters">${escapeHtml(c.sizeName)} <b>${c.size}</b><span class="rt-dot">·</span>height <b>${c.height}</b>${op ? `<span class="rt-dot">·</span>visited <b>${c.visited}</b>` : ''}</span>` : ''}`;
  setCaption(v, out.caption);

  if (out.tree) {
    const L = drawTree(v, out, newStep, ms);
    if (newStep) {
      for (const [k, cls] of out.flashes) { const g = v.nodeEls.get(k); if (g) flash(g, cls); }
      if (forward) playFlights(v, out, L, ms);
      keepInView(v, out, L, ms);
    }
  }

  const rows = out.stack.map((f) => `<div class="rt-fr${f.ret !== null ? ' rt-fr-ret' : f.active ? ' rt-fr-active' : ''}" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}${f.ret !== null ? `<span class="rt-fr-val">→ ${escapeHtml(f.ret)}</span>` : ''}</div>`);
  const sh = `<div class="rt-stack-title">call stack</div>${rows.length ? rows.join('') : '<div class="bst-stack-empty">(no tree method running)</div>'}`;
  if (v.stack._html !== sh) { v.stack.innerHTML = sh; v.stack._html = sh; }

  v.result.hidden = !out.result;
  if (out.result) {
    const items = out.result.items;
    const rh = `<span class="bst-result-name">${escapeHtml(out.result.name)} =</span> [${items.map((k, n) => `<span class="bst-chip${n === items.length - 1 && op && op.live ? ' bst-chip-new' : ''}">${escapeHtml(label(k, 10))}</span>`).join(', ')}]`;
    if (v.result._html !== rh) { v.result.innerHTML = rh; v.result._html = rh; }
  }

  setLegend(v, [
    ['bst-sw-path', 'on the call path'],
    ['bst-sw-active', 'current node'],
    ['bst-sw-found', 'found / answer'],
    ['bst-sw-ghost', 'None child reached'],
    ['bst-sw-err', 'miss / duplicate'],
    ['ll-sw-arrow', 'link changed this step'],
  ]);
}
