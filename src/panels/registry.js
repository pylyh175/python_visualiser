/* ═══════════════ Output-pane registry ═══════════════
   Every algorithm tab (recursion tree, stack, two-pointers family) registers
   one descriptor here. Adding a visualiser is now:

     1. create the pane module and call registerPane({...}) in it;
     2. add that module's import to panes.js (the barrel).

   output.js, paneController.js, runner.js, dom.js and index.html never
   enumerate panes again: this registry owns tab/body creation, visibility and
   click wiring. Per-run state (tab choice, announce latches, engage) belongs
   to paneController.js.

   Descriptor fields:
     id      unique value stored in state.panes.tab (e.g. 'tree')
     label   tab caption; used when the tab element is created on demand
     family  DSA family that owns the pane (see config.dsaFamily)
     mode    optional exact DSA id; omitted = the family's default pane
     tabId   existing tab element id (default 'tab-<id>')
     bodyId  existing body element id (default 'body-<id>')
     render  draws the pane body; tab/body visibility is handled here
     engage  optional { detect, tab } — paneController jumps once to the
             first step the detector recognizes, switching to `tab` when given
*/

import { state } from '../state.js';
import { els } from '../dom.js';
import { dsaFamily } from '../config.js';

const PANES = [];
const REFS = new Map();   // pane id -> { tab, body } (resolved/created once)
let selectHandler = null; // installed by paneController.js; late registrations wire too

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

// Show only the active pane's tab, and its body only while state.panes.tab
// selects it. Called before AND after the renderer (legacy tree/stack panes
// may announce a tab switch during their first render).
export function applyPaneVisibility(active) {
  const selectedTab = state.panes.tab;
  els.tabOut.classList.toggle('active', selectedTab === 'out');
  els.output.hidden = selectedTab !== 'out';
  for (const pane of PANES) {
    const { tab, body } = paneRefs(pane);
    const selected = pane === active && selectedTab === pane.id;
    tab.hidden = pane !== active;
    tab.classList.toggle('active', selected);
    body.hidden = !selected;
  }
}
