/* ═══════════════ Output-pane registry ═══════════════
   Every algorithm tab (recursion tree, stack, two-pointers family) registers
   one descriptor here. Adding a visualiser is now:

     1. create the pane module and call registerPane({...}) in it;
     2. add that module's import to panes.js (the barrel).

   output.js, shared.js, runner.js, dom.js and index.html never enumerate
   panes again: this registry owns tab/body creation, visibility, click
   wiring, latch resets and the one-time engage scan.

   Descriptor fields:
     id      unique value stored in state.outTab (e.g. 'tree')
     label   tab caption; used when the tab element is created on demand
     family  DSA family that owns the pane (see config.dsaFamily)
     mode    optional exact DSA id; omitted = the family's default pane
     tabId   existing tab element id (default 'tab-<id>')
     bodyId  existing body element id (default 'body-<id>')
     latch   state field for the one-time auto-engage (optional)
     render  draws the pane body; tab/body visibility is handled here
     engage  optional { detect, tab } — jump once to the first step the
             detector recognizes, switching to `tab` when given
*/

import { state } from '../state.js';
import { els } from '../dom.js';
import { dsaFamily } from '../config.js';

const PANES = [];
const REFS = new Map();   // pane id -> { tab, body } (resolved/created once)
let selectHandler = null; // installed by output.js; late registrations wire too

export { PANES };

export function registerPane(descriptor) {
  if (PANES.some((p) => p.id === descriptor.id)) return;
  PANES.push(descriptor);
  if (selectHandler) wirePaneTab(descriptor);
}

// Install the "user clicked a pane tab" action and wire every pane registered
// so far. registerPane wires panes added later, so the registry is the single
// owner of tab click behavior.
export function wirePaneTabs(onSelect) {
  selectHandler = onSelect;
  for (const pane of PANES) wirePaneTab(pane);
}

function wirePaneTab(pane) {
  const { tab } = paneRefs(pane);
  if (tab.dataset.paneWired) return;
  tab.dataset.paneWired = '1';
  tab.addEventListener('click', () => selectHandler && selectHandler(pane));
}

// Registered panes (extension point for tooling/tests).
export function panes() {
  return PANES;
}

// The pane that owns `mode`: an exact sub-mode match wins, otherwise the
// family's default (mode-less) pane. Returns null for families with no pane.
export function activePaneFor(mode = state.dsaMode) {
  for (const pane of PANES) {
    if (pane.mode && pane.mode === mode) return pane;
  }
  const family = dsaFamily(mode);
  return PANES.find((pane) => !pane.mode && pane.family === family) || null;
}

// Resolve a pane's tab/body, creating them on demand. Existing markup keeps
// its shipped ids; future panes need no index.html/dom.js edits.
export function paneRefs(pane) {
  const cached = REFS.get(pane.id);
  if (cached) return cached;

  const tabId = pane.tabId || `tab-${pane.id}`;
  const bodyId = pane.bodyId || `body-${pane.id}`;

  let tab = document.getElementById(tabId);
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.id = tabId;
    tab.textContent = pane.label;
    tab.hidden = true;
    els.outTabs.appendChild(tab);
  }

  let body = document.getElementById(bodyId);
  if (!body) {
    body = document.createElement('div');
    body.id = bodyId;
    body.hidden = true;
    els.outTabs.parentElement.appendChild(body);
  }

  const refs = { tab, body };
  REFS.set(pane.id, refs);
  return refs;
}

// Clear every pane's one-time engage latch. Runtime-created keys mean a new
// pane needs no state.js edit.
export function resetPaneState() {
  for (const pane of PANES) {
    if (pane.latch) state[pane.latch] = false;
  }
}

// Plain output: no tab bar, no algorithm body.
export function hideAllPanes() {
  els.output.hidden = false;
  els.tabOut.classList.remove('active');
  for (const pane of PANES) {
    const { tab, body } = paneRefs(pane);
    tab.hidden = true;
    tab.classList.remove('active');
    body.hidden = true;
  }
}

// Show only the active pane's tab, and its body only while state.outTab
// selects it. Called before AND after the renderer (legacy tree/stack panes
// may switch outTab during their first render).
export function applyPaneVisibility(active) {
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.output.hidden = state.outTab !== 'out';
  for (const pane of PANES) {
    const { tab, body } = paneRefs(pane);
    const selected = pane === active && state.outTab === pane.id;
    tab.hidden = pane !== active;
    tab.classList.toggle('active', selected);
    body.hidden = !selected;
  }
}

// One-time engage before a render: jump to the first step the detector
// recognizes and, for sub-mode panes, switch to the pane's tab.
export function engageActivePane(mode = state.dsaMode) {
  const pane = activePaneFor(mode);
  if (!pane || !pane.engage) return;
  engagePane(pane.engage.detect, pane.latch, pane.engage.tab || null);
}

function engagePane(detect, latchKey, tab) {
  if (!state.steps.length || state.userTab || state[latchKey]) return;
  // Terminal runs must stay on their last step: runner.js puts a runtime error
  // or limit stop there, and renderOutput() only prints that message at the
  // final index. Consume the latch without jumping so later navigation in
  // this run is not hijacked by a pending engage (2026-11-23 fix).
  if (state.programError || state.stoppedRun) {
    state[latchKey] = true;
    return;
  }
  const hit = (i) => detect(state.steps[i]?.locals || {});
  const at = hit(state.idx) ? state.idx : state.steps.findIndex((_, i) => hit(i));
  if (at < 0) return;
  state.idx = at;
  state[latchKey] = true;
  if (tab) state.outTab = tab;
}
