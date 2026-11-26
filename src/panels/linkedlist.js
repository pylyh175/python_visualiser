/* ═══════════════ Linked List visualiser (2026-11-26 linked-list design, grilled Q1–Q12) ═══════════════
   Each node is a box `[ data | next ● ]` with an arrow to the node it links
   to (Q1); the last node's next reads ⏚ (None). Nodes are laid out by
   following `next` from `head` (Q2) — a node not yet linked (`new_node`)
   floats ABOVE the chain at its insert spot, a node just unlinked
   (`removed`) drops BELOW, red, while the bypass arrow arcs over it (Q5–Q6).
   head / tail and every method local that points at a node (`current`,
   `previous`, …) are gliding tags under the boxes (Q3–Q4), drawn by the
   two-pointer kit. Index labels under the chain (Q9). One row, scrolled to
   the active node (Q10). Arrows changed on this step are highlighted.
   Ground truth only: the runner's per-step memory graph (same-class links
   cost no depth — runner.py MEM_MAX_LINKED) plus recorded frames, returns
   and exceptions. One list per run, singly linked (Q11–Q12).
   shortcut: nodes are found by attribute NAMES (head/next/data families);
   upgrade to structural detection if a learner's code uses other names. */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue, treeValue } from '../utils.js';
import { ensureView, beginFrame, syncCells, placeMarkers, setCaption, setLegend, showMessage, cellAt } from './pointerKit.js';
import { val } from './queue.js';
import { hideOutTabsAll } from './shared.js';

const HEAD_NAMES = ['head', 'first', 'front'];
const TAIL_NAMES = ['tail', 'rear', 'last'];
const SIZE_NAMES = ['length', 'size', 'count', 'n'];
const NEXT_NAMES = ['next', 'link'];
const DATA_NAMES = ['data', 'item', 'value', 'val'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const isRef = (x) => !!x && typeof x === 'object' && 'ref' in x;
const attrsOf = (node) => new Map((node && node.items || []).filter(Array.isArray));

// A node instance: a link field to its own class (or None) plus a value.
function nodeShape(mem, node) {
  if (!node || node.t !== 'inst') return null;
  const a = attrsOf(node);
  const nextName = NEXT_NAMES.find((n) => a.has(n));
  const dataName = DATA_NAMES.find((n) => a.has(n));
  if (!nextName || !dataName) return null;
  const nx = a.get(nextName);
  if (isRef(nx)) {
    const t = mem.nodes[String(nx.ref)];
    if (!t || t.cls !== node.cls) return null;
  }
  return { cls: node.cls, nextName, dataName };
}

// The list held by a step: instance `oid` (or, with oid null, the first
// instance whose head names a node).
function listIn(step, oid, shape) {
  const mem = step && step.mem;
  if (!mem || !mem.nodes) return null;
  const ids = oid != null ? [String(oid)] : Object.keys(mem.nodes);
  for (const id of ids) {
    const node = mem.nodes[id];
    if (!node || node.t !== 'inst') continue;
    const a = attrsOf(node);
    const headName = HEAD_NAMES.find((n) => a.has(n));
    if (!headName) continue;
    const h = a.get(headName);
    let sh = shape;
    if (!sh) {
      if (!isRef(h)) continue;   // detection needs a real first node
      sh = nodeShape(mem, mem.nodes[String(h.ref)]);
      if (!sh) continue;
    } else if (h !== null && !isRef(h)) continue;
    const tailName = TAIL_NAMES.find((n) => a.has(n));
    const sizeName = SIZE_NAMES.find((n) => Number.isInteger(a.get(n)));
    return {
      oid: id, cls: node.cls, shape: sh, mem,
      headName, head: isRef(h) ? String(h.ref) : null,
      tailName, tail: tailName && isRef(a.get(tailName)) ? String(a.get(tailName).ref) : null,
      sizeName, size: sizeName ? a.get(sizeName) : null,
    };
  }
  return null;
}

// Follow next from head: [{oid, data, next}], plus the cut count / cycle.
function chainOf(L) {
  const out = [];
  const seen = new Set();
  let cur = L.head, more = 0, cycle = false;
  while (cur !== null) {
    if (seen.has(cur)) { cycle = true; break; }
    const n = L.mem.nodes[cur];
    if (!n) break;
    seen.add(cur);
    const a = attrsOf(n);
    const nx = a.get(L.shape.nextName);
    out.push({ oid: cur, data: a.get(L.shape.dataName), next: isRef(nx) ? String(nx.ref) : null });
    if (nx && typeof nx === 'object' && 'more' in nx) { more = nx.more; break; }
    cur = isRef(nx) ? String(nx.ref) : null;
  }
  return { nodes: out, more, cycle };
}

// Nodes of the list's class held by method locals but not in the chain.
function detachedOf(L, chainSet) {
  const out = new Map();
  for (const [name, r] of Object.entries(L.mem.roots || {})) {
    if (!isRef(r)) continue;
    const id = String(r.ref);
    const n = L.mem.nodes[id];
    if (chainSet.has(id) || !n || n.cls !== L.shape.cls) continue;
    const a = attrsOf(n);
    const nx = a.get(L.shape.nextName);
    out.set(id, { oid: id, data: a.get(L.shape.dataName), next: isRef(nx) ? String(nx.ref) : null, hasData: a.has(L.shape.dataName) });
  }
  return [...out.values()];
}

// Local names pointing at each node (pointer tags), list's own `self` excluded.
function localsOf(L) {
  const by = new Map();
  for (const [name, r] of Object.entries(L.mem.roots || {})) {
    if (!isRef(r) || String(r.ref) === L.oid) continue;
    const n = L.mem.nodes[String(r.ref)];
    if (!n || n.cls !== L.shape.cls) continue;
    if (!by.has(String(r.ref))) by.set(String(r.ref), []);
    by.get(String(r.ref)).push(name);
  }
  return by;
}

// Run facts, cached per trace: the locked list oid + shape, its first step,
// frames that ran on it, and per step the set of nodes in the chain.
let cache = { steps: null };
function runFacts() {
  if (cache.steps === state.steps) return cache;
  let oid = null, shape = null, first = -1;
  for (let i = 0; i < state.steps.length && oid === null; i++) {
    const L = listIn(state.steps[i], null, null);
    if (L) { oid = L.oid; shape = L.shape; }
  }
  if (oid !== null) {
    for (let i = 0; i < state.steps.length; i++) {
      if (listIn(state.steps[i], oid, shape)) { first = i; break; }
    }
  }
  const calls = new Map();
  for (const st of state.steps) {
    for (const e of st.stack || []) {
      if (oid !== null && String(e.oid) === oid && !calls.has(e.id)) calls.set(e.id, { fn: e.fn, args: e.args || {} });
    }
  }
  cache = { steps: state.steps, oid, shape, first, calls, chainAt: new Map() };
  return cache;
}

// The list at step i (held from the last step that recorded it) + its chain.
function snapshot(i, facts) {
  for (let s = i; s >= facts.first && s >= 0; s--) {
    const L = listIn(state.steps[s], facts.oid, facts.shape);
    if (L) {
      const chain = chainOf(L);
      return { L, chain, set: new Set(chain.nodes.map((n) => n.oid)), step: s };
    }
  }
  return null;
}

export function llistFound() {
  return runFacts().oid !== null;
}

// Has this node ever sat in the chain at a step ≤ i? (removed vs new)
function everInChain(oid, i, facts) {
  for (let s = facts.first; s <= i; s++) {
    let set = facts.chainAt.get(s);
    if (!set) {
      const snap = snapshot(s, facts);
      set = snap ? snap.set : new Set();
      facts.chainAt.set(s, set);
    }
    if (set.has(oid)) return true;
  }
  return false;
}

const callText = (c) => {
  const args = Object.entries(c.args).filter(([k]) => k !== 'self').map(([k, x]) => `${k}=${treeValue(x, 16)}`);
  return `${c.fn}(${args.join(', ')})`;
};

function describe(cur, prev, facts, locals) {
  const step = state.steps[state.idx];
  const L = cur.L;
  const dataOf = (snap, oid) => {
    const n = snap && snap.L.mem.nodes[oid];
    return n ? attrsOf(n).get(L.shape.dataName) : undefined;
  };
  // A node's display name: a local pointing at it, else node(data).
  const nameOf = (oid) => {
    if (oid === null) return 'None';
    const names = (locals.get(oid) || []).filter((n) => n !== 'self');
    return names.length ? escapeHtml(names[0]) : `node(${val(dataOf(cur, oid) ?? dataOf(prev, oid))})`;
  };
  const nodeTxt = (oid) => (oid === null ? 'None' : `node(${val(dataOf(cur, oid) ?? dataOf(prev, oid))})`);
  for (const x of step.exc || []) {
    const c = facts.calls.get(x.id);
    if (c) return `<span class="q-cap-err">✗ ${escapeHtml(callText(c))} raised ${escapeHtml(x.exc)}</span>`;
  }
  for (const r of step.ret || []) {
    const c = facts.calls.get(r.id);
    if (c && c.fn !== '__init__') {
      const m = typeof r.value === 'string' && r.value.startsWith(`${L.shape.cls} instance {`)
        && new RegExp(`\\b${L.shape.dataName}: ([^,}]+)`).exec(r.value);
      return `<b>${escapeHtml(c.fn)}()</b> returned <b>${m ? `node(${escapeHtml(m[1].trim())})` : val(r.value)}</b>`;
    }
  }
  const moves = [];
  if (prev) {
    const P = prev.L;
    const both = (oid) => (nameOf(oid) === nodeTxt(oid) ? nodeTxt(oid) : `${nameOf(oid)} <span class="tp-cap-muted">(${nodeTxt(oid)})</span>`);
    if (P.head !== L.head) moves.push(`${escapeHtml(L.headName)} = ${both(L.head)}`);
    if (L.tailName && P.tail !== L.tail) moves.push(`${escapeHtml(L.tailName)} = ${both(L.tail)}`);
    // Rewired links: any node whose next differs from the previous step.
    const nextAt = (snap, oid) => {
      const n = snap.L.mem.nodes[oid];
      if (!n) return undefined;
      const nx = attrsOf(n).get(L.shape.nextName);
      return isRef(nx) ? String(nx.ref) : null;
    };
    for (const oid of Object.keys(L.mem.nodes)) {
      const n = L.mem.nodes[oid];
      if (!n || n.cls !== L.shape.cls) continue;
      const before = nextAt(prev, oid), now = nextAt(cur, oid);
      if (before === undefined || before === now) continue;
      moves.push(`${nameOf(oid)}.${escapeHtml(L.shape.nextName)} = ${nameOf(now)} <span class="tp-cap-muted">(${nodeTxt(oid)} → ${nodeTxt(now)})</span>`);
    }
    for (const oid of Object.keys(L.mem.nodes)) {
      const n = L.mem.nodes[oid];
      if (!n || n.cls !== L.shape.cls) continue;
      const a = dataOf(prev, oid), b = dataOf(cur, oid);
      if (a !== undefined && b !== undefined && a !== b) moves.push(`${nameOf(oid)}.${escapeHtml(L.shape.dataName)} = <b>${val(b)}</b> (was ${val(a)})`);
    }
    if (L.sizeName && Number.isInteger(P.size) && P.size !== L.size) moves.push(`${escapeHtml(L.sizeName)} ${P.size} → ${L.size}`);
    // Traversal locals that moved to another node.
    const prevLocals = localsOf(P);
    const where = (map) => { const m = new Map(); for (const [oid, ns] of map) for (const nm of ns) m.set(nm, oid); return m; };
    const pw = where(prevLocals), cw = where(locals);
    for (const [nm, oid] of cw) {
      if (nm === 'self' || !pw.has(nm) || pw.get(nm) === oid) continue;
      const from = pw.get(nm);
      const viaNext = nextAt(prev, from) === oid;
      moves.push(`${escapeHtml(nm)} = ${viaNext ? `${escapeHtml(nm)}.${escapeHtml(L.shape.nextName)}` : nameOf(oid)} → <b>${nodeTxt(oid)}</b>`);
    }
    for (const [nm, oid] of cw) {
      if (nm === 'self' || pw.has(nm)) continue;
      if (!prev.set.has(oid) && !cur.set.has(oid) && !(prevLocals.has(oid))) moves.push(`<span class="ll-cap-new">new ${escapeHtml(L.shape.cls)}(${val(dataOf(cur, oid))})</span> → ${escapeHtml(nm)}`);
    }
  }
  if (moves.length) return moves.join(' · ');
  const top = (step.stack || [])[(step.stack || []).length - 1];
  const c = top && facts.calls.get(top.id);
  if (c && c.fn !== '__init__') return `<span class="tp-cap-muted">running ${escapeHtml(callText(c))}</span>`;
  const n = cur.chain.nodes.length;
  return `<span class="tp-cap-muted">${n ? `${n} node${n === 1 ? '' : 's'} · ${escapeHtml(L.headName)} → ${nodeTxt(L.head)}${L.tailName ? ` · ${escapeHtml(L.tailName)} → ${nodeTxt(L.tail)}` : ''}` : `empty — ${escapeHtml(L.headName)} is None`}</span>`;
}

// SVG arrows between boxes, recomputed from live geometry (also during the
// raise/drop transition, via rAF for one animation length).
function drawArrows(v) {
  const svg = v.arrowSvg;
  if (!svg || !v.links) return;
  const base = v.track.getBoundingClientRect();
  if (!base.width) return;
  svg.setAttribute('width', v.track.scrollWidth);
  svg.setAttribute('height', v.track.scrollHeight);
  let html = '';
  for (const lk of v.links) {
    const from = v.array.querySelector(`[data-key="n${lk.from}"] .ll-next`);
    const to = lk.to === null ? null : v.array.querySelector(`[data-key="n${lk.to}"]`);
    if (!from || !to) continue;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - base.left, y1 = a.top + a.height / 2 - base.top;
    let x2 = b.left - base.left - 1, y2 = b.top + b.height / 2 - base.top;
    let d;
    if (lk.skip) {
      // Bypass: arc over the node(s) between.
      const top = Math.min(a.top, b.top) - base.top - 26;
      d = `M${x1} ${y1} C${x1} ${top} ${x2 - 16} ${top} ${x2} ${y2}`;
    } else if (x2 < x1) {
      // Pointing back left (cycle or reorder): loop under the row.
      x2 = b.left + b.width / 2 - base.left;
      y2 = b.bottom - base.top + 2;
      const low = Math.max(a.bottom, b.bottom) - base.top + 30;
      d = `M${x1} ${y1} C${x1} ${low} ${x2} ${low} ${x2} ${y2}`;
    } else {
      d = `M${x1} ${y1} L${x2} ${y2}`;
    }
    html += `<path class="ll-arrow${lk.cls ? ' ' + lk.cls : ''}" d="${d}" marker-end="url(#llHead${lk.cls ? '-' + lk.cls : ''})"/>`;
  }
  const defs = ['', 'll-arrow-new', 'll-arrow-bypass'].map((c) => `<marker id="llHead${c ? '-' + c : ''}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ll-head${c ? ' ' + c : ''}" d="M0 0L10 5L0 10z"/></marker>`).join('');
  svg.innerHTML = `<defs>${defs}</defs>${html}`;
}

function ensureArrows(v) {
  if (v.arrowSvg && v.track.contains(v.arrowSvg)) return;
  v.arrowSvg = document.createElementNS(SVG_NS, 'svg');
  v.arrowSvg.setAttribute('class', 'll-arrows');
  v.track.appendChild(v.arrowSvg);
  v.track.classList.add('ll-track');
  v.array.classList.add('ll-array');
  if (typeof ResizeObserver !== 'undefined') {
    v.llRo = new ResizeObserver(() => drawArrows(v));
    v.llRo.observe(v.track);
  }
}

function followArrows(v, ms) {
  const end = performance.now() + ms + 60;
  const tick = () => { drawArrows(v); if (performance.now() < end) v.raf = requestAnimationFrame(tick); };
  if (v.raf) cancelAnimationFrame(v.raf);
  tick();
}

export function renderLListPanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const facts = runFacts();
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabLList.hidden = false;
  if (!state.userTab && !state.llistAnnounced && facts.oid !== null && state.idx >= facts.first) {
    state.llistAnnounced = true;
    state.outTab = 'llist';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabLList.classList.toggle('active', state.outTab === 'llist');
  els.output.hidden = state.outTab !== 'out';
  els.llistBody.hidden = state.outTab !== 'llist';
  if (state.outTab !== 'llist') return;

  const body = els.llistBody;
  const cur = facts.oid !== null && state.idx >= facts.first ? snapshot(state.idx, facts) : null;
  if (!cur) {
    showMessage(body, facts.oid === null
      ? 'No Linked List found — needs a class whose head points at nodes with next and data.'
      : 'The list has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const prev = state.idx > facts.first ? snapshot(state.idx - 1, facts) : null;
  const L = cur.L;
  const v = ensureView(body);
  ensureArrows(v);
  const f = beginFrame(v);
  const locals = localsOf(L);

  // Slots: the chain, with detached nodes placed before the node they link
  // to (or at the end): above if new, below if they were in the chain.
  const detached = detachedOf(L, cur.set).map((d) => ({ ...d, removed: everInChain(d.oid, state.idx, facts) }));
  const slots = cur.chain.nodes.map((n, i) => ({ ...n, idx: i }));
  for (const d of detached) {
    const at = d.next !== null ? slots.findIndex((s) => s.oid === d.next && s.idx != null) : -1;
    slots.splice(at < 0 ? slots.length : at, 0, { ...d, idx: null });
  }
  const prevNext = new Map();
  if (prev) {
    for (const [oid, n] of Object.entries(prev.L.mem.nodes)) {
      if (n && n.cls === L.shape.cls) {
        const nx = attrsOf(n).get(L.shape.nextName);
        prevNext.set(oid, isRef(nx) ? String(nx.ref) : null);
      }
    }
  }
  const pos = new Map(slots.map((s, i) => [s.oid, i]));
  const specs = slots.map((s) => {
    const det = s.idx == null;
    const cls = ['tp-cell', 'll-node'];
    if (det) cls.push(s.removed ? 'll-removed' : 'll-new');
    const nextTxt = s.next === null ? '⏚' : '●';
    const data = s.hasData === false ? '…' : escapeHtml(treeValue(s.data, 8));
    return {
      key: `n${s.oid}`, idx: det ? `d${s.oid}` : s.idx,
      html: `<span class="ll-data">${data}</span><span class="ll-next">${nextTxt}</span>`,
      cls: cls.join(' '),
      title: `${L.shape.cls}: ${L.shape.dataName} = ${fmtValue(s.data)}, ${L.shape.nextName} = ${s.next === null ? 'None' : 'node'}`,
    };
  });
  if (!slots.length) specs.push({ key: 'none', idx: 'none', text: 'None', cls: 'tp-cell ll-none', title: `${L.headName} is None — the list is empty` });
  if (cur.chain.more) specs.push({ key: 'more', idx: 'more', text: `+${cur.chain.more}`, cls: 'tp-cell ll-none', title: `${cur.chain.more} more nodes — the tracer records the first 100` });
  syncCells(v.array, specs);

  // Links: every drawn node with a next; highlight arrows changed this step.
  v.links = slots.filter((s) => s.next !== null).map((s) => {
    const changed = prev && prevNext.has(s.oid) && prevNext.get(s.oid) !== s.next;
    const skip = pos.has(s.next) && pos.get(s.next) > pos.get(s.oid) + 1;
    return { from: s.oid, to: s.next, skip, cls: changed ? (skip ? 'll-arrow-bypass' : 'll-arrow-new') : '' };
  });

  // Pointer tags: head / tail, then the method locals.
  const roleOf = { head: 'left', tail: 'right' };
  const pointers = [];
  const target = (oid) => (oid === null ? (slots.length ? null : 'none') : (pos.has(oid) ? (slots[pos.get(oid)].idx ?? `d${oid}`) : null));
  const ht = target(L.head);
  if (ht !== null) pointers.push({ name: L.headName, idx: ht, role: roleOf.head });
  if (L.tailName) {
    const tt = target(L.tail);
    if (tt !== null) pointers.push({ name: L.tailName, idx: tt, role: roleOf.tail });
  }
  for (const [oid, names] of locals) {
    const t = target(oid);
    if (t === null) continue;
    for (const nm of names) pointers.push({ name: nm, idx: t, role: nm === 'self' ? 'fast' : 'slow', label: nm });
  }
  placeMarkers(v, pointers, f.newStep);

  const size = L.size ?? cur.chain.nodes.length;
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(L.cls)}</span>
    <span>${escapeHtml(L.sizeName || 'nodes')} ${size}</span>
    <span class="tp-ptr tp-role-text-left">${escapeHtml(L.headName)} → ${L.head === null ? 'None' : `node(${val(cur.chain.nodes[0]?.data)})`}</span>
    ${L.tailName ? `<span class="tp-ptr tp-role-text-right">${escapeHtml(L.tailName)} → ${L.tail === null ? 'None' : `node(${val(attrsOf(L.mem.nodes[L.tail]).get(L.shape.dataName))})`}</span>` : ''}
    ${cur.chain.cycle ? '<span class="tp-badge tp-badge-warn">cycle — next leads back into the list</span>' : ''}`;
  setCaption(v, describe(cur, prev, facts, locals));
  setLegend(v, [
    ['ll-sw-node', `${L.shape.cls}: ${L.shape.dataName} | ${L.shape.nextName}`],
    ['ll-sw-new', 'new — not linked yet'],
    ['ll-sw-removed', 'unlinked'],
    ['ll-sw-arrow', 'link changed this step'],
  ]);

  // Arrows follow the boxes while they settle; keep the active node in view.
  followArrows(v, f.newStep ? f.ms : 0);
  const active = slots.find((s) => s.idx == null) || slots.find((s) => locals.has(s.oid))
    || slots.find((s) => prevNext.has(s.oid) && prevNext.get(s.oid) !== s.next);
  const el = active ? cellAt(v, active.idx ?? `d${active.oid}`) : null;
  if (el && body.scrollWidth > body.clientWidth) {
    const b = body.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.left < b.left + 20 || r.right > b.right - 20) body.scrollLeft += r.left - b.left - b.width / 2 + r.width / 2;
  }
}
