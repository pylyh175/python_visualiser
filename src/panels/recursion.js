/* ═══════════════ Recursion tree (Recursion tab in the output panel) ═══════════════
   2026-11-24 visualisation-upgrade design: a graphical tree (SVG) by default,
   the ASCII tree one click away.
   - nodes persist between steps and glide to their new layout positions;
     new calls grow out of their parent;
   - the active call path (= the call stack) is highlighted root → active;
   - on a return step the returned value travels up the edge to the caller;
   - a waiting caller shows the results it has received so far ("got 2, …");
   - repeated calls (same function + same arguments) share a coloured ×k
     badge, and hovering a node highlights every copy of that call;
   - base cases (calls that returned without calling anything) are marked;
   - a counter row (calls, depth, max depth, repeats) and a call-stack column;
   - clicking a node jumps to the step where that call started.            */

import { state } from '../state.js';
import { els } from '../dom.js';
import { TREE_NODE_CAP, TREE_SVG_CAP } from '../config.js';
import { escapeHtml, treeValue } from '../utils.js';
import { layoutTree } from './treeLayout.js';
import { animMs } from './pointerKit.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const NODE_H = 36;
const LEVEL_H = 62;
const CHAR_W = 7;
const PAD = 16;
const REPEAT_HUES = ['#f472b6', '#38bdf8', '#a78bfa', '#facc15', '#fb923c', '#4ade80', '#22d3ee', '#e879f9'];

// Replay steps 0..upTo into a tree: each step's `stack` (outermost user frame
// first) registers or confirms its frames, joined parent ← child following
// the chain order, and `ret` entries resolve nodes with return values.
// Stepping back re-derives an earlier state exactly.
export function treeData(upTo) {
  const nodes = new Map();   // insertion order = call order
  const childCount = new Map();
  for (let s = 0; s <= Math.min(upTo, state.steps.length - 1); s++) {
    const stack = state.steps[s].stack;
    if (stack) {
      for (let d = 0; d < stack.length; d++) {
        const e = stack[d];
        if (!nodes.has(e.id)) {
          const parent = d ? stack[d - 1].id : null;
          nodes.set(e.id, {
            id: e.id, parent, fn: e.fn, args: e.args || {},
            ret: null, retSet: false, order: childCount.get(parent) || 0,
            firstStep: s, kids: 0,
          });
          childCount.set(parent, (childCount.get(parent) || 0) + 1);
          if (nodes.has(parent)) nodes.get(parent).kids++;
        }
      }
    }
    const rets = state.steps[s].ret;
    if (rets) for (const r of rets) {
      const n = nodes.get(r.id);
      // The module frame's own return (value None) never resolves a node.
      if (n && !n.retSet && n.fn !== '<module>') { n.ret = r.value; n.retSet = true; n.retStep = s; }
    }
  }
  return nodes;
}

// True recursion = the same function's *code* re-entered deeper in one call
// chain — direct (f→f) or indirect (f→g→f), matched by name + signature.
export function chainIsRecursive(chain) {
  if (!chain || chain.length < 2) return false;
  for (let i = 0; i < chain.length; i++) {
    for (let j = i + 1; j < chain.length; j++) {
      if (chain[i].fn === chain[j].fn && chain[i].sig === chain[j].sig) return true;
    }
  }
  return false;
}

// Did the steps up to i re-enter code? (Whole-run check with steps.length - 1.)
export function recursionSeenUpTo(i) {
  for (let s = 0; s <= i && s < state.steps.length; s++) {
    if (chainIsRecursive(state.steps[s].stack || [])) return true;
  }
  return false;
}

/* ---------- derived facts for one step ---------- */

const callKey = (n) => `${n.fn}(${JSON.stringify(n.args)})`;
const argVals = (n, cap = 10) => Object.keys(n.args).slice(0, 3).map((a) => treeValue(n.args[a], cap)).join(', ');
const argPairs = (n, cap = 24) => Object.keys(n.args).slice(0, 3).map((a) => `${a}=${treeValue(n.args[a], cap)}`).join(', ');
const isRoot = (n) => n.parent === null;

function stepFacts() {
  const nodes = treeData(state.idx);
  const shown = new Map();
  let extra = 0;
  for (const n of nodes.values()) {
    if (shown.size < TREE_NODE_CAP) shown.set(n.id, n);
    else extra++;
  }
  const kids = new Map();
  for (const n of shown.values()) {
    if (n.parent !== null && !shown.has(n.parent)) continue;
    const list = kids.get(n.parent) || [];
    list.push(n);
    kids.set(n.parent, list);
  }
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order);

  const step = state.steps[state.idx];
  const curStack = step.stack || [];
  // Active = innermost frame WITHOUT a return value at this step (on a
  // return step the resolving callee is still the stack top).
  const stepRets = step.ret || [];
  let activeId = null;
  for (let d = curStack.length - 1; d >= 0; d--) {
    if (!stepRets.some((r) => r.id === curStack[d].id)) { activeId = curStack[d].id; break; }
  }
  const onStack = new Set(curStack.map((e) => e.id));
  const atErrorStep = state.idx === state.steps.length - 1 && (!!state.programError || state.stoppedRun);

  // Repeats: same function + same arguments seen more than once so far.
  const keyCount = new Map();
  for (const n of shown.values()) if (!isRoot(n)) keyCount.set(callKey(n), (keyCount.get(callKey(n)) || 0) + 1);
  const hue = new Map();
  for (const n of shown.values()) {
    const k = callKey(n);
    if (!isRoot(n) && keyCount.get(k) > 1 && !hue.has(k)) hue.set(k, REPEAT_HUES[hue.size % REPEAT_HUES.length]);
  }
  let maxDepth = 0;
  for (let s = 0; s <= state.idx; s++) maxDepth = Math.max(maxDepth, (state.steps[s].stack || []).length - 1);
  const calls = [...shown.values()].filter((n) => !isRoot(n)).length + extra;
  const repeats = [...keyCount.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);

  return { nodes: shown, kids, extra, curStack, activeId, onStack, stepRets, atErrorStep, keyCount, hue, maxDepth, calls, repeats };
}

function nodeClass(n, F) {
  if (isRoot(n)) return n.id === F.activeId ? (F.atErrorStep ? 'rt-error' : 'rt-active') : 'rt-root';
  if (n.retSet) return n.kids === 0 ? 'rt-done rt-base' : 'rt-done';
  if (n.id === F.activeId) return F.atErrorStep ? 'rt-error' : 'rt-active';
  return F.onStack.has(n.id) ? 'rt-onstack' : '';
}

// Results a waiting caller has received so far: "got 2, …".
function partial(n, F) {
  if (n.retSet || isRoot(n)) return '';
  const ch = F.kids.get(n.id) || [];
  const got = ch.filter((c) => c.retSet).map((c) => treeValue(c.ret, 8));
  if (!got.length) return '';
  return `got ${got.join(', ')}${ch.some((c) => !c.retSet) || F.onStack.has(n.id) ? ', …' : ''}`;
}

/* ---------- pane skeleton ---------- */

let view = null;

function ensureTreeView() {
  if (view && els.treeBody.contains(view.bar)) return view;
  els.treeBody.innerHTML = `
    <div class="rt-bar">
      <div class="rt-toggle" role="group" aria-label="Tree view">
        <button type="button" data-view="graph">Tree</button>
        <button type="button" data-view="text">Text</button>
      </div>
      <div class="rt-stats"></div>
    </div>
    <div class="rt-main">
      <div class="rt-scroll">
        <svg class="rt-svg" xmlns="${SVGNS}"><g class="rt-edges"></g><g class="rt-nodes"></g><g class="rt-fly"></g></svg>
        <pre class="rt-text"></pre>
      </div>
      <div class="rt-stack"></div>
    </div>
    <div class="rt-legend">
      <span><i class="rt-sw rt-sw-active"></i>running</span>
      <span title="on the call stack, waiting for a callee"><i class="rt-sw rt-sw-stack"></i>waiting</span>
      <span><i class="rt-sw rt-sw-done"></i>returned</span>
      <span><i class="rt-sw rt-sw-base"></i>base case</span>
      <span title="same function + same arguments computed again — hover a node to see every copy"><i class="rt-sw rt-sw-rep"></i>×k repeated</span>
    </div>`;
  const q = (s) => els.treeBody.querySelector(s);
  view = {
    bar: q('.rt-bar'), stats: q('.rt-stats'), toggle: q('.rt-toggle'),
    scroll: q('.rt-scroll'), svg: q('.rt-svg'), edges: q('.rt-edges'), gNodes: q('.rt-nodes'),
    gFly: q('.rt-fly'), text: q('.rt-text'), stack: q('.rt-stack'),
    nodeEls: new Map(), edgeEls: new Map(), lastStep: -1, stepsRef: null, flights: [],
  };
  view.toggle.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    state.treeView = b.dataset.view;
    renderTree();
  });
  // Hover: highlight every copy of the same call.
  view.gNodes.addEventListener('mouseover', (e) => {
    const g = e.target.closest('.rt-node');
    if (!g || !g.dataset.rep) return;
    view.svg.classList.add('rt-hovering');
    for (const el of view.nodeEls.values()) el.classList.toggle('rt-same', el.dataset.key === g.dataset.key);
  });
  view.gNodes.addEventListener('mouseout', (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.rt-node')) return;
    view.svg.classList.remove('rt-hovering');
  });
  // Click: jump to the step where that call started.
  const goto = (e) => {
    const g = e.target.closest('[data-step]');
    if (!g) return;
    document.dispatchEvent(new CustomEvent('viz:goto', { detail: Number(g.dataset.step) }));
  };
  view.gNodes.addEventListener('click', goto);
  view.stack.addEventListener('click', goto);
  view.text.addEventListener('click', goto);
  return view;
}

/* ---------- main entry ---------- */

export function renderTree() {
  // Tabs exist for the WHOLE run in Recursion mode (2026-11-08 user report).
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  // First re-entry shows the tree (once — a manual tab choice is sticky).
  const cur = state.steps[state.idx].stack || [];
  if (!state.userTab && !state.treeAnnounced && chainIsRecursive(cur)) {
    state.treeAnnounced = true;
    state.outTab = 'tree';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabTree.classList.toggle('active', state.outTab === 'tree');
  els.output.hidden = state.outTab !== 'out';
  els.treeBody.hidden = state.outTab !== 'tree';
  if (state.outTab !== 'tree') return;

  const v = ensureTreeView();
  const F = stepFacts();
  const sameRun = v.stepsRef === state.steps;
  if (!sameRun) clearGraph(v);
  const forward = sameRun && state.idx === v.lastStep + 1;
  v.stepsRef = state.steps;
  v.lastStep = state.idx;
  for (const a of v.flights) { try { a.cancel(); } catch (err) { /* done */ } }
  v.flights = [];

  const tooBig = F.nodes.size > TREE_SVG_CAP;
  const graph = state.treeView === 'graph' && !tooBig;
  for (const b of v.toggle.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.view === (graph ? 'graph' : 'text'));
  }
  v.toggle.querySelector('[data-view="graph"]').disabled = tooBig;
  v.toggle.querySelector('[data-view="graph"]').title = tooBig ? `More than ${TREE_SVG_CAP} calls — text view only` : 'Graphical tree';
  v.svg.style.display = graph ? '' : 'none';
  v.text.style.display = graph ? 'none' : '';

  const depth = Math.max(0, F.curStack.length - 1);
  v.stats.innerHTML = [
    `calls <b>${F.calls}</b>`,
    `depth <b>${depth}</b>`,
    `max depth <b>${F.maxDepth}</b>`,
    F.repeats ? `<span class="rt-stat-rep" title="calls whose function + arguments were already computed once">repeated <b>${F.repeats}</b></span>` : '',
  ].filter(Boolean).join('<span class="rt-dot">·</span>');

  renderStackColumn(v, F);
  if (graph) renderGraph(v, F, forward);
  else renderText(v, F, tooBig);
}

function clearGraph(v) {
  v.edges.innerHTML = '';
  v.gNodes.innerHTML = '';
  v.gFly.innerHTML = '';
  v.nodeEls.clear();
  v.edgeEls.clear();
}

/* ---------- call-stack column ---------- */

function renderStackColumn(v, F) {
  const rets = new Map(F.stepRets.map((r) => [r.id, r.value]));
  const rows = [...F.curStack].reverse().map((e) => {
    const n = F.nodes.get(e.id);
    const isMod = e.fn === '<module>';
    const label = isMod ? '(program)' : `${e.fn}(${n ? argPairs(n, 14) : ''})`;
    const cls = rets.has(e.id) && !isMod ? 'rt-fr rt-fr-ret' : e.id === F.activeId ? 'rt-fr rt-fr-active' : 'rt-fr';
    const ret = rets.has(e.id) && !isMod ? `<span class="rt-fr-val">→ ${escapeHtml(treeValue(rets.get(e.id), 16))}</span>` : '';
    const step = n ? ` data-step="${n.firstStep}"` : '';
    return `<div class="${cls}"${step} title="click to jump to this call's first step">${escapeHtml(label)}${ret}</div>`;
  });
  v.stack.innerHTML = `<div class="rt-stack-title">call stack</div>${rows.join('')}`;
}

/* ---------- graphical tree ---------- */

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, val);
  return el;
}

function renderGraph(v, F, forward) {
  const ms = animMs();
  v.svg.style.setProperty('--rt-anim', `${ms}ms`);
  // Labels + widths, then layout.
  const info = new Map();
  for (const n of F.nodes.values()) {
    const label = isRoot(n) ? '(program)' : `${n.fn}(${argVals(n)})`;
    const sub = isRoot(n) ? '' : n.retSet ? `→ ${treeValue(n.ret, 14)}` : partial(n, F);
    const w = Math.max(44, Math.max(label.length, sub.length) * CHAR_W + 18);
    info.set(n.id, { label, sub, w });
  }
  const order = [...F.nodes.values()].filter((n) => isRoot(n) || F.nodes.has(n.parent));
  const { pos, width, height } = layoutTree(order.map((n) => ({ id: n.id, parent: n.parent, w: info.get(n.id).w })), { gapX: 14, levelH: LEVEL_H });
  const W = Math.ceil(width + PAD * 2), H = Math.ceil(height - LEVEL_H + NODE_H + PAD * 2 + 10);
  v.svg.setAttribute('width', W);
  v.svg.setAttribute('height', H);
  v.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const P = (id) => { const p = pos.get(id); return p ? { x: p.x + PAD, y: p.y + PAD + 6 } : null; };

  // Edges.
  const seenE = new Set();
  for (const n of order) {
    if (isRoot(n)) continue;
    const a = P(n.parent), b = P(n.id);
    if (!a || !b) continue;
    seenE.add(n.id);
    let path = v.edgeEls.get(n.id);
    if (!path) { path = svgEl('path', { class: 'rt-edge' }); v.edges.appendChild(path); v.edgeEls.set(n.id, path); }
    const y1 = a.y + NODE_H, y2 = b.y, my = (y1 + y2) / 2;
    const d = `M ${a.x} ${y1} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${y2}`;
    path.setAttribute('d', d);
    path.style.d = `path("${d}")`;
    const active = F.onStack.has(n.id) && F.onStack.has(n.parent);
    path.setAttribute('class', `rt-edge${active ? ' rt-edge-active' : ''}${n.retSet ? ' rt-edge-done' : ''}`);
  }
  for (const [id, el] of v.edgeEls) if (!seenE.has(id)) { el.remove(); v.edgeEls.delete(id); }

  // Nodes.
  const seenN = new Set();
  for (const n of order) {
    const p = P(n.id);
    if (!p) continue;
    seenN.add(n.id);
    const { label, sub, w } = info.get(n.id);
    let g = v.nodeEls.get(n.id);
    const isNew = !g;
    if (isNew) {
      g = svgEl('g', { class: 'rt-node' });
      g.appendChild(svgEl('rect', { class: 'rt-box', rx: 7, ry: 7 }));
      g.appendChild(svgEl('text', { class: 'rt-label', 'text-anchor': 'middle' }));
      g.appendChild(svgEl('text', { class: 'rt-sub', 'text-anchor': 'middle' }));
      const badge = svgEl('g', { class: 'rt-badge' });
      badge.appendChild(svgEl('rect', { rx: 7, ry: 7, height: 14 }));
      badge.appendChild(svgEl('text', { 'text-anchor': 'middle', y: 10.5 }));
      g.appendChild(badge);
      g.appendChild(svgEl('title'));
      v.gNodes.appendChild(g);
      v.nodeEls.set(n.id, g);
      // Grow out of the parent: start at its position, invisible.
      const from = n.parent != null ? P(n.parent) : null;
      g.style.transition = 'none';
      g.style.opacity = '0';
      g.style.transform = from ? `translate(${from.x}px, ${from.y}px)` : `translate(${p.x}px, ${p.y}px)`;
      void g.getBoundingClientRect();
      g.style.transition = '';
    }
    const key = callKey(n);
    const repHue = F.hue.get(key);
    g.setAttribute('class', `rt-node ${nodeClass(n, F)}${repHue ? ' rt-rep' : ''}`);
    g.dataset.key = key;
    g.dataset.step = n.firstStep;
    if (repHue) g.dataset.rep = '1'; else delete g.dataset.rep;
    g.style.opacity = '1';
    g.style.transform = `translate(${p.x}px, ${p.y}px)`;
    const [box, tl, ts, badge, title] = g.children;
    box.setAttribute('x', -w / 2); box.setAttribute('y', 0);
    box.setAttribute('width', w); box.setAttribute('height', NODE_H);
    tl.setAttribute('y', sub ? 15 : 22);
    if (tl.textContent !== label) tl.textContent = label;
    ts.setAttribute('y', 29);
    if (ts.textContent !== sub) ts.textContent = sub;
    ts.setAttribute('class', `rt-sub${n.retSet ? ' rt-sub-ret' : ''}`);
    if (repHue) {
      const txt = `×${F.keyCount.get(key)}`;
      const bw = txt.length * 6.5 + 8;
      badge.style.display = '';
      badge.setAttribute('transform', `translate(${w / 2 - bw + 6}, -7)`);
      badge.firstChild.setAttribute('width', bw);
      badge.firstChild.setAttribute('fill', repHue);
      badge.lastChild.setAttribute('x', bw / 2);
      badge.lastChild.textContent = txt;
      // The running / error outline outranks the repeat colour (badge stays).
      const live = n.id === F.activeId && !n.retSet;
      box.style.stroke = live ? '' : repHue;
    } else {
      badge.style.display = 'none';
      box.style.stroke = '';
    }
    const t = isRoot(n) ? 'the program' : `${n.fn}(${argPairs(n, 40)})${n.retSet ? ` returned ${treeValue(n.ret, 40)}` : ''}${repHue ? ` — computed ${F.keyCount.get(key)} times so far` : ''} · click to jump to this call`;
    if (title.textContent !== t) title.textContent = t;
  }
  for (const [id, el] of v.nodeEls) if (!seenN.has(id)) { el.remove(); v.nodeEls.delete(id); }

  // Returned values travel up the edge to the caller (single forward step).
  if (forward && ms > 0 && typeof Element.prototype.animate === 'function') {
    for (const r of F.stepRets) {
      const n = F.nodes.get(r.id);
      if (!n || isRoot(n) || n.parent == null) continue;
      const a = P(n.id), b = P(n.parent);
      if (!a || !b) continue;
      const txt = treeValue(r.value, 12);
      const bw = txt.length * CHAR_W + 12;
      const fly = svgEl('g', { class: 'rt-flyval' });
      fly.appendChild(svgEl('rect', { x: -bw / 2, y: -9, width: bw, height: 18, rx: 9, ry: 9 }));
      const tx = svgEl('text', { 'text-anchor': 'middle', y: 4 });
      tx.textContent = txt;
      fly.appendChild(tx);
      v.gFly.appendChild(fly);
      const anim = fly.animate([
        { transform: `translate(${a.x}px, ${a.y}px)`, opacity: 1 },
        { transform: `translate(${b.x}px, ${b.y + NODE_H}px)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${b.x}px, ${b.y + NODE_H}px)`, opacity: 0 },
      ], { duration: Math.round(ms * 2), easing: 'ease-in-out' });
      const done = () => fly.remove();
      anim.onfinish = done;
      anim.oncancel = done;
      v.flights.push(anim);
    }
  }

  // Keep the active node in view.
  const act = F.activeId != null ? P(F.activeId) : null;
  if (act) scrollIntoBox(v.scroll, act.x - 80, act.y - 20, act.x + 80, act.y + NODE_H + 30, ms);
}

function scrollIntoBox(sc, x1, y1, x2, y2, ms) {
  const vw = sc.clientWidth, vh = sc.clientHeight;
  if (!vw || !vh) return;
  // The svg may be centred inside a wider scroller: offset by its position.
  // (SVG elements have no offsetLeft/offsetTop — measure with rects.)
  const svg = sc.querySelector('.rt-svg');
  const sr = sc.getBoundingClientRect();
  const gr = svg ? svg.getBoundingClientRect() : sr;
  const ox = gr.left - sr.left + sc.scrollLeft, oy = gr.top - sr.top + sc.scrollTop;
  let left = sc.scrollLeft, top = sc.scrollTop;
  if (x1 + ox < left || x2 + ox > left + vw) left = Math.max(0, (x1 + x2) / 2 + ox - vw / 2);
  if (y1 + oy < top || y2 + oy > top + vh) top = Math.max(0, (y1 + y2) / 2 + oy - vh / 2);
  if (left !== sc.scrollLeft || top !== sc.scrollTop) {
    sc.scrollTo({ left, top, behavior: ms > 0 ? 'smooth' : 'auto' });
  }
}

/* ---------- ASCII tree (Text view) ---------- */

function renderText(v, F, tooBig) {
  const lines = [];
  let root = null;
  for (const n of F.nodes.values()) if (n.parent === null) { root = n; break; }
  let activeLine = -1;
  if (root) {
    if (root.id === F.activeId) activeLine = 0;
    lines.push(`<span class="${nodeTextCls(root, F)}">(program)</span>`);
    const walk = (parent, prefix) => {
      const list = F.kids.get(parent) || [];
      list.forEach((k, i) => {
        const last = i === list.length - 1;
        let label = `${k.fn}(${argPairs(k)})`;
        if (k.retSet) label += ' → ' + treeValue(k.ret, 40);
        const part = partial(k, F);
        if (part) label += `   [${part}]`;
        const hue = F.hue.get(callKey(k));
        const rep = hue ? ` <span class="tn-rep" style="color:${hue}">×${F.keyCount.get(callKey(k))}</span>` : '';
        const base = k.retSet && k.kids === 0 ? ' <span class="tn-base">base</span>' : '';
        if (k.id === F.activeId) activeLine = lines.length;
        lines.push(`<span class="${nodeTextCls(k, F)}" data-step="${k.firstStep}">${escapeHtml(prefix + (last ? '└─ ' : '├─ '))}${escapeHtml(label)}</span>${rep}${base}`);
        walk(k.id, prefix + (last ? '   ' : '│  '));
      });
    };
    walk(root.id, '');
  }
  if (F.extra > 0) lines.push(`<span class="tn-more">+${F.extra} more calls not shown</span>`);
  if (tooBig) lines.unshift(`<span class="tn-more">(more than ${TREE_SVG_CAP} calls — showing the text tree)</span>`);
  const html = lines.join('\n') || '<span class="tn-more">(no calls yet)</span>';
  if (v.text._html !== html) { v.text.innerHTML = html; v.text._html = html; }
  // Keep the ACTIVE call in view (was: always scrolled to the bottom, which
  // lost the active node whenever the recursion unwound to an earlier call).
  if (activeLine >= 0) {
    const row = v.text.querySelector('.tn-active, .tn-error');
    if (row) {
      const top = row.offsetTop - v.text.offsetTop;
      const sc = v.scroll;
      if (top < sc.scrollTop || top + row.offsetHeight > sc.scrollTop + sc.clientHeight) {
        sc.scrollTop = Math.max(0, top - sc.clientHeight / 2);
      }
    }
  }
}

function nodeTextCls(n, F) {
  if (n.retSet) return 'tn-done';
  if (n.id === F.activeId) return F.atErrorStep ? 'tn-error' : 'tn-active';
  return F.onStack.has(n.id) ? 'tn-stack' : '';
}