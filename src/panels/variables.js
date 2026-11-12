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
  let seq = 0;
  for (let i = 0; i <= state.idx && i < state.steps.length; i++) {
    for (const [k, v] of Object.entries(state.steps[i].locals || {})) {
      if (!slot.has(k)) slot.set(k, seq++);
      lastShown.set(k, v);
    }
  }
  return {
    names: [...slot.keys()].sort((a, b) => slot.get(a) - slot.get(b)),
    lastShown,
  };
}
