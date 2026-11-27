/* ═══════════════ Hash table shared trace kit (2026-11-28 chaining design, Q3) ═══════════════
   Pure helpers both hash-table visualisers use: the call / scope bookkeeping
   (one pass over the trace), the hash strip and its caption, and Python
   spelling of tracer values. Linear probing (hashtableFacts.js) and separate
   chaining (chainingFacts.js) pass their own table detector to analyseTables.
   shortcut: method and local NAMES below; upgrade to structural detection
   if learners' code uses other names. */

import { escapeHtml } from '../utils.js';

export const ARRAY_NAMES = ['array', 'table', 'slots', 'buckets', 'data'];
export const COUNT_NAMES = ['count', 'size', 'length', 'n'];
export const OP_NAMES = {
  insert: ['__setitem__', 'insert', 'put'],
  lookup: ['__getitem__', 'get', 'search'],
  delete: ['__delitem__', 'delete', 'remove'],
  contains: ['__contains__', 'contains'],
  rehash: ['rehash', '_rehash', 'resize'],
  scan: ['get_all_keys', 'keys', 'get_all_values', 'values', '__str__'],
  len: ['__len__'],
  empty: ['is_empty'],
  load: ['load_factor'],
  hash: ['hash', '_hash'],
  probe: ['linear_probe', '_linear_probe', 'probe', '_probe'],
};
export const HASH_VALUE_NAMES = ['value', 'h', 'hash_value', 'total'];
export const HASH_CHAR_NAMES = ['char', 'c', 'ch'];
export const HASH_MUL_NAMES = ['a'];
export const SCAN_INDEX_NAMES = ['index', 'x', 'i', 'position', 'idx'];
export const SCAN_ITEM_NAMES = ['item', 'entry', 'slot', 'pair'];
export const RESULT_NAMES = ['result', 'res', 'lines', 'out'];

export const isRef = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && 'ref' in x;
export const attrsOf = (node) => new Map((node && node.items || []).filter(Array.isArray));
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const pick = (obj, names) => names.find((n) => obj && Object.prototype.hasOwnProperty.call(obj, n));

export function kindOf(fn) {
  for (const [kind, names] of Object.entries(OP_NAMES)) if (names.includes(fn)) return kind;
  return null;
}

// Python spelling of a tracer JSON value (captions, badges).
export function py(x, cap = 40) {
  let s;
  if (x === null || x === undefined) s = 'None';
  else if (typeof x === 'boolean') s = x ? 'True' : 'False';
  else if (typeof x === 'string') s = `'${x.replace(/\n/g, '\\n')}'`;
  else if (Array.isArray(x)) {
    const tuple = x[0] === '(tuple)';
    const items = (tuple ? x.slice(1) : x).map((v) => py(v, cap));
    s = tuple ? `(${items.join(', ')}${items.length === 1 ? ',' : ''})` : `[${items.join(', ')}]`;
  } else if (typeof x === 'object') s = JSON.stringify(x);
  else s = String(x);
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}
// Inside a slot: strings bare (`fig: 1`), everything else in Python spelling.
export const bare = (x, cap = 10) => (typeof x === 'string' ? (x.length > cap ? x.slice(0, cap) + '…' : x) : py(x, cap));
export const h = (x, cap) => escapeHtml(py(x, cap));

// One pass over the trace: the tables (first-appearance order), every call
// on a table (with its nearest operation ancestor), returns and exceptions.
export function analyseTables(steps, tableAt) {
  const tables = [];
  const tableIds = new Set();
  const calls = new Map();
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const mem = st.mem;
    if (mem && mem.nodes) {
      for (const [id, node] of Object.entries(mem.nodes)) {
        if (node.t !== 'inst' || tableIds.has(id)) continue;
        if (tableAt(st, id)) { tableIds.add(id); tables.push({ oid: id, first: i, name: null }); }
      }
    }
    const stack = st.stack || [];
    stack.forEach((e, k) => {
      let c = calls.get(e.id);
      if (!c) {
        const parent = k > 0 ? calls.get(stack[k - 1].id) : null;
        c = {
          id: e.id, fn: e.fn, args: e.args || {}, oid: e.oid != null ? String(e.oid) : null,
          kind: kindOf(e.fn), start: i, end: i, parent: parent ? parent.id : null,
        };
        calls.set(e.id, c);
      }
      c.end = i;
    });
    for (const r of st.ret || []) { const c = calls.get(r.id); if (c) { c.ret = r.value; c.hasRet = true; c.retAt = i; } }
    for (const x of st.exc || []) { const c = calls.get(x.id); if (c) { c.exc = x.exc; c.excAt = i; } }
  }
  // Keep only calls on a table; link each to its nearest operation ancestor.
  const onTable = [...calls.values()].filter((c) => c.oid !== null && tableIds.has(c.oid) && c.kind);
  const byId = new Map(onTable.map((c) => [c.id, c]));
  for (const c of onTable) {
    let p = c.parent;
    c.op = null;
    c.ancestors = new Set();
    while (p !== null && p !== undefined) {
      const pc = calls.get(p);
      if (!pc) break;
      c.ancestors.add(pc.id);
      if (c.op === null && byId.has(pc.id) && pc.kind !== 'hash' && pc.kind !== 'probe') c.op = pc.id;
      p = pc.parent;
    }
    c.key = firstArg(c.args);
  }
  // Scopes: operations, plus hash / probe calls made straight from user code.
  const scopes = onTable.filter((c) => (c.kind !== 'hash' && c.kind !== 'probe') || c.op === null)
    .sort((a, b) => a.start - b.start);
  // Variable names: the first non-self root that points at each table.
  for (const t of tables) {
    for (let i = t.first; i < steps.length && !t.name; i++) {
      const roots = (steps[i].mem && steps[i].mem.roots) || {};
      for (const [n, r] of Object.entries(roots)) if (n !== 'self' && isRef(r) && String(r.ref) === t.oid) { t.name = n; break; }
    }
    t.name = t.name || 'table';
  }
  return { steps, tables, calls: byId, scopes, snapCache: new Map(), tableAt };
}

export function firstArg(args) {
  const e = Object.entries(args || {}).find(([k]) => k !== 'self');
  return e ? e[1] : undefined;
}

export const tableFound = (facts) => facts.tables.length > 0;

// The table as of step i (walking back to the last step that recorded it).
export function snap(facts, oid, i) {
  const k = `${oid}@${i}`;
  if (facts.snapCache.has(k)) return facts.snapCache.get(k);
  let out = null;
  for (let s = i; s >= 0; s--) {
    const t = facts.tableAt(facts.steps[s], oid);
    if (t) { out = t; break; }
  }
  facts.snapCache.set(k, out);
  return out;
}

export const topId = (step) => { const st = step.stack || []; return st.length ? st[st.length - 1].id : null; };
export const live = (c, i) => c.start <= i && i <= c.end;
export const inside = (c, scope) => c.id === scope.id || c.ancestors.has(scope.id);

// The operation the step belongs to: the innermost live operation frame on a
// table; else the last one that ended (it lingers until the next starts).
export function scopeAt(facts, i) {
  const step = facts.steps[i];
  const stack = step.stack || [];
  for (let k = stack.length - 1; k >= 0; k--) {
    const c = facts.calls.get(stack[k].id);
    if (c && c.kind !== 'hash' && c.kind !== 'probe') return { scope: c, live: true };
  }
  for (const e of stack) {
    const c = facts.calls.get(e.id);
    if (c) return { scope: c, live: true };
  }
  let last = null;
  for (const c of facts.scopes) {
    if (c.start > i) break;
    if (c.end < i && (!last || c.end > last.end || (c.end === last.end && c.start < last.start))) last = c;
  }
  return last ? { scope: last, live: false } : null;
}

// Loop iteration inside a call: hits on the first body line that sees one
// of `names` (the loop variable), counted up to step i.
export function loopOf(facts, c, i, names) {
  let bodyLine = null, k = -1;
  const rows = [];
  for (let s = c.start; s <= Math.min(i, c.end); s++) {
    const st = facts.steps[s];
    if (topId(st) !== c.id) continue;
    if (bodyLine === null && pick(st.locals, names)) bodyLine = st.line;
    if (bodyLine !== null && st.line === bodyLine) { k++; rows[k] = {}; }
    if (k >= 0) rows[k] = { ...st.locals };
  }
  return { k, rows };
}

export function hashStrip(facts, hc, i) {
  const key = hc.key;
  const done = hc.hasRet && i >= hc.retAt;
  const result = hc.hasRet ? hc.ret : undefined;
  const st = facts.steps[Math.min(i, hc.end)];
  const vName = pick(st.locals, HASH_VALUE_NAMES);
  const cName = pick(st.locals, HASH_CHAR_NAMES);
  const aName = pick(st.locals, HASH_MUL_NAMES);
  const loop = loopOf(facts, hc, i, HASH_CHAR_NAMES);
  const chars = typeof key === 'string' ? [...key] : null;
  const rows = loop.rows.map((r) => ({
    value: vName && r[vName] !== undefined ? r[vName] : null,
    a: aName && r[aName] !== undefined ? r[aName] : null,
  }));
  return {
    key, chars, current: done ? -1 : loop.k, rows, done, result,
    value: !done && vName ? st.locals[vName] : null,
    a: !done && aName ? st.locals[aName] : null,
    detailed: !!(chars && (vName || loop.k >= 0) && cName !== undefined),
    live: !done && live(hc, i),
    end: hc.end,
    lastValue: vName && loop.k >= 0 ? st.locals[vName] : null,
  };
}

// Caption while the hash strip runs (null when it is not running).
export function hashCaption(out, i, size) {
if (out.hash && out.hash.live) {
  const hs = out.hash;
  if (i === hs.end && hs.lastValue !== null && hs.lastValue !== undefined) {
    return `hash(${h(hs.key)}) returns <b>${h(hs.lastValue)}</b> — the home slot`;
  }
  if (hs.chars && hs.current >= 0) {
    return `hash(${h(hs.key)}): character <b>${h(hs.chars[hs.current] ?? '')}</b> (${hs.current + 1} of ${hs.chars.length})${hs.value !== null && hs.value !== undefined ? ` · value = <b>${h(hs.value)}</b>` : ''}`;
  }
  return `hash(${h(hs.key)}): turning the key into a slot index 0 … ${size - 1}`;
}
  return null;
}

// ── View helpers (DOM only when called) ──

// A copy of `text` flies from one cell to another (lifted key → new slot,
// old table → new table).
export function fly(v, fromEl, toEl, text, ms) {
  if (!ms || !fromEl || !toEl || typeof Element.prototype.animate !== 'function') return;
  const base = v.body.getBoundingClientRect();
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const ghost = document.createElement('div');
  ghost.className = 'tp-fly ht-fly';
  ghost.textContent = text;
  ghost.style.left = `${a.left - base.left + v.body.scrollLeft}px`;
  ghost.style.top = `${a.top - base.top + v.body.scrollTop}px`;
  ghost.style.width = `${a.width}px`;
  ghost.style.height = `${a.height}px`;
  v.body.appendChild(ghost);
  toEl.classList.add('tp-landing');
  const dx = b.left - a.left, dy = b.top - a.top;
  const anim = ghost.animate([
    { transform: 'translate(0, 0)' },
    { transform: `translate(${dx / 2}px, ${dy / 2 - 26}px)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px)` },
  ], { duration: Math.round(ms * 1.6), easing: 'ease-in-out' });
  const done = () => { ghost.remove(); toEl.classList.remove('tp-landing'); };
  anim.onfinish = done;
  anim.oncancel = done;
  v.flights.push(anim);
}

export function hashHtml(hs, size, unit = 'slot') {
  if (!hs) return '';
  const title = `hash(${escapeHtml(py(hs.key, 24))})`;
  if (hs.done || !hs.live || !hs.chars) {
    const res = hs.result !== undefined ? hs.result : hs.lastValue;
    return `<span class="ht-hash-title">${title}</span> = <b class="ht-hash-res">${escapeHtml(py(res))}</b> <span class="tp-cap-muted">→ home ${unit}</span>`;
  }
  const chars = hs.chars.slice(0, 24).map((c, k) => {
    const doneRow = k < hs.current ? hs.rows[k] : null;
    const cls = k === hs.current ? 'ht-ch ht-ch-cur' : k < hs.current ? 'ht-ch ht-ch-done' : 'ht-ch';
    const sub = doneRow && doneRow.value !== null ? escapeHtml(py(doneRow.value)) : '&nbsp;';
    return `<span class="${cls}"><span>${escapeHtml(c)}</span><small>${k === hs.current ? 'ord ' + c.charCodeAt(0) : sub}</small></span>`;
  }).join('');
  const vals = [];
  if (hs.value !== null && hs.value !== undefined) vals.push(`value = <b>${escapeHtml(py(hs.value))}</b>`);
  if (hs.a !== null && hs.a !== undefined) vals.push(`a = ${escapeHtml(py(hs.a))}`);
  return `<span class="ht-hash-title">${title}</span><span class="ht-chars">${chars}${hs.chars.length > 24 ? '<span class="ht-ch">…</span>' : ''}</span>
    <span class="ht-hash-vals">${vals.join(' · ')} <span class="tp-cap-muted">(mod ${size})</span></span>`;
}

