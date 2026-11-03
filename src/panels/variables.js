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
  const names = varsOrder(vars);   // see varsOrder: slot of first appearance
  if (!names.length) {
    els.vars.innerHTML = '<span class="empty">(no variables)</span>';
    return;
  }
  const rows = names.map((k) =>
    `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(fmtValue(vars[k]))}</td></tr>`
  ).join('');
  els.vars.innerHTML = `<table>${rows}</table>`;
}

// Panel order: by first appearance in the trace so far. The layout rule
// (2026-11-02-vars-order-design.md): a name's slot is where it was first
// displayed; new names always append at the bottom, existing ones never
// reorder — even when they come from a nested frame whose snapshot layers
// them above the module's (the runner's innermost-first layering is display
// order no more). Slots derive from steps 0..idx only: forward steps extend
// the sequence, any rewind reproduces the earlier layout exactly. Names
// still shadow by value (innermost wins, as snapshot content is unchanged).
function varsOrder(current) {
  const slot = new Map();
  let seq = 0;
  for (let i = 0; i <= state.idx && i < state.steps.length; i++) {
    for (const k of Object.keys(state.steps[i].locals || {})) {
      if (!slot.has(k)) slot.set(k, seq++);
    }
  }
  // Names present now but never seen (cannot actually happen — steps[idx]
  // was just scanned — but the fallback keeps the row alive either way).
  return Object.keys(current).sort((a, b) =>
    (slot.get(a) ?? seq) - (slot.get(b) ?? seq));
}
