/* ═══════════════ Binary Search Tree facts (2026-11-29 BST design) ═══════════════
   Pure trace analysis for panels/bst.js (no DOM). One pass (analyse) finds
   the tree instances, every call on a tree and, for each recursive frame,
   the node its argument points at (read from mem.roots while that frame is
   innermost — identity by object id, so the case-3 key copy cannot fool
   it). frameAt(facts, i) then builds the view model of one step: the tree,
   the ghost slot, path / marks / tags, return and copy flights, the call
   stack, counters and the caption.
   shortcut: attribute, method and local NAMES below; upgrade to structural
   detection if learners' code uses other names. */

import { isRef, attrsOf, same, pick, py, h, analyseTables, snap, topId, inside } from './hashShared.js';

export { py };

export const ROOT_NAMES = ['root', '_root'];
export const LEFT_NAMES = ['left', '_left'];
export const RIGHT_NAMES = ['right', '_right'];
export const KEY_NAMES = ['key', 'k', 'val', 'value', 'data'];
export const ITEM_NAMES = ['item', 'value', 'data', 'val'];
export const SIZE_NAMES = ['length', 'size', 'count', 'n', '_length', '_size'];
export const KEY_ARG_NAMES = ['key', 'k', 'target'];
export const CUR_NAMES = ['current', 'node', 'cur', 'curr', 'subtree', 'root', 'n', 't'];
export const RESULT_NAMES = ['result', 'res', 'out', 'keys', 'items'];
const KINDS = {
  insert: ['insert', 'insert_aux', '_insert', '_insert_aux', '__setitem__', 'put', 'add'],
  search: ['search', 'search_aux', '_search', '_search_aux', '__getitem__', 'get', 'find', 'get_tree_node_by_key', 'get_tree_node_by_key_aux'],
  contains: ['__contains__', 'contains'],
  delete: ['delete', 'delete_aux', '_delete', '_delete_aux', '__delitem__', 'remove'],
  min: ['get_minimal', 'get_min', 'find_min', 'minimum', 'min_node', '_min'],
  max: ['get_maximal', 'get_max', 'find_max', 'maximum', 'max_node', '_max'],
  succ: ['get_successor', 'successor', '_successor'],
  height: ['height', 'height_aux', '_height', 'get_height'],
  inorder: ['in_order', 'in_order_aux', 'inorder', 'inorder_aux', '_in_order', 'traverse_in_order'],
  leaf: ['is_leaf'],
  init: ['__init__'],
  len: ['__len__'],
  empty: ['is_empty'],
};

// Every method on a tree is tracked; unknown names get kind 'other'.
export function bstKind(fn) {
  for (const [kind, names] of Object.entries(KINDS)) if (names.includes(fn)) return kind === 'init' ? null : kind;
  return 'other';
}

function nodeShape(node) {
  if (!node || node.t !== 'inst') return null;
  const a = attrsOf(node);
  const left = LEFT_NAMES.find((n) => a.has(n));
  const right = RIGHT_NAMES.find((n) => a.has(n));
  if (!left || !right) return null;
  const key = KEY_NAMES.find((n) => a.has(n));
  const item = ITEM_NAMES.find((n) => a.has(n) && n !== key);
  return { cls: node.cls, left, right, key, item };
}

function findShape(steps) {
  for (const st of steps) {
    const nodes = st.mem && st.mem.nodes;
    if (!nodes) continue;
    for (const nd of Object.values(nodes)) { const s = nodeShape(nd); if (s && s.key) return s; }
  }
  return null;
}

// The tree instance `oid` at this step, or null when it is not a tree.
// nodes: oid → { oid, key, item, left, right } reachable from root;
// loose: node-class instances held by locals but not in the tree.
export function treeAt(step, oid, shape) {
  const nodes = step.mem && step.mem.nodes;
  const t = nodes && nodes[oid];
  if (!t || t.t !== 'inst') return null;
  const a = attrsOf(t);
  const rootName = ROOT_NAMES.find((n) => a.has(n));
  if (!rootName) return null;
  const r = a.get(rootName);
  if (r !== null && !isRef(r)) return null;
  if (isRef(r) && !nodeShape(nodes[String(r.ref)])) return null;
  if (nodeShape(t)) return null;   // a node that happens to have `root`
  const map = new Map();
  let cut = false;
  const walk = (ref) => {
    if (!isRef(ref)) { if (ref && typeof ref === 'object' && 'more' in ref) cut = true; return null; }
    const id = String(ref.ref);
    if (map.has(id)) return id;
    const nd = nodes[id];
    const sh = nodeShape(nd);
    if (!sh) return null;
    const na = attrsOf(nd);
    const rec = { oid: id, key: na.get(sh.key), item: sh.item ? na.get(sh.item) : undefined, hasItem: !!sh.item, left: null, right: null };
    map.set(id, rec);
    rec.left = walk(na.get(sh.left));
    rec.right = walk(na.get(sh.right));
    return id;
  };
  const root = walk(r);
  const loose = new Map();
  for (const [id, nd] of Object.entries(nodes)) {
    if (map.has(id) || nd.t !== 'inst' || id === String(oid)) continue;
    if (!(shape && nd.cls === shape.cls) && !nodeShape(nd)) continue;
    const na = attrsOf(nd);
    const kn = shape && na.has(shape.key) ? shape.key : KEY_NAMES.find((n) => na.has(n));
    const inn = shape && shape.item && na.has(shape.item) ? shape.item : ITEM_NAMES.find((n) => na.has(n) && n !== kn);
    loose.set(id, { oid: id, key: kn ? na.get(kn) : undefined, hasKey: !!kn, item: inn ? na.get(inn) : undefined, hasItem: !!inn, left: null, right: null });
  }
  const sizeName = SIZE_NAMES.find((n) => a.has(n) && typeof a.get(n) === 'number');
  return {
    oid: String(oid), cls: t.cls, rootName, root, nodes: map, loose, cut,
    size: sizeName ? a.get(sizeName) : map.size, sizeName: sizeName || 'size',
  };
}

export function treeHeight(t, oid = t.root, seen = new Set()) {
  if (!oid || seen.has(oid) || !t.nodes.has(oid)) return 0;
  seen.add(oid);
  const n = t.nodes.get(oid);
  return 1 + Math.max(treeHeight(t, n.left, seen), treeHeight(t, n.right, seen));
}

// Key of a node from the tracer's text form ("BSTNode instance { key: 35, … }").
export function parseKey(text, keyName) {
  if (typeof text !== 'string' || !keyName) return undefined;
  const m = text.match(new RegExp(`^\\w+ instance \\{ (?:.*?, )?${keyName}: ("(?:[^"\\\\]|\\\\.)*"|[^,}\\s]+)`));
  if (!m) return undefined;
  const v = m[1];
  if (v[0] === '"') { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
  if (v === 'None') return null;
  if (v === 'True' || v === 'False') return v === 'True';
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

// The argument that holds a node (current / node / …), or null.
function nodeArg(st, c, shape) {
  const names = Object.keys(c.args).filter((k) => k !== 'self');
  const roots = (st.mem && st.mem.roots) || {};
  const isNode = (k) => {
    const r = roots[k];
    if (!isRef(r)) return false;
    const nd = st.mem.nodes[String(r.ref)];
    return !!nd && nd.t === 'inst' && ((shape && nd.cls === shape.cls) || !!nodeShape(nd));
  };
  return names.find((k) => CUR_NAMES.includes(k) && (st.locals[k] === null || isNode(k))) || names.find(isNode) || null;
}

export function analyse(steps) {
  const shape = findShape(steps);
  const F = analyseTables(steps, (st, oid) => treeAt(st, oid, shape), bstKind);
  F.shape = shape;
  F.keyName = shape ? shape.key : 'key';
  for (const c of F.calls.values()) { c.nodeName = undefined; c.track = []; }
  // Each frame's node over time (only while it is the innermost frame).
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const c = F.calls.get(topId(st));
    if (!c) continue;
    if (c.nodeName === undefined) c.nodeName = nodeArg(st, c, shape);
    if (!c.nodeName) continue;
    const v = st.locals ? st.locals[c.nodeName] : undefined;
    const r = st.mem && st.mem.roots ? st.mem.roots[c.nodeName] : undefined;
    const oid = v === null ? null : isRef(r) ? String(r.ref) : undefined;
    if (oid === undefined) continue;
    const last = c.track[c.track.length - 1];
    if (!last || last[1] !== oid) c.track.push([i, oid]);
  }
  F.recursive = new Set();
  F.kids = new Map();
  for (const c of F.calls.values()) {
    const p = F.calls.get(c.parent);
    if (p && p.fn === c.fn) F.recursive.add(c.fn);
    if (p) { if (!F.kids.has(p.id)) F.kids.set(p.id, []); F.kids.get(p.id).push(c); }
  }
  for (const list of F.kids.values()) list.sort((a, b) => a.start - b.start);
  for (const c of F.calls.values()) {
    c.startNode = c.track.length ? c.track[0][1] : undefined;
    const t = c.startNode ? snap(F, c.oid, c.start) : null;
    const n = t ? (t.nodes.get(c.startNode) || t.loose.get(c.startNode)) : null;
    c.startKey = n ? n.key : undefined;
    c.keyArg = pick(c.args, KEY_ARG_NAMES);
    c.walker = !!c.nodeName && F.recursive.has(c.fn);
  }
  // Delete case of the frame that found its key (children at that moment).
  for (const c of F.calls.values()) {
    if (c.kind !== 'delete' || !c.walker || !c.keyArg || !same(c.args[c.keyArg], c.startKey)) continue;
    const t = snap(F, c.oid, c.start);
    const n = t && t.nodes.get(c.startNode);
    if (n) c.delCase = n.left && n.right ? 3 : n.left || n.right ? 2 : 1;
  }
  return F;
}

export const treeFound = (F) => F.tables.length > 0;

export function nodeOf(c, i) {
  let v;
  for (const [s, o] of c.track) { if (s > i) break; v = o; }
  return v;
}

const stackCalls = (F, i) => (F.steps[i].stack || []).map((e) => F.calls.get(e.id)).filter(Boolean);
const parentCall = (F, c) => { const p = F.calls.get(c.parent); return p && p.nodeName ? p : null; };
const keyOf = (t, oid) => { const n = oid && (t.nodes.get(oid) || t.loose.get(oid)); return n ? n.key : undefined; };
const kk = (x) => h(x, 14);   // a key inside a caption

// Which child of the parent frame's node this call is on.
function sideOf(F, c) {
  if (c.side !== undefined) return c.side;
  let side = null;
  const p = parentCall(F, c);
  if (p) {
    const t = snap(F, c.oid, c.start);
    const pr = t && t.nodes.get(nodeOf(p, c.start));
    if (pr && c.startNode) side = pr.left === c.startNode ? 'left' : pr.right === c.startNode ? 'right' : null;
    if (!side && pr) {
      const k = c.keyArg ? c.args[c.keyArg] : undefined;
      if (k !== undefined && pr.key !== undefined && typeof k === typeof pr.key) side = k < pr.key ? 'left' : 'right';
      else if (c.kind === 'min') side = 'left';
      else if (c.kind === 'max') side = 'right';
      else side = (F.kids.get(p.id) || []).filter((x) => x.fn === c.fn).indexOf(c) === 0 ? 'left' : 'right';
    }
  }
  c.side = side;
  return side;
}

// A returned value as a node oid (null = None, undefined = not a node).
function retNode(F, c, i, t, value) {
  if (value === null) return null;
  const k = parseKey(value, F.keyName);
  if (k === undefined) return undefined;
  const own = nodeOf(c, i);
  const on = own && t.nodes.get(own);
  for (const o of [own, on && on.left, on && on.right]) if (o && same(keyOf(t, o), k)) return o;
  for (const n of t.nodes.values()) if (same(n.key, k)) return n.oid;
  for (const n of t.loose.values()) if (same(n.key, k)) return n.oid;
  return undefined;
}

function argText(F, c, i, t, named) {
  return Object.entries(c.args).filter(([k]) => k !== 'self').slice(0, 3).map(([k, v]) => {
    let s;
    if (k === c.nodeName) { const o = nodeOf(c, i); s = o === null ? 'None' : o !== undefined && keyOf(t, o) !== undefined ? py(keyOf(t, o), 10) : py(parseKey(v, F.keyName) ?? v, 10); }
    else { const pk = parseKey(v, F.keyName); s = pk !== undefined ? py(pk, 10) : py(v, 14); }
    return named ? `${k}=${s}` : s;
  });
}

function opLabel(F, op, t, name) {
  const args = argText(F, op, op.start, t, false);
  if (op.kind === 'contains') return `${args[0]} in ${name}`;
  if (op.kind === 'len') return `len(${name})`;
  return `${name}.${op.fn}(${args.join(', ')})`;
}

// The operation of step i: the outermost live call on a tree, else the last
// one that finished (it lingers until the next starts).
function opAt(F, i) {
  for (const c of stackCalls(F, i)) if (!F.calls.get(c.parent)) return { op: c, live: true };
  let last = null;
  for (const c of F.calls.values()) {
    if (F.calls.get(c.parent) || c.start > i) continue;
    if (!last || c.start > last.start) last = c;
  }
  return last ? { op: last, live: false } : null;
}

// Node the finished operation points at (green ring while it lingers).
function opTarget(F, op, t, i) {
  const calls = [...F.calls.values()].filter((c) => inside(c, op) && c.start <= i);
  if (op.exc && op.kind === 'insert') {
    const d = calls.filter((c) => c.walker && c.keyArg && same(c.args[c.keyArg], c.startKey)).pop();
    return d ? { oid: d.startNode, mark: 'dup' } : null;
  }
  if (op.exc || op.kind === 'delete' || op.kind === 'height' || op.kind === 'inorder') return null;
  if (op.kind === 'insert') {
    const c = calls.filter((x) => x.walker && x.startNode === null).pop();
    const o = c ? nodeOf(c, c.end) : null;
    return o ? { oid: o, mark: 'found' } : null;
  }
  const rn = op.hasRet ? retNode(F, op, i, t, op.ret) : undefined;
  if (rn) return { oid: rn, mark: 'found' };
  const d = calls.filter((c) => c.walker && c.keyArg && same(c.args[c.keyArg], c.startKey)).pop();
  return d && t.nodes.has(d.startNode) ? { oid: d.startNode, mark: 'found' } : null;
}

function resultList(F, st) {
  const roots = (st.mem && st.mem.roots) || {};
  const name = pick(roots, RESULT_NAMES);
  const r = name && roots[name];
  const nd = isRef(r) && st.mem.nodes[String(r.ref)];
  return nd && nd.t === 'list' ? { name, items: nd.items.filter((x) => !isRef(x)) } : null;
}

export function frameAt(F, i) {
  const st = F.steps[i];
  const at = opAt(F, i);
  const op = at ? at.op : null;
  const treeMeta = (op && F.tables.find((x) => x.oid === op.oid)) || F.tables.find((x) => x.first <= i) || null;
  const out = {
    tree: null, name: treeMeta ? treeMeta.name : 'bst', slot: null, marks: new Map(), tags: [],
    heights: new Map(), visits: new Map(), edges: new Map(), flights: [], flashes: new Map(),
    stack: [], op: null, caption: '', badge: null, caseBadge: null, counters: null, result: null,
  };
  if (!treeMeta || treeMeta.first > i) {
    out.caption = 'No tree yet.';
    return out;
  }
  const t = snap(F, treeMeta.oid, i);
  out.tree = t;
  if (!t) return out;
  const prev = i > 0 ? snap(F, treeMeta.oid, i - 1) : null;
  const liveOp = at && at.live && op.oid === t.oid ? op : null;
  const frames = stackCalls(F, i).filter((c) => c.oid === t.oid);
  const rets = new Map((st.ret || []).map((r) => [r.id, r.value]));

  // Ghost slot: a recursive frame whose node argument started as None.
  const gc = [...frames].reverse().find((c) => c.walker && c.startNode === null);
  if (gc) {
    const p = parentCall(F, gc);
    const parent = p ? nodeOf(p, i) : null;
    const o = nodeOf(gc, i);
    if ((parent && t.nodes.has(parent)) || (!p && !t.root)) {
      out.slot = { parent: parent || null, side: sideOf(F, gc) || 'left', oid: o && t.loose.has(o) ? o : null, state: o ? 'new' : 'ghost' };
    }
  } else if (at && !at.live && op.exc && op.oid === t.oid) {
    const miss = [...F.calls.values()].filter((c) => inside(c, op) && c.walker && c.startNode === null).pop();
    const p = miss && parentCall(F, miss);
    const parent = p ? nodeOf(p, miss.start) : null;
    if (miss && parent && t.nodes.has(parent)) out.slot = { parent, side: sideOf(F, miss) || 'left', oid: null, state: 'miss' };
  }

  // Path: one node per live frame; the innermost is active.
  const nf = frames.filter((c) => c.nodeName).map((c) => ({ c, oid: nodeOf(c, i) })).filter((x) => x.oid && t.nodes.has(x.oid));
  for (const x of nf) out.marks.set(x.oid, 'path');
  for (let k = 1; k < nf.length; k++) {
    const a = t.nodes.get(nf[k - 1].oid);
    if (a.left === nf[k].oid || a.right === nf[k].oid) out.edges.set(`n${nf[k].oid}`, 'path');
  }
  if (out.slot && out.slot.state !== 'miss' && out.slot.parent && nf.some((x) => x.oid === out.slot.parent)) out.edges.set('slot', 'path');
  const inner = nf.length ? nf[nf.length - 1] : null;
  if (inner) out.marks.set(inner.oid, 'active');

  // Found / duplicate on the innermost key-comparing frame.
  const kf = [...frames].reverse().find((c) => c.walker && c.keyArg);
  if (kf && kf.startNode && same(kf.args[kf.keyArg], kf.startKey) && t.nodes.has(kf.startNode)) {
    out.marks.set(kf.startNode, kf.kind === 'insert' ? 'dup' : 'found');
  }
  // Min / max / successor answer at its return.
  for (const [id, val] of rets) {
    const c = F.calls.get(id);
    if (!c || !['min', 'max', 'succ'].includes(c.kind)) continue;
    const pc = F.calls.get(c.parent);
    if (pc && pc.fn === c.fn) continue;
    const o = retNode(F, c, i, t, val);
    if (o && t.nodes.has(o)) out.marks.set(o, 'found');
  }
  if (at && !at.live && op.oid === t.oid) {
    const tg = opTarget(F, op, t, i);
    if (tg && t.nodes.has(tg.oid)) out.marks.set(tg.oid, tg.mark);
  }

  // Traversals: finished nodes, heights, visit numbers.
  if (op && op.oid === t.oid && (op.kind === 'height' || op.kind === 'inorder')) {
    for (const c of F.calls.values()) {
      if (!inside(c, op) || !c.walker || !c.startNode || !c.hasRet || c.retAt > i) continue;
      if (!out.marks.has(c.startNode) && t.nodes.has(c.startNode)) out.marks.set(c.startNode, 'done');
      if (c.kind === 'height' && typeof c.ret === 'number') out.heights.set(c.startNode, c.ret);
    }
    if (op.kind === 'inorder') {
      const rl = at.live ? resultList(F, st) : (op.hasRet && Array.isArray(op.ret) ? { name: 'result', items: op.ret } : null);
      if (rl) {
        out.result = rl;
        rl.items.forEach((k, n) => { for (const nd of t.nodes.values()) if (same(nd.key, k)) out.visits.set(nd.oid, n + 1); });
      }
    }
  }

  // Tags: current on the innermost node (or the ghost), other node locals, root.
  if (inner && (!gc || frames.indexOf(gc) < frames.indexOf(inner.c))) out.tags.push({ name: inner.c.nodeName, target: `n${inner.oid}` });
  else if (gc && out.slot) out.tags.push({ name: gc.nodeName, target: out.slot.oid ? `n${out.slot.oid}` : 'ghost' });
  const roots = (st.mem && st.mem.roots) || {};
  for (const [name, r] of Object.entries(roots)) {
    if (!isRef(r) || name === 'self' || out.tags.some((x) => x.name === name)) continue;
    if (frames.length && name === (frames[frames.length - 1].nodeName)) continue;
    const id = String(r.ref);
    if (t.nodes.has(id) && liveOp) out.tags.push({ name, target: `n${id}` });
  }
  if (t.root) out.tags.unshift({ name: t.rootName, target: `n${t.root}`, role: 'root' });

  // Links that changed this step; the case-3 key copy.
  if (prev) {
    for (const n of t.nodes.values()) {
      const p = prev.nodes.get(n.oid);
      if (!p) continue;
      for (const side of ['left', 'right']) if (n[side] && p[side] !== n[side]) out.edges.set(`n${n[side]}`, 'new');
      if (!same(p.key, n.key)) {
        const src = [...t.nodes.values()].find((x) => x.oid !== n.oid && same(x.key, n.key));
        if (src) out.flights.push({ from: `n${src.oid}`, to: `n${n.oid}`, text: py(n.key, 10), kind: 'copy' });
        out.flashes.set(`n${n.oid}`, 'bst-copied');
      }
    }
    if (t.root && prev.root !== t.root && prev.nodes.size) out.flashes.set(`n${t.root}`, 'bst-newroot');
  }

  // Return chips travel up to the caller's node.
  for (const [id, val] of rets) {
    const c = F.calls.get(id);
    if (!c || !c.nodeName) continue;
    const p = parentCall(F, c);
    const to = p && nodeOf(p, i);
    if (!to || !t.nodes.has(to)) continue;
    const own = nodeOf(c, i);
    const from = own && (t.nodes.has(own) || t.loose.has(own)) ? `n${own}` : out.slot ? 'ghost' : null;
    if (!from) continue;
    const rn = retNode(F, c, i, t, val);
    out.flights.push({ from, to: `n${to}`, text: rn ? py(keyOf(t, rn), 10) : rn === null ? 'None' : py(val, 10), kind: 'ret' });
  }

  // Call-stack column (innermost first) and counters.
  out.stack = [...frames].reverse().map((c) => ({
    label: `${c.fn}(${argText(F, c, i, t, true).join(', ')})`,
    active: c === frames[frames.length - 1] && !rets.has(c.id),
    ret: rets.has(c.id) ? (() => { const rn = retNode(F, c, i, t, rets.get(c.id)); return rn ? py(keyOf(t, rn), 10) : py(rets.get(c.id), 16); })() : null,
  }));
  const visited = op && op.oid === t.oid
    ? [...F.calls.values()].filter((c) => inside(c, op) && c.walker && c.startNode && c.start <= i).length : 0;
  out.counters = { size: t.size, sizeName: t.sizeName, height: treeHeight(t), visited };

  if (op && op.oid === t.oid) {
    const label = opLabel(F, op, t, out.name);
    const done = !at.live || (op.hasRet && op.retAt <= i) || (op.exc && op.excAt <= i);
    out.op = { label, live: at.live, done };
    if (op.exc && op.excAt <= i) out.badge = { kind: 'err', text: `${op.exc}` };
    else if (op.hasRet && op.retAt <= i && op.ret !== null) {
      const rn = retNode(F, op, i, t, op.ret);
      out.badge = { kind: 'good', text: `→ ${rn ? `node ${py(keyOf(t, rn), 10)}` : py(op.ret, 40)}` };
    }
    const dc = [...frames].reverse().find((c) => c.delCase);
    if (dc) {
      out.caseBadge = ['', 'case 1 · leaf', 'case 2 · one child', 'case 3 · two children'][dc.delCase];
      const sub = frames.find((c) => c.delCase === 3);
      if (sub && sub !== dc) out.caseBadge = `removing successor ${py(dc.args[dc.keyArg], 10)} · ${out.caseBadge}`;
    }
  }
  out.caption = caption(F, i, t, prev, at, op, frames, rets, out);
  return out;
}

function caption(F, i, t, prev, at, op, frames, rets, out) {
  const st = F.steps[i];
  if (!op || op.oid !== t.oid) {
    return t.root ? `${escHtml(out.name)}: ${t.size} key${t.size === 1 ? '' : 's'}, height ${out.counters.height}` : `${escHtml(out.name)} is empty — root is None`;
  }
  const label = escHtml(out.op.label);
  if (!at.live) {
    if (op.exc) return `${label} raised <b>${escHtml(op.exc)}</b>${missWhy(F, op, t)}`;
    if (op.hasRet && op.ret !== null && op.ret !== undefined) {
      const rn = retNode(F, op, i, t, op.ret);
      return `${label} → <b>${rn ? `node ${kk(keyOf(t, rn))}` : h(op.ret, 60)}</b>`;
    }
    return `${label} done — ${t.size} key${t.size === 1 ? '' : 's'}, height ${out.counters.height}`;
  }
  const c = frames[frames.length - 1];
  if (!c) return label;
  const ret = rets.has(c.id);
  const node = c.nodeName ? nodeOf(c, i) : undefined;
  const nk = node ? keyOf(t, node) : undefined;
  const key = c.keyArg ? c.args[c.keyArg] : undefined;
  const p = parentCall(F, c);
  const pk = p ? keyOf(t, nodeOf(p, i)) : undefined;
  const side = sideOf(F, c);
  const pre = frames.some((x) => x.delCase === 3 && x !== c && inside(c, x) && x.kind === 'delete' && c.kind === 'delete') ? '<span class="tp-cap-muted">removing the successor:</span> ' : '';

  if (ret) {
    const val = rets.get(c.id);
    if (!F.calls.get(c.parent)) {   // the operation itself returns
      if (val === null) return `${label} done — ${t.size} key${t.size === 1 ? '' : 's'}`;
      const rn = retNode(F, c, i, t, val);
      return `${label} returns <b>${rn ? `node ${kk(keyOf(t, rn))}` : h(val, 60)}</b>`;
    }
    if (c.kind === 'height' && c.walker) {
      if (!node) return `empty subtree → height <b>0</b>`;
      const ks = (F.kids.get(c.id) || []).filter((x) => x.fn === c.fn && x.hasRet);
      return `height(${kk(nk)}) = 1 + max(${ks.map((x) => h(x.ret)).join(', ')}) = <b>${h(val)}</b>`;
    }
    if (c.kind === 'inorder' && c.walker) return node ? `subtree at ${kk(nk)} done → back up` : `None → nothing to visit, go back`;
    if (c.kind === 'leaf') return `is_leaf(${kk(nk)}) → <b>${h(val)}</b>`;
    const rn = retNode(F, c, i, t, val);
    const rk = rn ? kk(keyOf(t, rn)) : rn === null ? 'None' : h(val, 30);
    if (c.kind === 'succ') return `successor of ${kk(nk)} is <b>${rk}</b>`;
    if ((c.kind === 'min' || c.kind === 'max') && (!p || p.fn !== c.fn)) return `the ${c.kind === 'min' ? 'smallest' : 'largest'} key here is <b>${rk}</b>`;
    if (p && p.fn === c.fn && side && (c.kind === 'insert' || c.kind === 'delete')) {
      const pn = t.nodes.get(nodeOf(p, i));
      const cur = pn ? pn[side] : undefined;
      const changed = rn !== undefined && cur !== rn;
      return changed
        ? `${pre}returns ${rk} → <b class="bst-cap-change">${kk(pk)}.${side} becomes ${rk}</b>`
        : `${pre}returns ${rk} → <span class="tp-cap-muted">${kk(pk)}.${side} stays ${rk} (no change)</span>`;
    }
    if (p && p.fn === c.fn) return `${pre}returns ${rk} back up to ${kk(pk)}`;
    if (c.walker && (c.kind === 'insert' || c.kind === 'delete')) {
      const changed = rn !== undefined && t.root !== rn;
      return changed ? `returns ${rk} → <b class="bst-cap-change">${escHtml(t.rootName)} becomes ${rk}</b>` : `returns ${rk} → <span class="tp-cap-muted">${escHtml(t.rootName)} stays ${rk} (no change)</span>`;
    }
    if (c.walker && p === null && F.calls.get(c.parent)) return `${escHtml(c.fn)} returns ${rn ? 'node ' : ''}<b>${rk}</b> to ${escHtml(F.calls.get(c.parent).fn)}`;
    return `${escHtml(c.fn)} returns <b>${rk}</b>`;
  }

  if (c.walker && node === null) {
    const where = pk !== undefined ? ` (fell off at ${kk(pk)}.${side})` : '';
    if (c.kind === 'insert') return `${escHtml(c.nodeName)} is None → empty spot: <b>${kk(key)}</b> goes here${pk !== undefined ? `, as ${kk(pk)}.${side}` : ' as the root'}`;
    if (c.kind === 'search' || c.kind === 'delete') return `${pre}${escHtml(c.nodeName)} is None → <b>${kk(key)}</b> is not in the tree${where}`;
    if (c.kind === 'height') return `${escHtml(c.nodeName)} is None → empty subtree`;
    if (c.kind === 'inorder') return `${escHtml(c.nodeName)} is None → nothing here`;
    return `${escHtml(c.nodeName)} is None`;
  }
  if (c.walker && node && t.loose.has(node)) {
    return `new node <b>${kk(nk)}</b> created — return it so ${pk !== undefined ? `${kk(pk)}.${side}` : escHtml(t.rootName)} links to it`;
  }
  if (c.walker && node && ['insert', 'delete', 'search'].includes(c.kind)
    && (F.kids.get(c.id) || []).some((x) => x.fn === c.fn && x.hasRet && x.retAt < i)) {
    return `${pre}back at ${kk(nk)} → return ${kk(nk)} up to ${pk !== undefined ? kk(pk) : 'the caller'}`;
  }
  if (c.walker && node && key !== undefined && c.startKey !== undefined) {
    const sk = c.startKey;
    if (same(key, sk)) {
      if (c.kind === 'insert') return `${kk(key)} == ${kk(sk)} → <b class="bst-cap-err">duplicate key</b>: raise ValueError`;
      if (c.kind === 'delete') {
        const n = t.nodes.get(node);
        if (c.delCase === 1) return `${pre}found ${kk(sk)} → <b>case 1 (leaf)</b>: no children, return None so the parent drops it`;
        if (c.delCase === 2) { const ch = n && (n.left || n.right); return `${pre}found ${kk(sk)} → <b>case 2 (one child)</b>: return its only child ${ch ? kk(keyOf(t, ch)) : ''} — it takes ${kk(sk)}'s place`; }
        if (c.delCase === 3) {
          const roots = (st.mem && st.mem.roots) || {};
          const succ = Object.entries(roots).find(([nm, r]) => nm !== c.nodeName && nm !== 'self' && isRef(r) && t.nodes.has(String(r.ref)) && String(r.ref) !== node);
          if (succ && n && !same(n.key, sk)) return `copied ${kk(n.key)} into this node → now delete the old ${kk(n.key)} from the right subtree`;
          if (succ) return `successor is ${kk(keyOf(t, String(succ[1].ref)))} → copy its key and item into ${kk(sk)}'s node`;
          return `found ${kk(sk)} → <b>case 3 (two children)</b>: find the successor — the smallest key in the right subtree`;
        }
      }
      return `${kk(key)} == ${kk(sk)} → <b>found</b>`;
    }
    if (typeof key === typeof sk || (typeof key === 'number' && typeof sk === 'number')) {
      const n = t.nodes.get(node);
      const go = key < sk ? 'left' : 'right';
      const next = n ? n[go] : null;
      return `${pre}${kk(key)} ${key < sk ? '&lt;' : '&gt;'} ${kk(sk)} → go <b>${go}</b>${next ? ` to ${kk(keyOf(t, next))}` : ' (it is None)'}`;
    }
  }
  if ((c.kind === 'min' || c.kind === 'max') && node) {
    const n = t.nodes.get(node);
    const s = c.kind === 'min' ? 'left' : 'right';
    if (!n) return `${escHtml(c.fn)} at ${kk(nk)}`;
    return n[s] ? `at ${kk(nk)}: ${s} is ${kk(keyOf(t, n[s]))} → keep going ${s}` : `at ${kk(nk)}: ${s} is None → <b>${kk(nk)}</b> is the ${c.kind === 'min' ? 'smallest' : 'largest'} key here`;
  }
  if (c.kind === 'succ' && node) {
    const n = t.nodes.get(node);
    return `successor of ${kk(nk)}: one step right${n && n.right ? ` to ${kk(keyOf(t, n.right))}` : ''}, then all the way left`;
  }
  if (c.kind === 'height' && c.walker && node) {
    const ks = (F.kids.get(c.id) || []).filter((x) => x.fn === c.fn && x.start <= i);
    const doneL = ks[0] && ks[0].hasRet && ks[0].retAt <= i;
    return doneL ? `height at ${kk(nk)}: left height ${h(ks[0].ret)} → now the right subtree` : `height at ${kk(nk)}: first the left subtree`;
  }
  if (c.kind === 'inorder' && c.walker && node) {
    const rl = resultList(F, st);
    const n = rl ? rl.items.findIndex((x) => same(x, nk)) : -1;
    if (n >= 0) {
      const was = i > 0 ? resultList(F, F.steps[i - 1]) : null;
      const just = was && !was.items.some((x) => same(x, nk));
      return just ? `append <b>${kk(nk)}</b> (visit #${n + 1}) → ${escHtml(rl.name)} = ${h(rl.items, 60)}` : `visited ${kk(nk)} → now its <b>right</b> subtree (bigger keys)`;
    }
    const leftDone = (F.kids.get(c.id) || []).some((x) => x.fn === c.fn && x.hasRet && x.retAt < i);
    return leftDone ? `left subtree of ${kk(nk)} done → now add ${kk(nk)} itself` : `in order at ${kk(nk)}: <b>left</b> subtree first (smaller keys) → then ${kk(nk)} → then right`;
  }
  if (c.kind === 'leaf' && node) return `is_leaf(${kk(nk)}): are left and right both None?`;
  if (c.kind === 'len') return `len → ${escHtml(out.name)}.${escHtml(t.sizeName)} = <b>${t.size}</b>`;
  if (c.kind === 'empty') return `is ${escHtml(t.rootName)} None? → <b>${t.root ? 'False' : 'True'}</b>`;
  const back = (F.kids.get(c.id) || []).filter((x) => (x.hasRet && x.retAt < i) || (x.exc && x.excAt <= i)).pop();
  if (back) {
    if (back.exc && !(back.hasRet && back.retAt < i)) return `${label}: ${escHtml(back.fn)} raised ${escHtml(back.exc)} → caught here`;
    if (back.ret === null) return `${label}: ${escHtml(back.fn)} finished${out.result ? ` → ${escHtml(out.result.name)} = ${h(out.result.items, 60)}` : ''}`;
    const rn = retNode(F, back, i, t, back.ret);
    return `${label}: ${escHtml(back.fn)} returned <b>${rn ? `node ${kk(keyOf(t, rn))}` : h(back.ret, 60)}</b>`;
  }
  return t.root ? `${label}: start at the ${escHtml(t.rootName)} ${kk(keyOf(t, t.root))}` : `${label}: the tree is empty`;
}

function missWhy(F, op, t) {
  const miss = [...F.calls.values()].filter((c) => inside(c, op) && c.walker && c.startNode === null).pop();
  if (op.kind === 'insert') {
    const d = [...F.calls.values()].filter((c) => inside(c, op) && c.walker && c.keyArg && same(c.args[c.keyArg], c.startKey)).pop();
    if (d) return ` — ${kk(d.startKey)} is already in the tree`;
  }
  if (!miss) return '';
  const p = parentCall(F, miss);
  const pk = p ? keyOf(t, nodeOf(p, miss.start)) : undefined;
  if (!miss.keyArg) return '';
  return ` — ${kk(miss.args[miss.keyArg])} is not in the tree${pk !== undefined ? ` (fell off at ${kk(pk)}.${sideOf(F, miss)})` : ''}`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
