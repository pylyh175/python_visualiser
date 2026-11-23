/* ═══════════════ Output-panel shared helpers ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { hideAllPanes, resetPaneState } from './registry.js';

// Shared "no tab family" layout: plain output, every pane hidden, tab state
// reset. Pane tabs/bodies come from the registry, so this covers new
// visualisers (including their latches) without edits. `mode` is recorded
// (full DSA id, matching state.outFam's semantics) so a later render with the
// same mode doesn't re-reset (and undo a manual tab choice) spuriously.
export function hideOutTabsAll(mode) {
  els.outTabs.hidden = true;
  els.outTitle.hidden = false;
  hideAllPanes();
  state.outTab = 'out'; state.userTab = false;
  resetPaneState();
  state.outFam = mode || 'none';
}
