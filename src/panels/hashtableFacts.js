/* ═══════════════ Hash Table (Linear Probing) facts (2026-11-27 design) ═══════════════
   Pure trace analysis — no DOM, no app state — so tests/hashtable.sim.mjs
   can replay a real runner.py trace through it. panels/hashtable.js draws
   the view model that frameAt() returns.
   Ground truth only: step.mem (the table instance → slot list → (key, value)
   tuples), step.stack (frames with fn / args / oid), the merged step.locals
   (innermost frame wins: `position` while the probe is on top, `value` / `a`
   / `char` while hash is), and step.ret / step.exc.
   shortcut: the table, its methods and their locals are found by NAMES
   (lists below); upgrade to structural detection if learners' code uses
   other names. */

import { escapeHtml } from '../utils.js';
import {
  ARRAY_NAMES, COUNT_NAMES, SCAN_INDEX_NAMES, SCAN_ITEM_NAMES, RESULT_NAMES,
  isRef, attrsOf, same, pick, py, h, analyseTables, snap, topId, live, inside,
  scopeAt, loopOf, hashStrip, hashCaption,
} from './hashShared.js';

export { py, bare, kindOf, tableFound, ARRAY_NAMES, COUNT_NAMES } from './hashShared.js';

const POS_NAMES = ['position', 'pos', 'index', 'idx', 'i'];


// The table held by instance `oid` at one step: its slot list (None or a
// (key, value) 2-tuple per slot) plus the count attribute.
export function tableAt(step, oid) {
  const mem = step && step.mem;
  if (!mem || !mem.nodes) return null;
  const node = mem.nodes[String(oid)];
  if (!node || node.t !== 'inst') return null;
  const a = attrsOf(node);
  for (const name of ARRAY_NAMES) {
    const r = a.get(name);
    if (!isRef(r)) continue;
    const slots = slotsOf(mem, String(r.ref));
    if (!slots) continue;
    const countName = COUNT_NAMES.find((n) => Number.isInteger(a.get(n)));
    const filled = slots.list.filter(Boolean).length;
    return {
      oid: String(oid), cls: node.cls, arrayName: name, arrayRef: String(r.ref),
      slots: slots.list, more: slots.more, size: slots.list.length + slots.more,
      countName: countName || null, count: countName ? a.get(countName) : filled,
    };
  }
  return null;
}

function slotsOf(mem, ref) {
  const list = mem.nodes[ref];
  if (!list || list.t !== 'list') return null;
  const out = [];
  let more = 0;
  for (const it of list.items) {
    if (it === null) out.push(null);
    else if (isRef(it)) {
      const t = mem.nodes[String(it.ref)];
      if (!t || t.t !== 'tuple' || t.items.length !== 2) return null;
      out.push({ key: t.items[0], value: t.items[1] });
    } else if (it && typeof it === 'object' && 'more' in it) more = it.more;
    else return null;
  }
  return { list: out, more };
}





// The probe drawn for this scope: its own latest probe, else one inside a
// nested operation (contains → getitem). Dropped once the array it ran on
// was replaced (a rehash happened since).
function probeFor(facts, scope, i, curArrayRef) {
  let own = null, nested = null;
  for (const c of facts.calls.values()) {
    if (c.kind !== 'probe' || c.start > i || c.oid !== scope.oid) continue;
    if (c.id === scope.id || c.op === scope.id) { if (!own || c.start > own.start) own = c; }
    else if (inside(c, scope) && (!nested || c.start > nested.start)) nested = c;
  }
  const p = own || nested;
  if (!p) return null;
  const t = snap(facts, p.oid, p.start);
  if (!t || t.arrayRef !== curArrayRef) return null;
  return p;
}

// Trail of a probe call up to step i: each distinct position in visit order,
// classified against the slots at the moment it was examined.
function trailOf(facts, p, i) {
  const out = [];
  let last = null;
  // Merged locals: before the probe assigns its own position, an OUTER frame's
  // `position` shows through (a rehash runs inside __setitem__). Trust it only
  // once the probe's hash call returned (or after its first line).
  let from = p.start + 1;
  for (const c of facts.calls.values()) if (c.kind === 'hash' && c.parent === p.id) { from = c.end + 1; break; }
  for (let s = from; s <= Math.min(i, p.end); s++) {
    const st = facts.steps[s];
    if (topId(st) !== p.id) continue;
    const n = pick(st.locals, POS_NAMES);
    const pos = n ? st.locals[n] : undefined;
    if (!Number.isInteger(pos) || pos === last) continue;
    if (out.some((e) => e.slot === pos)) { last = pos; continue; }   // a full loop ends back home
    const t = snap(facts, p.oid, s);
    const slot = t && pos < t.slots.length ? t.slots[pos] : undefined;
    const kind = slot === undefined ? 'hidden' : slot === null ? 'empty' : same(slot.key, p.key) ? 'match' : 'collision';
    out.push({ slot: pos, kind, key: slot ? slot.key : null, wrapped: last !== null && pos < last, at: s });
    last = pos;
  }
  return out;
}


export const analyse = (steps) => analyseTables(steps, tableAt);

// Everything the renderer draws at step i.
export function frameAt(facts, i) {
  const step = facts.steps[i];
  const sc = scopeAt(facts, i);
  const scope = sc ? sc.scope : null;
  const activeOid = scope ? scope.oid : null;
  const prevStep = i > 0 ? i - 1 : null;

  const figures = facts.tables.filter((t) => t.first <= i).map((t) => {
    const cur = snap(facts, t.oid, i);
    const prev = prevStep !== null ? snap(facts, t.oid, prevStep) : null;
    const fig = {
      oid: t.oid, name: t.name, table: cur, active: t.oid === activeOid,
      flash: new Map(), marks: new Map(), home: null, cursor: null, scan: null,
      wrapNow: false, wrapped: false, old: null, ghost: null, moves: [], gap: null,
    };
    if (cur && prev && cur.arrayRef === prev.arrayRef) {
      cur.slots.forEach((s, k) => {
        const p = prev.slots[k];
        if (p === undefined) return;
        if (!p && s) fig.flash.set(k, 'ht-write');
        else if (p && !s) fig.flash.set(k, 'ht-clear');
        else if (p && s && same(p.key, s.key) && !same(p.value, s.value)) fig.flash.set(k, 'ht-update');
      });
    }
    return fig;
  });
  const fig = figures.find((f) => f.active) || null;
  const cur = fig ? fig.table : null;
  const out = { figures, scope, live: !!(sc && sc.live), probe: null, hash: null, del: null, rehash: null, scanInfo: null, badge: null, banner: null, caption: '' };
  if (!fig || !cur) { out.caption = idleCaption(figures); return out; }

  // Rehash: the old table stays (dimmed) while a rehash frame is live.
  const rh = [...facts.calls.values()].find((c) => c.kind === 'rehash' && c.oid === fig.oid && live(c, i));
  if (rh) {
    const old = snap(facts, fig.oid, rh.start);
    if (old && old.arrayRef !== cur.arrayRef) {
      const keys = cur.slots.filter(Boolean).map((s) => JSON.stringify(s.key));
      fig.old = { table: old, crossed: new Set(old.slots.map((s, k) => (s && keys.includes(JSON.stringify(s.key)) ? k : -1)).filter((k) => k >= 0)) };
    }
    out.rehash = { call: rh, from: old ? old.size : null, to: cur.size, started: !!fig.old };
  }

  // Probe: home, cursor, coloured trail, counter, wrap.
  const p = probeFor(facts, scope, i, cur.arrayRef);
  if (p) {
    const trail = trailOf(facts, p, i);
    const isInsert = typeof p.args.is_insert === 'boolean' ? p.args.is_insert : null;
    const done = i > p.end || (p.hasRet && i >= p.retAt);
    const lastE = trail[trail.length - 1] || null;
    out.probe = { call: p, key: p.key, isInsert, trail, done, live: live(p, i) && !done, result: p.hasRet ? p.ret : undefined, exc: p.exc, size: cur.size };
    for (const e of trail) fig.marks.set(e.slot, e.kind);
    if (trail.length) fig.home = trail[0].slot;
    if (lastE && !done) fig.cursor = lastE.slot;
    fig.wrapped = trail.some((e) => e.wrapped);
    fig.wrapNow = !!(lastE && lastE.wrapped && lastE.at === i);
  }

  // Hash strip: the latest hash call inside this scope (after the probe began).
  let hc = null;
  for (const c of facts.calls.values()) {
    if (c.kind !== 'hash' || c.oid !== fig.oid || c.start > i || !inside(c, scope)) continue;
    if (p && c.start < p.start && c.parent === p.id) continue;
    if (!hc || c.start > hc.start) hc = c;
  }
  if (hc && (!p || hc.start >= p.start || hc.ancestors.has(p.id) || scope.kind === 'hash')) out.hash = hashStrip(facts, hc, i);

  // Delete: the gap, the cluster scan, lifted keys and their moves. A probe
  // is cleared once its job is done (the gap opened / its key landed), so the
  // next re-insert starts from a clean row (R2 Q3).
  if (scope.kind === 'delete') {
    out.del = deleteFacts(facts, scope, i, fig);
    const d = out.del;
    const isFind = !!(p && d.findId === p.id);
    const landed = p && d.moves.some((m) => m.done && same(m.key, p.key));
    if (p && ((isFind && d.gap !== null && (cur.slots[d.gap] === null || d.scan !== null)) || landed)) {
      out.probe = null; out.hash = null;
      fig.marks.clear(); fig.home = null; fig.cursor = null; fig.wrapped = false; fig.wrapNow = false;
    }
  }

  // Scans (get_all_keys / values / __str__): cursor + the result so far.
  if (scope.kind === 'scan') {
    const loop = loopOf(facts, scope, i, [...SCAN_INDEX_NAMES, ...SCAN_ITEM_NAMES]);
    const row = loop.rows[loop.k] || {};
    const ixName = pick(row, SCAN_INDEX_NAMES);
    const k = ixName && Number.isInteger(row[ixName]) ? row[ixName] : loop.k;
    const resName = pick(step.locals, RESULT_NAMES);
    const finished = !out.live;
    if (!finished && k >= 0 && k < cur.slots.length) fig.scan = k;
    out.scanInfo = { slot: finished ? null : k, result: finished ? scope.ret : resName ? step.locals[resName] : undefined, finished };
  }

  // Result badge / full banner once the operation (or its probe) is over.
  if (!out.live && scope.hasRet && scope.kind !== 'insert' && scope.kind !== 'delete' && scope.kind !== 'rehash') {
    out.badge = { kind: 'good', text: `${scope.fn}(${scope.key !== undefined ? py(scope.key, 16) : ''}) → ${py(scope.ret, 60)}` };
  }
  if (scope.exc && !(scope.hasRet)) {
    const full = !!(out.probe && out.probe.exc && out.probe.isInsert === true && out.probe.trail.length >= cur.size);
    if (i >= scope.excAt || !out.live) {
      if (full) out.banner = `Table is full! All ${cur.size} slots were probed — no empty slot for ${py(p.key)}.`;
      else out.badge = { kind: 'err', text: `${scope.fn}(${py(scope.key, 16)}) raised ${scope.exc}` };
    }
  }
  if (out.probe && out.probe.exc && !out.banner && out.probe.isInsert && out.probe.trail.length >= cur.size && i >= p.excAt) {
    out.banner = `Table is full! All ${cur.size} slots were probed — no empty slot for ${py(p.key)}.`;
  }
  out.caption = caption(facts, i, out, fig);
  return out;
}

function deleteFacts(facts, scope, i, fig) {
  const cur = fig.table;
  const own = [...facts.calls.values()].filter((c) => c.kind === 'probe' && c.op === scope.id && c.start <= i).sort((a, b) => a.start - b.start);
  const find = own[0] || null;
  const d = { findId: find ? find.id : null, found: !!(find && find.hasRet && i >= find.retAt), gap: find && find.hasRet ? find.ret : null, scan: null, ended: false, moves: [], lifting: null };
  if (!d.found) return d;
  const before = snap(facts, fig.oid, scope.start);
  const homeOf = (key) => (before ? before.slots.findIndex((s) => s && same(s.key, key)) : -1);
  for (const c of own.slice(1)) {
    const m = { key: c.key, from: homeOf(c.key), to: c.hasRet && i >= c.retAt ? c.ret : null };
    // Landed = the tuple is back in the array (one step after the probe returns).
    m.done = m.to !== null && !!cur.slots[m.to] && same(cur.slots[m.to].key, c.key);
    d.moves.push(m);
  }
  const lifting = d.moves.find((m) => !m.done) || null;
  d.lifting = lifting;
  // Scan cursor: the delete frame's own position, sticky while it re-probes.
  let lastPos = null, prevPos = null;
  for (let s = find.end + 1; s <= Math.min(i, scope.end); s++) {
    const st = facts.steps[s];
    if (topId(st) !== scope.id) continue;
    const n = pick(st.locals, POS_NAMES);
    const pos = n ? st.locals[n] : undefined;
    if (!Number.isInteger(pos)) continue;
    if (pos !== lastPos) {
      prevPos = lastPos;
      lastPos = pos;
      const t = snap(facts, fig.oid, s);
      if (prevPos !== null && t && t.slots[pos] === null && !(d.moves.some((m) => !m.done && m.from === pos))) d.ended = pos;
    }
  }
  d.scan = lastPos !== null && lastPos !== d.gap ? lastPos : null;
  if (d.gap !== null && cur.slots[d.gap] === null && d.ended === false) fig.gap = d.gap;
  if (scope.end >= i && d.scan !== null && d.ended === false) fig.scan = d.scan;
  if (lifting && lifting.from >= 0 && cur.slots[lifting.from] === null) fig.ghost = { slot: lifting.from, key: lifting.key };
  // Lifted this very step, before its re-insert probe starts.
  const prev = snap(facts, fig.oid, i - 1);
  if (!fig.ghost && d.scan !== null && cur.slots[d.scan] === null && prev && prev.arrayRef === cur.arrayRef && prev.slots[d.scan]) {
    fig.ghost = { slot: d.scan, key: prev.slots[d.scan].key };
  }
  fig.moves = d.moves.filter((m) => m.done);
  return d;
}

function idleCaption(figures) {
  if (!figures.length) return '<span class="tp-cap-muted">no table yet</span>';
  return figures.map((f) => f.table
    ? `<span class="tp-cap-muted">${escapeHtml(f.name)}: ${f.table.count} of ${f.table.size} slots used</span>`
    : '').join(' · ');
}

// Plain-English narration, most specific first.
function caption(facts, i, out, fig) {
  const cur = fig.table;
  const sc = out.scope;
  const pr = out.probe;
  const size = cur.size;
  if (out.banner) {
    const pc = pr && pr.call;
    return `<span class="q-cap-err">✗ ${escapeHtml(pc ? pc.fn : 'probe')} raised ${escapeHtml((pc && pc.exc) || sc.exc || 'an error')}</span> — every slot holds another key; a rehash would have grown the table, but no bigger size is left`;
  }
  if (out.badge && out.badge.kind === 'err') {
    const k = pr && pr.trail[pr.trail.length - 1];
    const why = k && k.kind === 'empty' ? ` — slot ${k.slot} is empty, so ${h(sc.key)} was never inserted`
      : pr && pr.trail.length >= size ? ` — all ${size} slots probed, none empty and none holds ${h(sc.key)}` : '';
    return `<span class="q-cap-err">✗ ${escapeHtml(out.badge.text)}</span>${why}`;
  }
  // Rehash start: the old array is about to be replaced.
  if (out.rehash && !out.rehash.started && out.rehash.call.start === i) {
    const endT = snap(facts, fig.oid, out.rehash.call.end);
    if (endT && endT.arrayRef === cur.arrayRef) {
      return `<b>rehash</b>: count ${cur.count} &gt; ${size} / 2, but there is <b>no bigger size</b> left — the table stays at ${size} slots and can fill up`;
    }
    return `<b>rehash</b>: count ${cur.count} &gt; ${size} / 2 — grow to the next size so probe chains stay short`;
  }
  if (out.rehash && out.rehash.started) {
    const prevT = snap(facts, fig.oid, i - 1);
    if (prevT && prevT.arrayRef !== cur.arrayRef) return `<b>rehash</b>: new empty table of ${size} slots — every key gets a new slot`;
  }
  // Hash strip running.
  const hcap = hashCaption(out, i, size);
  if (hcap) return hcap;
  if (out.hash && out.hash.done && pr && pr.trail.length === 1 && pr.live && pr.trail[0].at === i) {
    return `hash(${h(out.hash.key)}) = <b>${out.hash.result}</b> → start probing at its <b>home</b> slot ${out.hash.result}`;
  }
  // Delete phases.
  const d = out.del;
  if (d && d.found && sc.end >= i) {
    const ghost = fig.ghost;
    const landed = d.moves.find((m) => m.done && fig.flash.get(m.to) === 'ht-write');
    if (landed) return landed.from === landed.to
      ? `<b>${h(landed.key)}</b> stays at slot ${landed.to} — it is already the first free slot from its home`
      : `<b>${h(landed.key)}</b> moves ${landed.from} → <b>${landed.to}</b> — closer to its home slot, so lookups still reach it`;
    if (ghost && fig.flash.get(ghost.slot) === 'ht-clear') return `lift <b>${h(ghost.key)}</b> out of slot ${ghost.slot} and re-insert it from its own home slot`;
    if (fig.flash.get(d.gap) === 'ht-clear') return `array[${d.gap}] = None — a <b>gap</b>; keys after it in the cluster could no longer be found, so re-place them`;
    if (d.ended !== false) return `slot ${d.ended} is empty → the <b>cluster ends</b>, delete is done`;
    if (d.scan !== null && !(pr && pr.live)) {
      const placing = d.moves.find((m) => !m.done && m.to !== null);
      if (placing) return `the probe found slot <b>${placing.to}</b> → put ${h(placing.key)} there`;
      const handled = d.moves.find((m) => m.done && m.from === d.scan);
      if (handled) return `cluster scan: ${h(handled.key)} is re-placed → move on to slot ${(d.scan + 1) % size}`;
      if (ghost) return `<b>${h(ghost.key)}</b> is lifted out — re-insert it with a fresh probe from its home slot`;
      const s = cur.slots[d.scan];
      if (s) return `cluster scan: slot ${d.scan} holds <b>${h(s.key)}</b> — still part of the cluster, take it out and re-insert it`;
    }
  }
  // Probe narration.
  if (pr && pr.live && pr.trail.length) {
    const e = pr.trail[pr.trail.length - 1];
    const n = `<span class="tp-cap-muted">(probe ${pr.trail.length} of ${size})</span>`;
    const nextLine = e.at !== i;   // the probe already examined this slot: what happens next
    if (e.wrapped && e.at === i) return `slot ${pr.trail[pr.trail.length - 2].slot} was the last slot → <b>wrap around</b> to slot 0 ${n}`;
    if (e.kind === 'hidden') return `slot ${e.slot} (not shown — the tracer records the first 100 slots) ${n}`;
    if (e.kind === 'collision') return `slot ${e.slot} holds <b>${h(e.key)}</b> ≠ ${h(pr.key)} → <span class="ht-cap-col">collision</span>${nextLine ? `, step to slot ${(e.slot + 1) % size}` : ''} ${n}`;
    if (e.kind === 'match') return `slot ${e.slot} holds <b>${h(pr.key)}</b> → <span class="tp-cap-good">found</span> ${n}`;
    if (e.kind === 'empty') {
      if (pr.isInsert === false) return `slot ${e.slot} is empty → ${h(pr.key)} is <b>not</b> in the table (it would be here) ${n}`;
      return `slot ${e.slot} is empty → <span class="tp-cap-good">free spot</span> for ${h(pr.key)} ${n}`;
    }
  }
  // A slot written / updated / cleared on this step.
  for (const [k, cls] of fig.flash) {
    const s = cur.slots[k];
    if (cls === 'ht-write') return `array[${k}] = (${h(s.key)}, ${h(s.value)})${cur.countName ? ` · ${escapeHtml(cur.countName)} = ${cur.count}` : ''}${out.rehash ? ' <span class="tp-cap-muted">(re-inserted)</span>' : ''}`;
    if (cls === 'ht-update') return `<b>update</b>: ${h(s.key)} already lives in slot ${k} → value becomes <b>${h(s.value)}</b>, count stays ${cur.count}`;
  }
  // Count changes (insert +1 before the threshold check, delete -1).
  const prevT = snap(facts, fig.oid, i - 1);
  if (prevT && prevT.count !== cur.count && cur.countName && cur.count === 0 && out.rehash) {
    return `${escapeHtml(cur.countName)} reset to 0 — each re-insert counts its key again`;
  }
  if (prevT && prevT.arrayRef === cur.arrayRef && prevT.count !== cur.count && cur.countName) {
    const over = cur.count > size / 2;
    return `${escapeHtml(cur.countName)} ${prevT.count} → <b>${cur.count}</b> · load ${cur.count}/${size}${over ? ' <span class="q-cap-err">&gt; ½ → time to rehash</span>' : ''}`;
  }
  // Scans.
  if (out.scanInfo && !out.scanInfo.finished && out.scanInfo.slot !== null && out.scanInfo.slot >= 0) {
    const s = cur.slots[out.scanInfo.slot];
    return `${escapeHtml(sc.fn)}: slot ${out.scanInfo.slot} ${s ? `holds <b>${h(s.key)}</b>` : 'is empty — skip'}`;
  }
  if (out.badge) return `<span class="tp-cap-good">${escapeHtml(out.badge.text)}</span>`;
  if (out.rehash && out.rehash.started) return `<b>rehash</b>: re-inserting every key into the ${size}-slot table`;
  if (out.live) {
    const args = Object.entries(sc.args).filter(([k]) => k !== 'self').map(([k, v]) => `${escapeHtml(k)}=${h(v, 16)}`).join(', ');
    return `<span class="tp-cap-muted">running ${escapeHtml(sc.fn)}(${args})</span>`;
  }
  if (sc.kind === 'insert' && sc.hasRet) {
    const s = cur.slots.findIndex((x) => x && same(x.key, sc.key));
    return `<span class="tp-cap-good">${escapeHtml(sc.fn)}(${h(sc.key, 16)}) done</span>${s >= 0 ? ` — ${h(sc.key)} is in slot ${s}` : ''}`;
  }
  if (sc.kind === 'delete' && sc.hasRet) return `<span class="tp-cap-good">${escapeHtml(sc.fn)}(${h(sc.key, 16)}) done</span> — ${cur.count} of ${size} slots used`;
  return idleCaption(out.figures);
}
