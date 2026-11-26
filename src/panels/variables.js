/* ═══════════════ Variables panel ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml, fmtValue } from '../utils.js';

// Scroll positions of flat list grids, keyed "name:rootRef" (rootRef = the
// mem node's stable ref). The panel re-renders from scratch on every step,
// so before replacing innerHTML the current positions are stashed, and after
// the fresh DOM exists they are restored (clamped to the new maximum). A
// list re-bound to a DIFFERENT object ref never matches — its strip resets
// to 0; the same list growing/shrinking keeps the position (clamped).
const SCROLL_POS = new Map();
function stashScroll() {
  if (!els.vars || typeof els.vars.querySelectorAll !== 'function') return;
  for (const el of els.vars.querySelectorAll('.mem-scroll')) {
    const k = el.getAttribute && el.getAttribute('data-scrollkey');
    if (k && typeof el.scrollLeft === 'number') SCROLL_POS.set(k, el.scrollLeft);
  }
}
function restoreScroll() {
  if (!els.vars || typeof els.vars.querySelectorAll !== 'function') return;
  for (const el of els.vars.querySelectorAll('.mem-scroll')) {
    const k = el.getAttribute && el.getAttribute('data-scrollkey');
    const v = k ? SCROLL_POS.get(k) : undefined;
    if (typeof v !== 'number') continue;
    const max = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
    el.scrollLeft = Math.min(v, max);
  }
}

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
  const stats = callStats();
  // One data row: the name and its value (boxes for containers/instances).
  const valueCell = (k) => {
    const value = valueOf(k);
    // A persisted (scope-ended) container keeps the diagram of the step its
    // last-shown value came from — same discipline as lastShown values.
    const m = hasOwn(vars, k) ? mem : (lastMem.get(k) || null);
    const text = escapeHtml(fmtValue(value));
    // The loop-variable label is static (code-derived, see loopVarFor), so
    // every row — live or persisted — gets the same constant label.
    return memCell(k, value, m, text, rendered, path, loopVarFor(k));
  };
  const rows = classLayout(names, valueOf, ownerCand).map((it) => {
    if (it.card) return classCard(it, names, valueOf, valueCell, stats);
    const k = it.name;
    // A function row (Q6): its text plus the same call facts as a method.
    const meta = fnMeta(valueOf(k));
    const live = meta ? stats.live.get(meta.line) : null;
    const tr = live ? `<tr class="fn-row-${live}">` : '<tr>';
    const v = valueCell(k) + (meta ? ' ' + fnFacts(meta, stats) : '');
    return `${tr}<td class="k">${escapeHtml(k)}</td><td class="v">${v}</td></tr>`;
  }).join('');
  stashScroll();
  els.vars.innerHTML = `<table>${rows}</table>`;
  restoreScroll();
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
  // With the 2D-arrays toggle ON, a list/tuple of flat scalar rows draws
  // as a matrix (see the 2D matrix display comment above) — checked before
  // the 1D grid, whose scalar rule these ref items could never satisfy
  // anyway. Same canonical bookkeeping as every other branch: the label
  // set above feeds the alias arrows, gridName is display-only.
  if (depth === 1 && mem2dEnabled() && (node.t === 'list' || node.t === 'tuple')
    && (real.length || moreVal) && isMatrixRows(real, nodes || {})) {
    path.pop();
    return memMatrix(gridName ?? label, real, moreVal, nodes || {});
  }
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
    const scrollKey = (typeof owner === 'string' && owner) ? `${owner}:${oid}` : null;
    return memGrid(gridName ?? label, real, moreVal, scrollKey);
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

// ═══ 2D matrix display ═══
// With the "2D arrays" checkbox ON, a root-level list/tuple whose every
// element is a flat list/tuple of scalars renders as a matrix instead of
// nested boxes: the variable's name row on top, a column-index header
// (0, 1, 2 …), and a row-index column. Detection is automatic (read at
// render time — no per-variable configuration, no effect on execution:
// flipping the checkbox only re-renders the current step). Qualification
// is strict: mixed contents, three-deep nesting, refs inside rows and
// all-empty rows silently keep the boxes-and-arrows rendering; a flat
// scalar list keeps the 1D grid. The runner's per-container `+N more`
// sentinel (a capped outer list or row) still qualifies — the sentinel
// renders as the same `… +N more` cell the boxes show. Ragged rows are
// allowed: shorter rows pad with invisible filler cells so the columns
// stay aligned. Canonical bookkeeping is shared with the boxes (an
// aliased copy still renders `──▶ label`), and the constant loop-variable
// relabel applies to the name row exactly as it does for the 1D grid.

function mem2dEnabled() {
  return !!(els.vars2d && els.vars2d.checked);
}

// A matrix row cell: a scalar, or the runner's per-container truncation
// sentinel (always last — the boxes view shows the same `… +N more`).
function isMemRowCell(v) {
  return isMemScalar(v)
    || (v !== null && typeof v === 'object' && !Array.isArray(v) && 'more' in v);
}

// A row node: a list/tuple whose items are all matrix row cells.
function isMatrixRow(node) {
  if (!node || (node.t !== 'list' && node.t !== 'tuple') || !Array.isArray(node.items)) return false;
  return node.items.every(isMemRowCell);
}

// items = the outer node's real items (row refs, possibly ending in the
// runner's outer-cap sentinel). The matrix needs at least one non-empty
// row (all-empty rows have nothing to index → boxes).
function isMatrixRows(items, nodes) {
  let nonEmpty = false;
  const ok = items.every((it) => {
    if (isMemRowCell(it) && !isMemScalar(it)) return true;   // outer-cap sentinel
    if (!it || typeof it !== 'object' || Array.isArray(it) || !('ref' in it)) return false;
    const row = nodes[String(it.ref)];
    if (!isMatrixRow(row)) return false;
    if ((row.items || []).some(isMemScalar)) nonEmpty = true;
    return true;
  });
  return ok && nonEmpty;
}

// Same caps and cell formatting as the 1D grid and the boxes: 8 rows and
// 8 columns shown (MEM_SHOW_ITEMS), then a `… +N more` sentinel cell for
// cut-off rows (bottom) and columns (right); values go through memValue.
// Invisible `mem-gpad` fillers keep every row aligned to the column count.
function memMatrix(label, rows, extra, nodes) {
  const shown = rows.slice(0, MEM_SHOW_ITEMS);
  const hiddenRows = (rows.length - shown.length) + extra;
  const parsed = shown.map((r) => {
    const node = nodes[String(r.ref)];
    const its = (node && node.items) || [];
    const more = its.length && typeof its[its.length - 1] === 'object'
      && its[its.length - 1] !== null && 'more' in its[its.length - 1]
      ? its[its.length - 1].more : 0;
    return { cells: more ? its.slice(0, -1) : its, more };
  });
  const cols = parsed.reduce((mx, p) => Math.max(mx, Math.min(p.cells.length, MEM_SHOW_ITEMS)), 0);
  const colMore = parsed.some((p) => p.more || p.cells.length > MEM_SHOW_ITEMS);
  const total = cols + (colMore ? 1 : 0);
  const pad = (n) => '<span class="mem-gpad"></span>'.repeat(Math.max(0, n));
  let out = `<span class="mem-grid" style="grid-template-columns:auto repeat(${total}, minmax(2.2em, 1fr))">`;
  // Row 1: the variable's name (loop-variable relabel applies), padded to
  // the full width; row 2: a blank corner cell + the column indices.
  out += `<span class="mem-glabel mem-gname">${escapeHtml(label)}</span>${pad(total)}`;
  out += `<span class="mem-glabel"></span>`;
  for (let c = 0; c < cols; c++) out += `<span class="mem-gcell mem-gidx">${c}</span>`;
  if (colMore) out += '<span class="mem-gcell mem-gidx">…</span>';
  parsed.forEach((p, i) => {
    const shownCells = p.cells.slice(0, MEM_SHOW_ITEMS);
    const hidden = (p.cells.length - shownCells.length) + p.more;
    out += `<span class="mem-gcell mem-gidx">${i}</span>`;
    out += shownCells.map((v) => `<span class="mem-gcell">${memValue(v, {}, new Map(), [], 1)}</span>`).join('');
    if (hidden) out += `<span class="mem-gcell mem-gmore">… +${hidden} more</span>`;
    out += pad(total - shownCells.length - (hidden ? 1 : 0));
  });
  if (hiddenRows) {
    out += `<span class="mem-gcell mem-gidx">…</span><span class="mem-gcell mem-gmore">… +${hiddenRows} more</span>${pad(total - 1)}`;
  }
  return out + '</span>';
}

// row 1 is the literal `index` label (muted) + the positions; 
// row 2 is the owner name + the values — NO type chip (2026-11-16, grilled
// Q1: the word "list" beside the name was noise). During a `for` loop over
// the list, the name is replaced by the loop variable (see loopVarFor).
// Same cell formatting as the boxes — values go through memValue, so
// strings are quoted/truncated and None is None. Rendering is handled in
// memGrid below: every emitted cell, nowrap, horizontally scrollable.
// The extra cap column shows `…` on the index row and `… +N more` on the value row.
// Every emitted cell renders (the runner caps emission at 100 — see
// MEM_MAX_ITEMS — so the strip is bounded); cells flow in a nowrap
// inline-grid inside a horizontal-scroll wrapper, so indices stay glued to
// values while scrolling. Only beyond the emission cap does a `… +N more`
// cell appear (on the value row, with a `…` marker on the index row).
// The wrapper carries data-scrollkey="name:ref" — the panel stashes its
// scrollLeft across re-renders (see SCROLL_POS in renderVars).
function memGrid(label, items, extra, scrollKey) {
  const hidden = extra;
  const idxCells = items.map((_, i) => `<span class="mem-gcell mem-gidx">${i}</span>`).join('');
  const valCells = items.map((v) => `<span class="mem-gcell">${memValue(v, {}, new Map(), [], 1)}</span>`).join('');
  const idxMore = hidden ? '<span class="mem-gcell mem-gidx">…</span>' : '';
  const valMore = hidden ? `<span class="mem-gcell mem-gmore">… +${hidden} more</span>` : '';
  const cols = items.length + (hidden ? 1 : 0);
  const inner = `<span class="mem-grid" style="grid-template-columns:auto repeat(${cols}, minmax(2.2em, 1fr))">`
    + `<span class="mem-glabel mem-ghead">index</span>${idxCells}${idxMore}`
    + `<span class="mem-glabel mem-gname">${escapeHtml(label)}</span>${valCells}${valMore}`
    + '</span>';
  return scrollKey
    ? `<span class="mem-scroll" data-scrollkey="${escapeHtml(scrollKey)}">${inner}</span>`
    : inner;
}

// Loop-variable relabel (2026-11-16, constant-label round): a list that a
// `for` loop iterates anywhere in the code is labelled with that loop's
// variable at EVERY step — from the grid's first appearance to the last
// step of the trace. Earlier rounds keyed the label on execution state
// (the current line, then line + binding), but the user's report (steps
// 24–26 flipping back to the list name after the loop) showed that any
// execution-derived label necessarily changes across the run: stability
// is the requirement, so the label is STATIC code-derived instead. A
// one-time scan of the editor text (safe to read at render time — any
// edit resets the trace) collects bare-name loops (`for <target> in
// <name>:` — block or inline body; slices `nums[1:]`, calls and tuple
// targets `i, v` never qualify), and the FIRST loop over a given list
// wins for the whole run (a later loop over the same list does not take
// over). Trade-off, chosen on purpose: the label shows the loop variable
// even before the loop starts and after it ends, and under nesting the
// outer list reads the outer variable — constant beats per-step accurate.
// Canonical bookkeeping is untouched: aliasing arrows still cite the
// variable name, and the loop variable's own scalar row still shows
// beside the grid.

let loopScanText = null;
let loopScan = new Map();   // iterable name → FIRST qualifying loop's target

function parseForLoops(code) {
  if (code === loopScanText) return;
  loopScanText = code;
  loopScan = new Map();
  const FOR_RE = /^[ \t]*for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)\s*:/;
  for (const line of code.split('\n')) {
    const m = FOR_RE.exec(line);
    if (m && !loopScan.has(m[2])) loopScan.set(m[2], m[1]);   // first loop wins
  }
}

function loopVarFor(name) {
  parseForLoops(els.textarea.value);
  return loopScan.get(name) || null;
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
// Classes render as cards (2026-11-26, superseding the 2026-11-15 method
// sub-rows): the card keeps the class row's definition-block position and
// absorbs its method and attribute rows — see classLayout below.
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
  // render time (classLayout below).
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

// Class-body methods reach the panel as sticky rows with EARLIER slots than
// their class (the class only enters the globals snapshot when its body
// finishes); classLayout pulls them into the class card at the class row's
// slot, so first-appearance order never shows `push, pop, Stack`.
function looksLikeClass(v) {
  return typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]* \{/.test(v);
}

/* ═══ Class cards (2026-11-26 class-card design, grilled Q1–Q12) ═══
   Each class declared in the run's source renders as ONE card instead of
   the `Stack { … }` string plus `Stack.push(self, item)` rows:
     header  `class Stack · instances: s` (Q3; `self` excluded)
     rows    class attributes first (Q11, live values from the runner),
             then every method in source order (Q4, `__init__` included)
             as `push(item)` + call facts (Q2).
   Card membership comes from the runner's run-level `defs` (AST of the
   source): methods = `Cls.name` qualnames, attributes = classAttrs[Cls].
   While the class body still runs (no class row yet) a provisional
   `(defining…)` card holds the members defined so far (Q7). Classes not
   declared in the source (imports) keep the plain text row. Always open,
   no fold (Q12).
   shortcut: rows are matched by NAME, so a module variable sharing a class
   attribute/method name folds into the card; upgrade when the runner tags
   class-body rows with their owner. */

// Class name -> { attrs, methods: [{name, qn}] } from the run's defs.
function sourceClasses() {
  const defs = state.defs || {};
  const out = new Map();
  for (const cls of Object.keys(defs.classAttrs || {})) {
    out.set(cls, { attrs: defs.classAttrs[cls] || [], methods: [] });
  }
  for (const qn of Object.keys(defs.fns || {})) {
    const dot = qn.lastIndexOf('.');
    const cls = dot > 0 ? qn.slice(0, dot) : null;
    if (cls && out.has(cls)) out.get(cls).methods.push({ name: qn.slice(dot + 1), qn });
  }
  return out;
}

// Panel layout: plain rows ({name}) and cards ({card, cls, provisional,
// members}) in panel order. A card sits at its class row; a provisional
// card at its first member's slot.
function classLayout(names, valueOf, ownerCand) {
  const classes = sourceClasses();
  const isClassRow = (k) => classes.has(k) && looksLikeClass(valueOf(k));
  const memberOf = new Map();   // row name -> owning class
  for (const [cls, c] of classes) {
    const own = new Set([...c.attrs, ...c.methods.map((m) => m.name)]);
    for (const k of names) {
      if (k === cls || memberOf.has(k)) continue;
      if (ownerCand.get(k) === cls || own.has(k)) memberOf.set(k, cls);
    }
  }
  // The class body executing right now (its frame is the recorded top).
  const cur = state.steps[Math.min(state.idx, state.steps.length - 1)] || {};
  const top = (cur.stack || [])[(cur.stack || []).length - 1];
  const defining = top && !cur.finished ? top.fn : null;
  const out = [];
  const placed = new Set();
  for (const k of names) {
    if (isClassRow(k)) {
      out.push({ card: true, cls: k, provisional: false });
      placed.add(k);
      continue;
    }
    const cls = memberOf.get(k);
    if (!cls) { out.push({ name: k }); continue; }
    if (names.includes(cls)) {
      if (!isClassRow(cls)) out.push({ name: k });   // owner rebound to data
    } else if (ownerCand.get(k) === cls || defining === cls) {
      // No class row yet: its body is still running (Q7). A name match
      // alone (no `Cls.` qualname, body not running) stays a plain row.
      if (!placed.has(cls)) out.push({ card: true, cls, provisional: true });
      placed.add(cls);
    } else {
      out.push({ name: k });
    }
  }
  return out;
}

function classCard(card, names, valueOf, valueCell, stats) {
  const c = sourceClasses().get(card.cls);
  const has = (k) => names.includes(k);
  const insts = names.filter((k) => k !== 'self'
    && typeof valueOf(k) === 'string' && valueOf(k).startsWith(`${card.cls} instance {`));
  let head = `class <b>${escapeHtml(card.cls)}</b>`;
  if (card.provisional) head += ' <span class="cc-note">(defining…)</span>';
  if (insts.length) head += ` <span class="cc-note">· instances: ${escapeHtml(insts.join(', '))}</span>`;
  const rows = [];
  for (const a of c.attrs) {
    if (has(a)) rows.push(`<tr><td class="k">${escapeHtml(a)}</td><td class="v">${valueCell(a)}</td></tr>`);
  }
  for (const m of c.methods) {
    // A provisional card lists only the methods defined so far.
    if (card.provisional && !has(m.name)) continue;
    const meta = state.defs.fns[m.qn];
    const live = stats.live.get(meta.line);
    const tr = live ? `<tr class="fn-row-${live}">` : '<tr>';
    rows.push(`${tr}<td class="k">${escapeHtml(m.name + (meta.sig ?? '(?)'))}</td><td class="v">${fnFacts(meta, stats)}</td></tr>`);
  }
  const body = rows.length ? `<table>${rows.join('')}</table>` : '';
  const tip = typeof valueOf(card.cls) === 'string' ? ` title="${attrEsc(valueOf(card.cls))}"` : '';
  return `<tr><td class="cc"><div class="ccard"${tip}><div class="cc-head">${head}</div>${body}</div></td></tr>`;
}

// defs entry for a function row's value ("Stack.push(self, item)" -> the
// "Stack.push" entry), or null for data and functions outside the source.
function fnMeta(v) {
  if (typeof v !== 'string' || !looksLikeDefinition(v) || looksLikeClass(v)) return null;
  const qn = (/^([A-Za-z_<>][\w.<>]*)\(/.exec(v) || [])[1];
  const fns = (state.defs && state.defs.fns) || {};
  return qn && hasOwnKey(fns, qn) ? fns[qn] : null;
}

// Call facts per def line, derived from steps 0..idx so rewinds are exact
// (Q2, Q8–Q10). Frames match rows by `sig` (= co_firstlineno = defs line);
// counts are class totals across instances (Q10).
//   byLine: line -> { calls, out: {value} | {exc} | null }
//   live:   line -> 'run' (innermost frame) | 'wait' (a caller below it)
function callStats() {
  const byLine = new Map();
  const lineOf = new Map();   // frame id -> def line
  const last = Math.min(state.idx, state.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = state.steps[i];
    for (const e of st.stack || []) {
      // The module frame (id 0, or numbered by its call event) has sig 1 —
      // it would collide with a def on line 1.
      if (!e.id || e.fn === '<module>' || lineOf.has(e.id)) continue;
      lineOf.set(e.id, e.sig);
      if (!byLine.has(e.sig)) byLine.set(e.sig, { calls: 0, out: null });
      byLine.get(e.sig).calls++;
    }
    for (const r of st.ret || []) {
      if (lineOf.has(r.id)) byLine.get(lineOf.get(r.id)).out = { value: r.value };
    }
    for (const x of st.exc || []) {
      if (lineOf.has(x.id)) byLine.get(lineOf.get(x.id)).out = { exc: x.exc };
    }
  }
  const live = new Map();
  const cur = state.steps[last];
  if (cur && !cur.finished) {
    const frames = (cur.stack || []).filter((e) => e.id && e.fn !== '<module>');
    for (const e of frames) live.set(e.sig, 'wait');
    if (frames.length) live.set(frames[frames.length - 1].sig, 'run');
  }
  return { byLine, live };
}

function fnFacts(meta, stats) {
  const s = stats.byLine.get(meta.line);
  const mark = stats.live.get(meta.line);
  let h = '';
  if (mark === 'run') h += '<span class="fn-live fn-run">▶ running</span>';
  if (mark === 'wait') h += '<span class="fn-live fn-wait">waiting</span>';
  h += `<span class="fn-calls">×${s ? s.calls : 0}</span>`;
  if (s && s.out && s.out.exc) {
    h += `<span class="fn-exc">✗ ${escapeHtml(s.out.exc)}</span>`;
  } else if (s && s.out && s.out.value !== null && s.out.value !== undefined) {
    const full = fmtValue(s.out.value);
    const short = full.length > MEM_TRUNC ? full.slice(0, MEM_TRUNC) + '…' : full;
    h += `<span class="fn-ret" title="${attrEsc(full)}">→ ${escapeHtml(short)}</span>`;
  }
  return h;
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
