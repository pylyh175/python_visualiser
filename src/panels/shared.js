/* ═══════════════ Output-panel shared helpers ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';

// Shared "no tab family" layout: plain output, both panels hidden, tab
// state reset. `fam` is recorded so a later render with the same family
// doesn't re-reset (and undo a manual tab choice) spuriously.
export function hideOutTabsAll(fam) {
  els.outTabs.hidden = true;
  els.outTitle.hidden = false;
  els.output.hidden = false;
  els.treeBody.hidden = true;
  els.stackBody.hidden = true;
  state.outTab = 'out'; state.userTab = false;
  state.treeAnnounced = false; state.stackAnnounced = false;
  state.outFam = fam || 'none';
}
