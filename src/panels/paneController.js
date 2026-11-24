/* ═══════════════ Output-pane controller: per-run state + panel rendering ═══════════════
   One owner for the output pane family's per-run state and DOM. Panels read
   state.panes and call announceOnce()/hideOutputPanes(); none of them resets
   another pane's latch. Adding a visualiser still only needs its module + the
   panes.js barrel import — the announced map is keyed at runtime by pane id.
*/

import { state } from '../state.js';
import { els } from '../dom.js';
import {
  activePaneFor, applyPaneVisibility, hideAllPanes, wirePaneTabs,
} from './registry.js';
import './panes.js';   // installs every visualiser's registry descriptor

// Back to a clean pane slate for a new run: plain Output, no manual choice, no
// one-time latch spent, no frozen frame carried over.
export function resetPaneRun() {
  const panes = state.panes;
  panes.tab = 'out';
  panes.userSelected = false;
  panes.announced = {};
  panes.lastValidFrame = -1;
}

// Any DSA change (family OR sub-mode) resets the manual tab choice and the
// one-time announce latches. Idempotent: a no-op while the mode is unchanged.
export function syncPaneMode() {
  if (state.panes.mode === state.dsaMode) return;
  state.panes.mode = state.dsaMode;
  resetPaneRun();
}

// One-time auto-switch owned by a pane: the first step where `when` is truthy
// selects that pane unless the user already chose a tab. Returns whether the
// latch fired, so a renderer can tell the switch apart from a sticky choice.
export function announceOnce(paneId, when = true) {
  const panes = state.panes;
  if (!when || panes.userSelected || panes.announced[paneId]) return false;
  panes.announced[paneId] = true;
  panes.tab = paneId;
  return true;
}

// Every tab does the same thing: select its pane, remember that a human chose
// it (sticky until the run resets), then redraw.
export function selectPaneTab(tabId) {
  state.panes.tab = tabId;
  if (state.steps.length) state.panes.userSelected = true;
  renderOutputPanel();
}

// One-time engage before a render: jump to the first step the active pane's
// detector recognizes and, for sub-mode panes, switch to the pane's tab.
export function engagePanes(mode = state.dsaMode) {
  const pane = activePaneFor(mode);
  if (!pane || !pane.engage) return;
  const panes = state.panes;
  if (!state.steps.length || panes.userSelected || panes.announced[pane.id]) return;
  // Terminal runs must stay on their last step: runner.js puts a runtime error
  // or limit stop there, and renderOutput() only prints that message at the
  // final index. Consume the latch without jumping so later navigation in
  // this run is not hijacked by a pending engage (2026-11-23 fix).
  if (state.programError || state.stoppedRun) {
    panes.announced[pane.id] = true;
    return;
  }
  const { detect, tab } = pane.engage;
  const hit = (i) => detect(state.steps[i]?.locals || {});
  const at = hit(state.idx) ? state.idx : state.steps.findIndex((_, i) => hit(i));
  if (at < 0) return;
  state.idx = at;
  panes.announced[pane.id] = true;
  if (tab) panes.tab = tab;
}

// The panel shows the pane registered for the current DSA mode; the registry
// resolves it from the descriptor (family + optional exact sub-mode).
export function renderOutputPanel() {
  syncPaneMode();
  const active = activePaneFor(state.dsaMode);
  if (!state.steps.length || !active) {
    hideOutputPanes();
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  applyPaneVisibility(active);
  active.render();
  // Legacy panes may announce a tab switch during their first real render;
  // re-apply so the tab bar and bodies agree with the settled state.
  applyPaneVisibility(active);
}

// Plain output: no tab bar, no algorithm body, a clean pane slate for the mode
// being shown. Recording the mode means a later render with the same mode does
// not reset again (and undo a manual tab choice) spuriously.
export function hideOutputPanes(mode = state.dsaMode) {
  els.outTabs.hidden = true;
  els.outTitle.hidden = false;
  hideAllPanes();
  resetPaneRun();
  state.panes.mode = mode || 'none';
}

// Every tab — Output and every registered pane — funnels through one action.
// Wiring comes from the registry, so a new pane needs no new listener here.
els.tabOut.addEventListener('click', () => selectPaneTab('out'));
wirePaneTabs((pane) => selectPaneTab(pane.id));
