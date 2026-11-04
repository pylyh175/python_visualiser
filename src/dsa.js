/* ═══════════════ DSA mode dropdown (hierarchical, CSS-hover driven) ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { DSA_MODES, DSA_STORE_KEY, dsaEntryById } from './config.js';
import { render } from './panels/output.js';

// Build the hierarchical dropdown from the registry — index.html ships an
// empty wrapper, so the option tree lives in exactly one place: adding a
// future category or sub-algorithm means adding one registry entry.
// Open/close is pure CSS (:hover for the pointer, :focus-within for the
// keyboard — see style.css); JS handles selection, persistence and accepts
// nothing about visibility. Mode dispatch goes through state.dsaMode (an id
// like 'stack' or 'two-pointers.two-sum'); the trigger label is a cosmetic
// breadcrumb only (2026-11-04 dropdown grill, Q1/Q2).
export function buildDsaMenu() {
  const options = els.dsaOptions;
  const trigger = els.dsaTrigger;
  if (!options || !trigger) return;

  options.innerHTML = '';
  for (const mode of DSA_MODES) {
    const li = document.createElement('li');
    const suffix = mode.status === 'planned' ? ' (planned)' : '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = mode.label + suffix;
    // The parent row stays selectable (grilled: Q4b) — clicking it picks the
    // generic mode (e.g. plain auto-detected 'two-pointers') exactly as today.
    btn.dataset.value = mode.id;
    li.appendChild(btn);

    if (mode.subModes && mode.subModes.length) {
      li.classList.add('has-submenu');
      btn.setAttribute('aria-haspopup', 'true');
      const submenu = document.createElement('ul');
      submenu.className = 'dsa-submenu';
      for (const sub of mode.subModes) {
        const subLi = document.createElement('li');
        const subBtn = document.createElement('button');
        subBtn.type = 'button';
        subBtn.textContent = sub.label;
        subBtn.dataset.value = sub.id;
        subLi.appendChild(subBtn);
        submenu.appendChild(subLi);
      }
      li.appendChild(submenu);
    }
    options.appendChild(li);
  }

  // Restore the saved id only when it is still a known slot — a flat check
  // that includes sub-mode ids; anything else falls back to the blank default
  // (an entry removed from the registry must never resurrect itself).
  let saved = null;
  try { saved = localStorage.getItem(DSA_STORE_KEY); } catch (err) { /* storage unavailable */ }
  const known = (id) => DSA_MODES.some((m) => m.id === id)
    || DSA_MODES.some((m) => (m.subModes || []).some((s) => s.id === id));
  selectDsaOption(known(saved) ? saved : 'none');

  // Selection: any leaf — top-level or sub-mode. The click handler is the only
  // JS the menu needs; hover visibility, submenu placement and the
  // cursor-bridge between parent row and submenu are all style.css.
  options.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    selectDsaOption(btn.dataset.value);
    trigger.focus();   // close via :focus-within dropping off the menu
  });

  // Escape hands focus back to the trigger, closing BOTH levels at once.
  options.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') trigger.focus();
  });
}

// Resolve the full id against the registry (flat, sub-modes included),
// update state + breadcrumb label + persistence, then re-render a live trace
// under the new mode immediately.
function selectDsaOption(id) {
  const entry = dsaEntryById(id);
  state.dsaMode = entry.id;

  // Breadcrumb: "Two Pointers › Two Sum" for sub-modes, plain label otherwise.
  const parent = DSA_MODES.find((m) => (m.subModes || []).some((s) => s.id === entry.id));
  if (els.dsaLabel) {
    els.dsaLabel.textContent = parent ? `${parent.label} › ${entry.label}` : entry.label;
  }

  try { localStorage.setItem(DSA_STORE_KEY, entry.id); } catch (err) { /* storage unavailable */ }

  // Highlight exactly the selected id (the generic parent and its sub-modes
  // are distinct selections — picking 'Two Sum' does not light up 'Two Pointers').
  document.querySelectorAll('#dsaOptions button[data-value]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === entry.id);
  });

  if (els.status && entry.status !== 'ready' && !state.runInProgress) {
    els.status.textContent = `${entry.label} visualisation is planned — code runs as usual`;
  }

  // A live trace re-renders under the new mode immediately.
  if (state.steps.length && !state.runInProgress) render();
}
