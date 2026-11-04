/* ═══════════════ Editor lock & button enablement ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { HINT_DEFAULT } from './config.js';

// Visualize is only meaningful with code on the editor, and never while a
// run is still in flight (the user can keep typing during execution). The
// mode selection follows the same mid-run discipline as the Edit button:
// a mode change under a live run would be meaningless — and, once modules
// attach to modes, dangerous.
export function syncVisualizeEnabled() {
  els.visualize.disabled = state.runInProgress || !els.textarea.value.trim();
  els.dsaTrigger.disabled = state.runInProgress;
}

// Apply the editor lock: readOnly blocks direct typing (all programmatic
// edit paths check `locked` too, see the keydown guard), the faint tint and
// hint text make the state visible. The Edit button is only disabled while
// a run is in progress — after completion (locked=false, runInProgress=false)
// it becomes enabled so the user can start a new run for any algorithm.
export function applyLock() {
  els.textarea.readOnly = state.locked;
  els.edit.disabled = state.runInProgress;
  els.hint.textContent = state.locked ? 'Code locked — click ✎ Edit to modify' : HINT_DEFAULT;
}
