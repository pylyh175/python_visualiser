/* ═══════════════ Output-panel shared helpers ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';

// Shared "no tab family" layout: plain output, all panels hidden, tab state
// reset. `mode` is recorded (full DSA id, matching state.outFam's semantics)
// so a later render with the same mode doesn't re-reset (and undo a manual
// tab choice) spuriously.
export function hideOutTabsAll(mode) {
  els.outTabs.hidden = true;
  els.outTitle.hidden = false;
  els.output.hidden = false;
  els.treeBody.hidden = true;
  els.stackBody.hidden = true;
  els.twoPtrsBody.hidden = true;
  els.reverseBody.hidden = true;
  state.outTab = 'out'; state.userTab = false;
  state.treeAnnounced = false; state.stackAnnounced = false;
  state.reverseAnnounced = false;
  state.outFam = mode || 'none';
}
