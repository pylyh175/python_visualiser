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
  const { names, lastShown } = collectVars(vars);
  if (!names.length) {
    els.vars.innerHTML = '<span class="empty">(no variables)</span>';
    return;
  }
  const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const rows = names.map((k) =>
    `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(fmtValue(hasOwn(vars, k) ? vars[k] : lastShown.get(k)))}</td></tr>`
  ).join('');
  els.vars.innerHTML = `<table>${rows}</table>`;
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
// absent ones.
function collectVars(current) {
  const slot = new Map();
  const lastShown = new Map();
  const isDef = new Map();   // sticky: ever shown as a function/class
  let seq = 0;
  for (let i = 0; i <= state.idx && i < state.steps.length; i++) {
    for (const [k, v] of Object.entries(state.steps[i].locals || {})) {
      if (!slot.has(k)) slot.set(k, seq++);
      lastShown.set(k, v);
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
