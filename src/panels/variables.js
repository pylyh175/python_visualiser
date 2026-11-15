/* ═══════════════ Variables panel ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';

export function renderVars() {
  if (!state.steps.length) {
    els.vars.innerHTML = '<span class="empty">Run some code first.</span>';
    return;
  }
  const vars = state.steps[state.idx].locals || {};
  const mem = state.steps[state.idx].mem || null;
  const { names, lastShown, lastMem } = collectVars(vars);
  if (!names.length) {
    els.vars.innerHTML = '<span class="empty">(no variables)</span>';
    return;
  }
  const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  // One shared rendered/path pair per render: the FIRST row to show an oid
  // draws its canonical box; every later row (another name holding the same
  // object) renders the aliasing arrow instead of a duplicate box.
  const rendered = new Map();   // oid → label of its canonical box
  const path = [];              // oids currently being drawn (cycle detection)
  const rows = names.map((k) => {
    const live = hasOwn(vars, k);
    const value = hasOwn(vars, k) ? vars[k] : lastShown.get(k);
    // A persisted (scope-ended) container keeps the diagram of the step its
    // last-shown value came from — same discipline as lastShown values.
    const m = live ? mem : (lastMem.get(k) || null);
    const text = escapeHtml(fmtValue(value));
    return `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${memCell(k, value, m, text, rendered, path)}</td></tr>`;
  }).join('');
  els.vars.innerHTML = `<table>${rows}</table>`;
}

/* ═══════════════ Boxes-and-arrows memory diagram (2026-11-15, grilled Q1–Q9) ═══════════════
   Container/instance values render as boxes instead of formatted strings:
   each object draws ONCE (its canonical box, labelled with the first
   variable that showed it), a later name holding the SAME object renders
   `──▶ <label>` (the aliasing arrow — the reference-diagram essence),
   nested containers draw as nested boxes, and a back-edge draws `↺` so a
   self-referencing structure can never recurse forever. The old formatted
   string stays as the row's hover tooltip (grilled Q8). Pure div/span HTML
   in the panel's house style — no SVG, no positioning math. */

const MEM_SHOW_ITEMS = 8;   // grilled Q5: first 8 elements, then "+N more"
const MEM_SHOW_DEPTH = 3;   // box levels visible; anything deeper renders …
const MEM_TRUNC = 24;       // grilled Q9: element text truncation inside a box

// A step's diagram data: { roots: {name: {"ref": oid}}, nodes: {oid: node} }.
// Scalar/definition values have no root — they keep their text rendering.
// rendered/path are shared across the whole render (see renderVars): the
// FIRST row to show an oid draws its canonical box; a later root of the
// SAME object renders the alias arrow instead of a duplicate box.
function memCell(k, value, mem, text, rendered, path) {
  const root = mem && mem.roots && hasOwnKey(mem.roots, k) ? mem.roots[k] : null;
  if (!root || typeof root !== 'object' || !('ref' in root)) return text;
  const oid = String(root.ref);
  if (rendered.has(oid)) {
    return `<span class="mem-wrap" title="${attrEsc(text)}"><span class="mem-ref">──▶ ${escapeHtml(rendered.get(oid))}</span></span>`;
  }
  const box = memBox(root.ref, mem.nodes || {}, rendered, path, 1, k);
  return box ? `<span class="mem-wrap" title="${attrEsc(text)}">${box}</span>` : text;
}

function hasOwnKey(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

// Quote-escape for an HTML attribute value (escapeHtml leaves " alone).
function attrEsc(s) { return escapeHtml(String(s)).replace(/"/g, '&quot;'); }

// The canonical box for one object: header (owner name, or type #oid for an
// anonymous nested box) + one slot per element. Dict keys and instance
// attribute names lead their slots; shared children become arrows; deep
// children become ….
function memBox(oid, nodes, rendered, path, depth, owner) {
  const node = nodes[oid];
  if (!node || typeof node !== 'object') return null;
  const label = owner ?? (node.t === 'inst' ? `${node.cls} #${oid}` : `${node.t} #${oid}`);
  rendered.set(String(oid), label);
  path.push(String(oid));
  const kind = node.t === 'inst' ? node.cls : node.t;
  let slots = '';
  const items = node.items || [];
  const moreVal = items.length && typeof items[items.length - 1] === 'object'
    && items[items.length - 1] !== null && 'more' in items[items.length - 1]
    ? items[items.length - 1].more : 0;
  const real = moreVal ? items.slice(0, -1) : items;
  if (!real.length && !moreVal) {
    slots = '<span class="mem-slot mem-empty">(empty)</span>';
  } else {
    const shown = real.slice(0, MEM_SHOW_ITEMS);
    slots = shown.map((it, i) => memSlot(it, i, node.t, nodes, rendered, path, depth)).join('');
    const hidden = (real.length - shown.length) + moreVal;
    if (hidden > 0) slots += `<span class="mem-slot mem-more">… +${hidden} more</span>`;
  }
  path.pop();
  return `<span class="mem-box"><span class="mem-cap">${escapeHtml(label)} <i>${escapeHtml(kind)}</i></span><span class="mem-slots">${slots}</span></span>`;
}

// One element slot: key:value for dicts/instances, indexed for sequences,
// bare for sets. A scalar inlines (truncated); a ref draws an arrow to its
// canonical box, the box itself when unseen (nested), or ↺ on a back-edge.
function memSlot(it, i, t, nodes, rendered, path, depth) {
  const lead = t === 'dict' || t === 'inst'
    ? `<i>${escapeHtml(it[0])}</i>`
    : (t === 'list' || t === 'tuple' ? `<i>${i}</i>` : '');
  const v = t === 'dict' || t === 'inst' ? it[1] : it;
  const body = memValue(v, nodes, rendered, path, depth);
  return `<span class="mem-slot">${lead}${body}</span>`;
}

function memValue(v, nodes, rendered, path, depth) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('ref' in v) {
      const oid = String(v.ref);
      if (rendered.has(oid)) {
        if (path.includes(oid)) {
          return `<span class="mem-ref mem-cycle">↺ ${escapeHtml(rendered.get(oid))}</span>`;
        }
        return `<span class="mem-ref">──▶ ${escapeHtml(rendered.get(oid))}</span>`;
      }
      if (path.length >= MEM_SHOW_DEPTH) return '<span class="mem-deep">…</span>';
      const box = memBox(oid, nodes, rendered, path, depth + 1, null);
      return box ?? '<span class="mem-deep">…</span>';
    }
    if ('more' in v) return `<span class="mem-more">… +${v.more} more</span>`;
  }
  if (typeof v === 'string') {
    // A "…" past the runner's depth cap, or a real string (quoted like
    // fmtValue, truncated per grilled Q9 — the full value is in the tooltip).
    if (v === '…') return '<span class="mem-deep">…</span>';
    const quoted = '"' + v + '"';
    return escapeHtml(quoted.length > MEM_TRUNC ? quoted.slice(0, MEM_TRUNC) + '…' : quoted);
  }
  return escapeHtml(String(v));
}

// Panel order: by first appearance in the trace so far — ONE list, forever
// A name's slot is where it was first displayed; new names always append at the
// bottom, existing ones never reorder — even when they come from a nested
// frame whose snapshot layers them above the module's. Slots derive from
// steps 0..idx only: forward steps extend the sequence, any rewind
// reproduces the earlier layout exactly.
//
// Definitions pinned to the top: the user's readability ask — the function
// must appear ABOVE the arguments it is called with. The call-step snapshot
// layers frame locals above module globals, so first-appearance order alone
// shows `a, b, n` before the function at the very first step. Names whose
// value has EVER matched a definition shape (function `qualname(sig)…`,
// class `Name { … }`) live in a sticky top block; instances (`Name instance { … }`)
// and all data stay below. Sticky once-ever so a name never jumps blocks
// (same discipline as "nothing ever reorders"); each block keeps first-appearance slot order.
// A def-after-code inserts at the bottom of the definition block, pushing
// the data block down — accepted (grilled Q4); defs-at-top is the norm.
//
// Scope-ended persistence: a name whose frame has returned
// (its locals left the runner's snapshots — Python scope semantics) STAYS
// in the panel until the run is reset, keeping its slot 
// and showing the last value ever shown for it, while a live binding of
// the same name elsewhere always wins. Recomputed from steps 0..idx on
// every render, so rewinds reproduce history exactly like the slot rule
// does. Rendering is deliberately identical to live variables (no marker).
// Returns the ordered names plus the last-shown value per name for the
// absent ones — and, for container values, the step's diagram data the
// last-shown value came from (lastMem), so a persisted name keeps its boxes.
function collectVars(current) {
  const slot = new Map();
  const lastShown = new Map();
  const lastMem = new Map();
  const isDef = new Map();   // sticky: ever shown as a function/class
  let seq = 0;
  for (let i = 0; i <= state.idx && i < state.steps.length; i++) {
    const stepMem = state.steps[i].mem || null;
    for (const [k, v] of Object.entries(state.steps[i].locals || {})) {
      if (!slot.has(k)) slot.set(k, seq++);
      lastShown.set(k, v);
      if (stepMem && stepMem.roots && hasOwnKey(stepMem.roots, k)) lastMem.set(k, stepMem);
      if (!isDef.has(k) && looksLikeDefinition(v)) isDef.set(k, true);
    }
  }
  const ordered = [...slot.keys()].sort((a, b) => slot.get(a) - slot.get(b));
  return {
    names: [
      ...ordered.filter((k) => isDef.get(k)),
      ...ordered.filter((k) => !isDef.get(k)),
    ],
    lastShown,
    lastMem,
  };
}

// Shape checks on the runner's formatted values (runner.py
// __viz_make_safe): a function renders as "qualname(signature)" optionally
// followed by " -> return-type" (qualnames may contain dots or
// "<locals>."), a class as "Name { method(sig), … }" — while an INSTANCE
// renders as "Name instance { … }" and must NOT match. Instances and all
// data stay below the definition block. Panel-side detection (grilled Q3):
// a data string that happens to look like a call (x = "f(1)") is the one
// accepted false positive; the formats themselves are runner-generated and
// audit-pinned.
function looksLikeDefinition(v) {
  if (typeof v !== 'string') return false;
  const FUNC_SHAPE = /^[A-Za-z_<>][A-Za-z0-9_.<>]*\(.*\)(?: -> .*)?$/;
  const CLASS_SHAPE = /^[A-Za-z_][A-Za-z0-9_]* \{ .*$/;
  return FUNC_SHAPE.test(v) || CLASS_SHAPE.test(v);
}
