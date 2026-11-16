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
  const { names, lastShown, lastMem, ownerCand } = collectVars(vars);
  if (!names.length) {
    els.vars.innerHTML = '<span class="empty">(no variables)</span>';
    return;
  }
  const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  // Displayed value per name: the live binding while present, the
  // last-shown value once the name's scope has ended.
  const valueOf = (k) => (hasOwn(vars, k) ? vars[k] : lastShown.get(k));
  // One shared rendered/path pair per render: the FIRST row to show an oid
  // draws its canonical box; every later row (another name holding the same
  // object) renders the aliasing arrow instead of a duplicate box.
  const rendered = new Map();   // oid → label of its canonical box
  const path = [];              // oids currently being drawn (cycle detection)
  const sub = new Set();        // method rows nested under their class row
  const curLine = state.steps[state.idx].line || 0;   // for the loop-var relabel
  const rows = groupMethods(names, valueOf, ownerCand, sub).map((k) => {
    const live = hasOwn(vars, k);
    const value = valueOf(k);
    // A persisted (scope-ended) container keeps the diagram of the step its
    // last-shown value came from — same discipline as lastShown values.
    const m = live ? mem : (lastMem.get(k) || null);
    const text = escapeHtml(fmtValue(value));
    const tr = sub.has(k) ? '<tr class="sub">' : '<tr>';
    // Only LIVE bindings get the loop-variable relabel: a scope-ended
    // container's line is outside every loop body anyway, and its label
    // must not flip with whatever the module level is doing now.
    return `${tr}<td class="k">${escapeHtml(k)}</td><td class="v">${memCell(k, value, m, text, rendered, path, live ? loopVarFor(k, curLine) : null)}</td></tr>`;
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
   in the panel's house style — no SVG, no positioning math.
   Round 2 (2026-11-15, grilled Q1–Q6): a ROOT-level list/tuple whose
   elements are all scalars renders as an index-row × value-row GRID
   instead of boxes — see memGrid below. */

const MEM_SHOW_ITEMS = 8;   // grilled Q5: first 8 elements, then "+N more"
const MEM_SHOW_DEPTH = 3;   // box levels visible; anything deeper renders …
const MEM_TRUNC = 24;       // grilled Q9: element text truncation inside a box

// A step's diagram data: { roots: {name: {"ref": oid}}, nodes: {oid: node} }.
// Scalar/definition values have no root — they keep their text rendering.
// rendered/path are shared across the whole render (see renderVars): the
// FIRST row to show an oid draws its canonical box; a later root of the
// SAME object renders the alias arrow instead of a duplicate box.
function memCell(k, value, mem, text, rendered, path, gridName) {
  const root = mem && mem.roots && hasOwnKey(mem.roots, k) ? mem.roots[k] : null;
  if (!root || typeof root !== 'object' || !('ref' in root)) return text;
  const oid = String(root.ref);
  if (rendered.has(oid)) {
    return `<span class="mem-wrap" title="${attrEsc(text)}"><span class="mem-ref">──▶ ${escapeHtml(rendered.get(oid))}</span></span>`;
  }
  const box = memBox(root.ref, mem.nodes || {}, rendered, path, 1, k, gridName);
  return box ? `<span class="mem-wrap" title="${attrEsc(text)}">${box}</span>` : text;
}

function hasOwnKey(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

// Quote-escape for an HTML attribute value (escapeHtml leaves " alone).
function attrEsc(s) { return escapeHtml(String(s)).replace(/"/g, '&quot;'); }

// The canonical box for one object: header (owner name, or type #oid for an
// anonymous nested box) + one slot per element. Dict keys and instance
// attribute names lead their slots; shared children become arrows; deep
// children become ….
function memBox(oid, nodes, rendered, path, depth, owner, gridName) {
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
  // list/tuple whose shown elements are all scalars renders as an
  // index-row × value-row grid instead of boxes — the user's example
  // (`numbers = [3, 1, 4, 1, 5]` → index 0 1 2 3 4 / numbers 3 1 4 1 5).
  // Empty sequences stay `(empty)`, non-scalar elements (refs, the '…'
  // depth marker) keep the boxes-and-arrows rendering, and deeper levels
  // never grid (a nested flat list draws as a nested box). The canonical
  // label bookkeeping above is shared with the boxes, so aliasing
  // (`──▶ a`) works unchanged against a grid — the loop-variable relabel
  // (gridName) is DISPLAY-ONLY and never feeds the alias labels.
  if (depth === 1 && (node.t === 'list' || node.t === 'tuple')
    && (real.length || moreVal) && real.every(isMemScalar)) {
    path.pop();
    return memGrid(gridName ?? label, real, moreVal);
  }
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

// A grid-able element (grilled round 2 Q3): anything the boxes would
// inline — numbers, strings, booleans, None (runner null). A ref/more
// marker is an object, and the '…' string is the runner's depth-cap
// marker — either falls back to the boxes-and-arrows rendering.
function isMemScalar(v) {
  return v !== '…' && (v === null || typeof v !== 'object');
}

// row 1 is the literal `index` label (muted) + the positions; 
// row 2 is the owner name + the values — NO type chip (2026-11-16, grilled
// Q1: the word "list" beside the name was noise). During a `for` loop over
// the list, the name is replaced by the loop variable (see loopVarFor).
// Same caps as the boxes (MEM_SHOW_ITEMS shown, then a `+N more` cell)
// and the same cell formatting — values go through memValue, so strings
// are quoted/truncated and None is None.
// The extra cap column shows `…` on the index row and `… +N more` on the value row.
function memGrid(label, items, extra) {
  const shown = items.slice(0, MEM_SHOW_ITEMS);
  const hidden = (items.length - shown.length) + extra;
  const cols = shown.length + (hidden ? 1 : 0);
  const idxCells = shown.map((_, i) => `<span class="mem-gcell mem-gidx">${i}</span>`).join('');
  const valCells = shown.map((v) => `<span class="mem-gcell">${memValue(v, {}, new Map(), [], 1)}</span>`).join('');
  const idxMore = hidden ? '<span class="mem-gcell mem-gidx">…</span>' : '';
  const valMore = hidden ? `<span class="mem-gcell mem-gmore">… +${hidden} more</span>` : '';
  return `<span class="mem-grid" style="grid-template-columns:auto repeat(${cols}, minmax(2.2em, 1fr))">`
    + `<span class="mem-glabel mem-ghead">index</span>${idxCells}${idxMore}`
    + `<span class="mem-glabel mem-gname">${escapeHtml(label)}</span>${valCells}${valMore}`
    + '</span>';
}

// Loop-variable relabel (2026-11-16, grilled Q1–Q6): while execution is
// inside the body of `for n in numbers`, the `numbers` grid's name row
// reads `n` — the element being accessed — and reverts to `numbers` before
// the loop starts, after it ends, and on the for-line step itself (grilled
// Q1: n is unbound there). Detection is panel-side and dynamic: a one-time
// scan of the editor text (safe to read at render time — any edit resets
// the trace) collects BLOCK bodies of bare-name loops
// (`for <target> in <name>:`); at render time the current step's line picks
// the innermost (deepest-indented) loop whose body contains it (grilled
// Q5: nested → innermost, sequential → whoever owns the line). Slices,
// calls, tuple targets, and inline one-liner bodies never qualify (grilled
// Q4: bare-name iterables only), so those grids keep their own name.
// Canonical bookkeeping is untouched: aliasing arrows still cite the
// variable name, and the loop variable's own scalar row still shows beside
// the grid (grilled Q3: keep both).

let loopScanText = null;
let loopScan = [];   // { target, iter, start, end, indent } — 1-based body range

function parseForLoops(code) {
  if (code === loopScanText) return loopScan;
  loopScanText = code;
  loopScan = [];
  const lines = code.split('\n');
  const FOR_RE = /^([ \t]*)for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)\s*:(?:[ \t]*(?:#.*)?)?$/;
  for (let i = 0; i < lines.length; i++) {
    const m = FOR_RE.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    let end = i;   // last body line (0-based); blank/comment lines don't bound it
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim() || /^[ \t]*#/.test(lines[j])) continue;
      if ((lines[j].match(/^[ \t]*/))[0].length > indent) end = j;
      else break;
    }
    if (end > i) loopScan.push({ target: m[2], iter: m[3], start: i + 2, end: end + 1, indent });
  }
  return loopScan;
}

function loopVarFor(name, line) {
  if (!line) return null;
  let best = null;
  for (const L of parseForLoops(els.textarea.value)) {
    if (L.iter !== name || line < L.start || line > L.end) continue;
    if (!best || L.indent > best.indent) best = L;
  }
  return best ? best.target : null;
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
// Methods group under their owner class (2026-11-15, grilled Q1–Q6): the
// class row keeps its definition-block position and its methods render as
// indented sub-rows directly beneath it — see groupMethods below.
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
  // Sticky method-owner candidates (2026-11-15 grouping, grilled Q1–Q6):
  // the first value a name ever showed with a `Cls.` qualname prefix names
  // its owner class. Sticky once-ever (same discipline as isDef) so a
  // method rebound to data keeps its group. Membership is decided at
  // render time: the group only engages when the owner row exists and is
  // still a class row (groupMethods below).
  const ownerCand = new Map();
  let seq = 0;
  for (let i = 0; i <= state.idx && i < state.steps.length; i++) {
    const stepMem = state.steps[i].mem || null;
    for (const [k, v] of Object.entries(state.steps[i].locals || {})) {
      if (!slot.has(k)) slot.set(k, seq++);
      lastShown.set(k, v);
      if (stepMem && stepMem.roots && hasOwnKey(stepMem.roots, k)) lastMem.set(k, stepMem);
      if (!isDef.has(k) && looksLikeDefinition(v)) isDef.set(k, true);
      if (!ownerCand.has(k) && typeof v === 'string') {
        const dot = v.indexOf('.');
        if (dot > 0 && looksLikeDefinition(v)) ownerCand.set(k, v.slice(0, dot));
      }
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
    ownerCand,
  };
}

// Methods nested under their owner class row (2026-11-15, grilled Q1–Q6).
// Class-body methods reach the panel as sticky rows with EARLIER slots than
// their class (the class only enters the globals snapshot when its body
// finishes), so first-appearance order alone shows `push, pop, Stack` —
// exactly the user's report. Fix: the class row keeps its place in the
// definition block and its methods render directly beneath it (slot order
// inside the group). Membership (grilled Q4): the owner candidate must
// match a row that exists AND is still a class row — a method whose owner
// row is absent renders ungrouped in slot order. A data string sharing a
// class's name prefix (the accepted false positive already lives in the
// definition block) would nest under it — harmless, requires same-name
// coexistence in one program. During the class body (grilled Q3) no class
// row exists yet, so the methods show ungrouped at the top — grouping
// kicks in the moment the class row appears, and stays for the rest of
// the run (incl. the synthetic final step, where sticky methods ride
// above the class's globals row). Multiple classes (grilled Q5): each
// group rides directly under its owner, owners in their own slot order.
// `sub` collects the method names for the indented sub-row rendering.
function looksLikeClass(v) {
  return typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]* \{/.test(v);
}

function groupMethods(names, valueOf, ownerCand, sub) {
  const isClass = (k) => looksLikeClass(valueOf(k));
  const owner = new Map();
  for (const k of names) {
    const cls = ownerCand.get(k);
    if (cls && cls !== k && names.includes(cls) && isClass(cls)) owner.set(k, cls);
  }
  if (!owner.size) return names;
  const out = [];
  for (const k of names) {
    if (owner.has(k)) continue;   // methods emit only under their class
    out.push(k);
    if (isClass(k)) {
      for (const m of names) {
        if (owner.get(m) === k) { out.push(m); sub.add(m); }
      }
    }
  }
  return out;
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
