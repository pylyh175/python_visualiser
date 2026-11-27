/* ═══════════════ Hash Table (Separate Chaining) facts (2026-11-28 design) ═══════════════
   Pure trace analysis — no DOM, no app state — replayed by
   tests/chaining.sim.mjs and drawn by panels/chaining.js.
   Ground truth only: step.mem (table instance → slot list → Node chains;
   same-class `next` links cost the tracer no depth), mem.roots (method locals
   pointing at nodes: current / previous / head, and `self` inside
   Node.__init__), step.stack, step.ret, step.exc. Call and scope bookkeeping,
   the hash strip and Python spelling come from hashShared.js (Q3).
   shortcut: node attributes and walk locals are found by NAMES (lists
   below); upgrade to structural detection if learners' code uses others.
   Buckets held as Python lists are not drawn (Q9). */

import { escapeHtml } from '../utils.js';
import {
  ARRAY_NAMES, COUNT_NAMES, RESULT_NAMES,
  isRef, attrsOf, same, pick, py, bare, h, analyseTables, snap, topId, live, inside,
  scopeAt, loopOf, hashStrip, hashCaption,
} from './hashShared.js';

export { py, bare, tableFound } from './hashShared.js';

const NEXT_NAMES = ['next', 'link'];
const KEY_NAMES = ['key', 'k'];
const VALUE_NAMES = ['value', 'val', 'data'];
const CUR_NAMES = ['current', 'cur', 'curr', 'node'];
const SCAN_BUCKET_NAMES = ['index', 'i', 'x', 'idx', 'position'];
const SCAN_HEAD_NAMES = ['head', 'bucket', 'chain', 'slot'];
const WALK_KINDS = new Set(['insert', 'lookup', 'delete']);

// A chain node: an instance with next + key + value attributes.
function nodeShape(node) {
  if (!node || node.t !== 'inst') return null;
  const a = attrsOf(node);
  const nextName = NEXT_NAMES.find((n) => a.has(n));
  const keyName = KEY_NAMES.find((n) => a.has(n));
  const valueName = VALUE_NAMES.find((n) => a.has(n) && n !== keyName);
  if (!nextName || !keyName || !valueName) return null;
  return { cls: node.cls, nextName, keyName, valueName };
}

// One node read through a shape. Tolerant: a node still inside __init__ may
// not have every attribute yet (shown as …).
function nodeOf(mem, oid, shape) {
  const n = mem.nodes[oid];
  if (!n || n.t !== 'inst' || n.cls !== shape.cls) return null;
  const a = attrsOf(n);
  const nx = a.get(shape.nextName);
  return {
    oid, key: a.get(shape.keyName), value: a.get(shape.valueName),
    hasKey: a.has(shape.keyName), hasValue: a.has(shape.valueName), hasNext: a.has(shape.nextName),
    next: isRef(nx) ? String(nx.ref) : null,
    more: nx && typeof nx === 'object' && 'more' in nx ? nx.more : 0,
  };
}

// The table held by instance `oid` at one step: each slot's chain, followed
// from its first node, plus the count attribute.
export function tableAt(step, oid) {
  const mem = step && step.mem;
  if (!mem || !mem.nodes) return null;
  const node = mem.nodes[String(oid)];
  if (!node || node.t !== 'inst') return null;
  const a = attrsOf(node);
  for (const name of ARRAY_NAMES) {
    const r = a.get(name);
    if (!isRef(r)) continue;
    const list = mem.nodes[String(r.ref)];
    if (!list || list.t !== 'list') continue;
    let shape = null, ok = true, more = 0;
    const heads = [];
    for (const it of list.items) {
      if (it === null) heads.push(null);
      else if (isRef(it)) {
        const sh = nodeShape(mem.nodes[String(it.ref)]);
        if (!sh || (shape && sh.cls !== shape.cls)) { ok = false; break; }
        shape = shape || sh;
        heads.push(String(it.ref));
      } else if (it && typeof it === 'object' && 'more' in it) more = it.more;
      else { ok = false; break; }
    }
    if (!ok) continue;
    const buckets = heads.map((head) => {
      const nodes = [];
      const seen = new Set();
      let cur = head, cut = 0, cycle = false;
      while (cur !== null && shape) {
        if (seen.has(cur)) { cycle = true; break; }
        const n = nodeOf(mem, cur, shape);
        if (!n) break;
        seen.add(cur);
        nodes.push(n);
        if (n.more) { cut = n.more; break; }
        cur = n.next;
      }
      return { head, nodes, cut, cycle };
    });
    const countName = COUNT_NAMES.find((n) => Number.isInteger(a.get(n)));
    const total = buckets.reduce((s, b) => s + b.nodes.length, 0);
    return {
      oid: String(oid), cls: node.cls, arrayName: name, arrayRef: String(r.ref), mem, shape,
      buckets, more, size: heads.length + more,
      countName: countName || null, count: countName ? a.get(countName) : total,
    };
  }
  return null;
}

export function analyse(steps) {
  const facts = analyseTables(steps, tableAt);
  // The node class per table: the first shape seen anywhere in the trace
  // (an empty table has none yet, but its new node still needs drawing).
  facts.shapes = new Map();
  for (const t of facts.tables) {
    for (let i = t.first; i < steps.length; i++) {
      const tb = tableAt(steps[i], t.oid);
      if (tb && tb.shape) { facts.shapes.set(t.oid, tb.shape); break; }
    }
  }
  return facts;
}

const bucketOfNode = (t, oid) => t.buckets.findIndex((b) => b.nodes.some((n) => n.oid === oid));

// The chain walk of an operation: its hash call, then every node `current`
// visited in the operation's own frame, and whether it ran off the end.
function walkOf(facts, w, i, oid) {
  const hc = [...facts.calls.values()].find((c) => c.kind === 'hash' && c.parent === w.id) || null;
  const home = hc && hc.hasRet && i >= hc.retAt ? hc.ret : null;
  const visited = [];
  let end = null, lastOid;
  const from = hc ? hc.end + 1 : w.start + 1;
  for (let s = from; s <= Math.min(i, w.end); s++) {
    const st = facts.steps[s];
    if (topId(st) !== w.id) continue;
    const cn = pick(st.locals, CUR_NAMES);
    if (!cn) continue;
    const r = st.mem && st.mem.roots && st.mem.roots[cn];
    if (isRef(r)) {
      const id = String(r.ref);
      if (id === lastOid) continue;
      lastOid = id;
      const t = snap(facts, oid, s);
      const shape = facts.shapes.get(oid);
      const n = t && shape ? nodeOf(t.mem, id, shape) : null;
      visited.push({ oid: id, key: n ? n.key : undefined, kind: n && same(n.key, w.key) ? 'match' : 'passed', at: s });
      end = null;
    } else if (st.locals[cn] === null && lastOid !== null) {
      if (!end) end = { at: s, afterNodes: visited.length };
      lastOid = null;
    }
  }
  // Chain length when the walk began (deleting shortens it mid-walk).
  const t0 = home !== null ? snap(facts, oid, hc.end) : null;
  const len = t0 && t0.buckets[home] ? t0.buckets[home].nodes.length : 0;
  return { call: w, hash: hc, home, visited, end, len, live: live(w, i) };
}

// Everything the renderer draws at step i.
export function frameAt(facts, i) {
  const step = facts.steps[i];
  const sc = scopeAt(facts, i);
  const scope = sc ? sc.scope : null;
  const activeOid = scope ? scope.oid : null;
  const roots = (step.mem && step.mem.roots) || {};

  const figures = facts.tables.filter((t) => t.first <= i).map((t) => {
    const cur = snap(facts, t.oid, i);
    const prev = i > 0 ? snap(facts, t.oid, i - 1) : null;
    const fig = {
      oid: t.oid, name: t.name, table: cur, active: t.oid === activeOid,
      detached: [], tags: [], marks: new Map(), home: null, scanBucket: null, nilBucket: null,
      flashSlot: new Map(), flashNode: new Map(), links: new Map(), longest: 0,
    };
    if (!cur) return fig;
    fig.longest = Math.max(0, ...cur.buckets.map((b) => b.nodes.length));
    if (prev && prev.arrayRef === cur.arrayRef) diffLinks(fig, prev, cur);
    return fig;
  });
  const fig = figures.find((f) => f.active) || null;
  const cur = fig ? fig.table : null;
  const out = { figures, scope, live: !!(sc && sc.live), hash: null, walk: null, scanInfo: null, badge: null, caption: '' };
  if (!fig || !cur) { out.caption = idleCaption(figures); return out; }
  const shape = facts.shapes.get(fig.oid) || cur.shape;

  // The walk: the scope itself, or a lookup nested in it (contains → getitem).
  let w = WALK_KINDS.has(scope.kind) ? scope : null;
  if (!w) {
    for (const c of facts.calls.values()) {
      if (WALK_KINDS.has(c.kind) && c.oid === fig.oid && c.start <= i && inside(c, scope) && c.id !== scope.id && (!w || c.start > w.start)) w = c;
    }
  }
  if (w) {
    const wk = walkOf(facts, w, i, fig.oid);
    out.walk = wk;
    if (wk.home !== null) fig.home = wk.home;
    for (const v of wk.visited) fig.marks.set(v.oid, v.kind);
    if (wk.end && wk.home !== null) fig.nilBucket = wk.home;
    if (wk.end && wk.end.afterNodes === 0 && (w.kind === 'lookup' || w.kind === 'delete') && wk.end.at === i) fig.flashSlot.set(wk.home, 'hc-miss');
  }

  // Hash strip: the latest hash call inside the scope.
  let hc = null;
  for (const c of facts.calls.values()) {
    if (c.kind !== 'hash' || c.oid !== fig.oid || c.start > i || !inside(c, scope)) continue;
    if (!hc || c.start > hc.start) hc = c;
  }
  if (hc) out.hash = hashStrip(facts, hc, i);

  // Nodes held by locals but in no chain: the new node (insert) floats
  // above, the unlinked node (delete) drops below (Q5–Q6).
  const inChain = new Set(cur.buckets.flatMap((b) => b.nodes.map((n) => n.oid)));
  if (shape) {
    const seen = new Set();
    for (const [name, r] of Object.entries(roots)) {
      if (!isRef(r)) continue;
      const id = String(r.ref);
      if (inChain.has(id) || seen.has(id)) continue;
      const n = nodeOf(cur.mem, id, shape);
      if (!n) continue;
      seen.add(id);
      const removed = scope.kind === 'delete' || (w && w.kind === 'delete');
      const bucket = fig.home !== null ? fig.home : n.next !== null ? bucketOfNode(cur, n.next) : -1;
      if (bucket < 0) continue;
      fig.detached.push({ ...n, bucket, role: removed ? 'removed' : 'new', name });
    }
  }

  // Pointer tags: every local that points at a node (Q4).
  for (const [name, r] of Object.entries(roots)) {
    if (!isRef(r)) continue;
    const id = String(r.ref);
    if (id === fig.oid) continue;
    if (!inChain.has(id) && !fig.detached.some((d) => d.oid === id)) continue;
    fig.tags.push({ name: name === 'self' ? 'new' : name, target: `n${id}` });
  }
  const cn = pick(step.locals, CUR_NAMES);
  if (cn && step.locals[cn] === null && out.live) {
    const k = fig.nilBucket !== null ? fig.nilBucket : null;
    if (k !== null) fig.tags.push({ name: `${cn} = None`, target: `nil${k}` });
  }

  // Scans: bucket cursor down the slots, `current` walking each chain (Q8).
  if (scope.kind === 'scan') {
    const loop = loopOf(facts, scope, i, [...SCAN_BUCKET_NAMES, ...SCAN_HEAD_NAMES]);
    const row = loop.rows[loop.k] || {};
    const ixName = pick(row, SCAN_BUCKET_NAMES);
    const k = ixName && Number.isInteger(row[ixName]) ? row[ixName] : loop.k;
    const finished = !out.live;
    const prevK = i > scope.start ? loopOf(facts, scope, i - 1, [...SCAN_BUCKET_NAMES, ...SCAN_HEAD_NAMES]).k : -1;
    let newBucket = loop.k !== prevK;   // the iteration began this step: `current` is still last bucket's
    // Still stale until `current` reaches a node of THIS bucket (the first
    // body lines run before `current = head`).
    const bk = k >= 0 && k < cur.buckets.length ? cur.buckets[k] : null;
    if (!newBucket && bk && bk.nodes.length && !cn) newBucket = true;   // first bucket: no `current` yet
    if (!newBucket && bk && bk.nodes.length && cn && step.locals[cn] === null) {
      const hn = pick(step.locals, SCAN_HEAD_NAMES);
      const headRef = hn ? roots[hn] : null;
      const ids = new Set(bk.nodes.map((n) => n.oid));
      let visited = false;
      for (let s = i - 1; s >= scope.start; s--) {
        const st = facts.steps[s];
        if (topId(st) !== scope.id) continue;
        const r2 = (st.mem && st.mem.roots) || {};
        if (!isRef(headRef) || !isRef(r2[hn]) || r2[hn].ref !== headRef.ref) break;
        if (isRef(r2[cn]) && ids.has(String(r2[cn].ref))) { visited = true; break; }
      }
      if (!visited) newBucket = true;
    }
    if (newBucket) fig.tags = fig.tags.filter((t) => !t.target.startsWith('nil'));
    if (!finished && k >= 0 && k < cur.buckets.length) {
      fig.scanBucket = k;
      if (cn && step.locals[cn] === null && !newBucket) {
        fig.nilBucket = k;
        if (!fig.tags.some((t) => t.target === `nil${k}`)) fig.tags.push({ name: `${cn} = None`, target: `nil${k}` });
      }
    }
    const resName = pick(step.locals, RESULT_NAMES);
    out.scanInfo = { newBucket, bucket: finished ? null : k, result: finished ? scope.ret : resName ? step.locals[resName] : undefined, finished };
  }

  // Result badge once the operation is over; errors as soon as they raise.
  if (!out.live && scope.hasRet && scope.kind !== 'insert' && scope.kind !== 'delete') {
    const arg = scope.key !== undefined ? py(scope.key, 16) : '';
    const val = typeof scope.ret === 'number' && !Number.isInteger(scope.ret) ? String(Math.round(scope.ret * 100) / 100) : py(scope.ret, 60);
    out.badge = { kind: 'good', text: `${scope.fn}(${arg}) → ${val}` };
  }
  if (scope.exc && !scope.hasRet && (i >= scope.excAt || !out.live)) {
    out.badge = { kind: 'err', text: `${scope.fn}(${py(scope.key, 16)}) raised ${scope.exc}` };
  }
  out.caption = caption(facts, i, out, fig);
  return out;
}

// Slot-head and next-link changes since the previous step: a link that now
// skips the node it used to point at is a bypass (amber), any other change
// is a new link (green).
function diffLinks(fig, prev, cur) {
  const nextIn = (t) => {
    const m = new Map();
    for (const b of t.buckets) for (const n of b.nodes) m.set(n.oid, n.next);
    return m;
  };
  const pn = nextIn(prev);
  cur.buckets.forEach((b, k) => {
    const p = prev.buckets[k];
    if (!p) return;
    if (p.head !== b.head) {
      if (b.head === null) fig.flashSlot.set(k, 'hc-cleared');
      else fig.links.set(`s${k}`, p.head !== null && pn.get(p.head) === b.head ? 'bypass' : 'new');
    }
    for (const n of b.nodes) {
      if (!pn.has(n.oid)) continue;
      const before = pn.get(n.oid);
      if (before === n.next) continue;
      fig.links.set(`n${n.oid}`, before !== null && pn.get(before) === n.next ? 'bypass' : 'new');
    }
    for (const n of b.nodes) {
      const q = p.nodes.find((x) => x.oid === n.oid);
      if (q && !same(q.value, n.value)) fig.flashNode.set(n.oid, 'hc-update');
    }
  });
}

function idleCaption(figures) {
  if (!figures.length) return '<span class="tp-cap-muted">no table yet</span>';
  return figures.filter((f) => f.table).map((f) => {
    const t = f.table;
    return `<span class="tp-cap-muted">${escapeHtml(f.name)}: ${t.count} key${t.count === 1 ? '' : 's'} in ${t.size} buckets · load ${loadTxt(t)}</span>`;
  }).join(' · ');
}

// A node's key inside an expression (melon.next, current → apple): bare.
const nk = (x) => escapeHtml(bare(x, 16));

const loadTxt = (t) => `${t.count}/${t.size} = ${(t.count / t.size).toFixed(2)}`;

// Plain-English narration, most specific first.
function caption(facts, i, out, fig) {
  const cur = fig.table;
  const sc = out.scope;
  const wk = out.walk;
  const size = cur.size;
  const prevT = snap(facts, fig.oid, i - 1);
  if (out.badge && out.badge.kind === 'err') {
    let why = '';
    if (wk && wk.end) {
      why = wk.end.afterNodes === 0
        ? ` — bucket ${wk.home} is empty (None), so ${h(wk.call.key)} was never inserted`
        : ` — walked all ${wk.end.afterNodes} node${wk.end.afterNodes === 1 ? '' : 's'} of bucket ${wk.home}'s chain and reached None`;
    }
    return `<span class="q-cap-err">✗ ${escapeHtml(out.badge.text)}</span>${why}`;
  }
  const hcap = hashCaption(out, i, size);
  if (hcap) return hcap.replace('— the home slot', `— the home <b>bucket</b>`).replace('a slot index', 'a bucket index');

  // Links that changed on this step (insert at the front, unlink on delete).
  for (const [k, kind] of fig.links) {
    if (k[0] === 's') {
      const b = Number(k.slice(1));
      const head = cur.buckets[b].nodes[0];
      if (kind === 'new') {
        const second = cur.buckets[b].nodes[1];
        return `array[${b}] = new node → <b>${nk(head.key)}</b> is now first in bucket ${b}${second ? ` (its next → ${nk(second.key)})` : ''}: <span class="tp-cap-good">insert at the FRONT</span> — no walk to the end`;
      }
      const gone = fig.detached.find((d) => d.role === 'removed');
      return `array[${b}] = ${gone ? `${nk(gone.key)}.next` : 'next node'} → bucket ${b} now starts at <b>${nk(head.key)}</b>${gone ? ` — ${nk(gone.key)} (the first node) is unlinked` : ''}`;
    }
    const n = findNode(cur, k.slice(1));
    if (n && kind === 'bypass') {
      const gone = fig.detached.find((d) => d.role === 'removed');
      return `${nk(n.key)}.next = ${gone ? `${nk(gone.key)}.next` : 'the next node'} → <b>skip over</b> ${gone ? nk(gone.key) : 'the removed node'}${n.next ? `, straight to ${nk(findNode(cur, n.next).key)}` : ' (now the end of the chain)'}`;
    }
  }
  for (const [k, cls] of fig.flashSlot) {
    if (cls === 'hc-cleared') {
      const gone = fig.detached.find((d) => d.role === 'removed');
      return `array[${k}] = None — ${gone ? `${nk(gone.key)} was the only node, so ` : ''}bucket ${k} is <b>empty</b> again`;
    }
  }
  for (const [oid, cls] of fig.flashNode) {
    const n = findNode(cur, oid);
    const was = prevT ? findNode(prevT, oid) : null;
    if (n && cls === 'hc-update') return `<b>update</b>: ${h(n.key)} already lives in bucket ${bucketOfNode(cur, oid)} → value ${was ? `${h(was.value)} → ` : ''}<b>${h(n.value)}</b>, ${escapeHtml(cur.countName || 'count')} stays ${cur.count}`;
  }
  // Count changes.
  if (prevT && cur.countName && prevT.count !== cur.count) {
    const lf = cur.count / size;
    return `${escapeHtml(cur.countName)} ${prevT.count} → <b>${cur.count}</b> · load ${loadTxt(cur)}${lf > 1 ? ' <span class="tp-cap-muted">— more keys than buckets is fine: chains just grow</span>' : ''}`;
  }
  // A new node being built (Node.__init__ on top).
  const nw = fig.detached.find((d) => d.role === 'new');
  if (nw) {
    const head = cur.buckets[nw.bucket] && cur.buckets[nw.bucket].nodes[0];
    return `new Node(${nw.hasKey ? h(nw.key) : '…'}, ${nw.hasValue ? h(nw.value) : '…'})${nw.hasNext ? ` — its next ${head ? `→ ${nk(head.key)}, the current first node` : '= None (the bucket is empty)'}` : ''}`;
  }
  // An unlinked node: nothing in the table points at it any more.
  const gone = fig.detached.find((d) => d.role === 'removed');
  if (gone && out.live) return `${nk(gone.key)} is unlinked — no node or slot points at it, so it is gone once ${escapeHtml(sc.fn)} returns`;
  // The walk.
  if (wk && wk.live && wk.home !== null) {
    const L = wk.len;
    const last = wk.visited[wk.visited.length - 1];
    const firstStep = wk.hash && i === wk.hash.end + 1;
    if (firstStep) return `hash(${h(wk.call.key)}) = <b>${wk.home}</b> → go to bucket ${wk.home}${L ? ` (chain of ${L})` : ' (empty)'}`;
    if (wk.end) {
      if (wk.end.afterNodes === 0) {
        return wk.call.kind === 'insert'
          ? `array[${wk.home}] is None → empty bucket: ${h(wk.call.key)} is a <b>new key</b>`
          : `array[${wk.home}] is None → bucket ${wk.home} is <b>empty</b>: ${h(wk.call.key)} is not here`;
      }
      return wk.call.kind === 'insert'
        ? `current is None → end of the chain: ${h(wk.call.key)} is a <b>new key</b>`
        : `current is None → <b>end of the chain</b> after ${wk.end.afterNodes} node${wk.end.afterNodes === 1 ? '' : 's'}: ${h(wk.call.key)} is not here`;
    }
    if (last) {
      const n = `<span class="tp-cap-muted">(node ${wk.visited.length} of ${L || wk.visited.length})</span>`;
      if (last.kind === 'match') {
        const verb = wk.call.kind === 'delete' ? 'unlink it' : wk.call.kind === 'insert' ? 'update its value' : 'return its value';
        return `current → <b>${nk(last.key)}</b> = ${h(wk.call.key)} → <span class="tp-cap-good">found</span>, ${verb} ${n}`;
      }
      return `current → <b>${nk(last.key)}</b> ≠ ${h(wk.call.key)} → <span class="hc-cap-pass">follow next</span> ${n}`;
    }
  }
  // Scans.
  if (out.scanInfo && !out.scanInfo.finished && out.scanInfo.bucket !== null && out.scanInfo.bucket >= 0) {
    const k = out.scanInfo.bucket;
    const b = cur.buckets[k];
    const cn = pick(facts.steps[i].locals, CUR_NAMES);
    const r = cn && facts.steps[i].mem && facts.steps[i].mem.roots[cn];
    const at = isRef(r) ? findNode(cur, String(r.ref)) : null;
    if (!b || !b.nodes.length) return `${escapeHtml(sc.fn)}: bucket ${k} is empty — skip`;
    if (out.scanInfo.newBucket) return `${escapeHtml(sc.fn)}: bucket ${k} → head is <b>${nk(b.nodes[0].key)}</b>, walk its chain of ${b.nodes.length}`;
    if (at) return `${escapeHtml(sc.fn)}: bucket ${k} · current → <b>${nk(at.key)}</b> (node ${b.nodes.findIndex((x) => x.oid === at.oid) + 1} of ${b.nodes.length})`;
    return `${escapeHtml(sc.fn)}: bucket ${k} — end of its chain`;
  }
  if (out.badge) return `<span class="tp-cap-good">${escapeHtml(out.badge.text)}</span>`;
  if (out.live) {
    const args = Object.entries(sc.args).filter(([k]) => k !== 'self').map(([k, v]) => `${escapeHtml(k)}=${h(v, 16)}`).join(', ');
    return `<span class="tp-cap-muted">running ${escapeHtml(sc.fn)}(${args})</span>`;
  }
  if (sc.kind === 'insert' && sc.hasRet) {
    const b = cur.buckets.findIndex((x) => x.nodes.some((n) => same(n.key, sc.key)));
    return `<span class="tp-cap-good">${escapeHtml(sc.fn)}(${h(sc.key, 16)}) done</span>${b >= 0 ? ` — ${h(sc.key)} is in bucket ${b}` : ''}`;
  }
  if (sc.kind === 'delete' && sc.hasRet) return `<span class="tp-cap-good">${escapeHtml(sc.fn)}(${h(sc.key, 16)}) done</span> — ${cur.count} keys, load ${loadTxt(cur)}`;
  return idleCaption(out.figures);
}

function findNode(t, oid) {
  for (const b of t.buckets) for (const n of b.nodes) if (n.oid === oid) return n;
  return null;
}
