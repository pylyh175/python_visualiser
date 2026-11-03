/* ═══════════════ DSA mode dropdown (registry-driven) ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { DSA_MODES, DSA_STORE_KEY } from './config.js';
import { render } from './panels/output.js';

// Build the mode dropdown from the registry — index.html ships an empty
// <select>, so the option list lives in exactly one place. The persisted
// choice is restored only when it is still a known id (an entry removed from
// the registry would otherwise leave the select showing a nameless value).
// Manual changes persist immediately; a not-yet-implemented mode only gets
// an honest status hint — the run flow itself never changes, and Recursion
// keeps working exactly as it did, automatic and mode-independent.
export function buildDsaMenu() {
  for (const mode of DSA_MODES) {
    const opt = document.createElement('option');
    opt.value = mode.id;
    opt.textContent = mode.status === 'planned' ? mode.label + ' (planned)' : mode.label;
    els.dsaMode.appendChild(opt);
  }
  let saved = null;
  try { saved = localStorage.getItem(DSA_STORE_KEY); } catch (err) { /* storage unavailable */ }
  els.dsaMode.value = DSA_MODES.some((m) => m.id === saved) ? saved : 'none';
  els.dsaMode.addEventListener('change', () => {
    const mode = DSA_MODES.find((m) => m.id === els.dsaMode.value) || DSA_MODES[0];
    try { localStorage.setItem(DSA_STORE_KEY, mode.id); } catch (err) { /* storage unavailable */ }
    if (mode.status !== 'ready' && !state.runInProgress) {
      els.status.textContent = `${mode.label} visualisation is planned — code runs as usual`;
    }
    // A live trace re-renders under the new mode immediately: switching to
    // Recursion applies the verdict/tab gating to the steps already navigated,
    // switching to Stack shows its tab family, back to (none) removes both.
    if (state.steps.length && !state.runInProgress) render();
  });
}
