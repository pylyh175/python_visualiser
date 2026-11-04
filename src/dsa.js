/* ═══════════════ DSA mode dropdown with hover submenu ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { DSA_MODES, DSA_STORE_KEY } from './config.js';
import { render } from './panels/output.js';

// Build the custom dropdown with hover submenu from the registry.
// index.html ships an empty wrapper, so the option list lives in exactly one place.
// The persisted choice is restored only when it is still a known id.
// Sub-modes use dot notation: parent.submode (e.g., 'two-pointers.remove-duplicate').
export function buildDsaMenu() {
  const options = document.getElementById('dsaOptions');
  const trigger = document.getElementById('dsaTrigger');
  const label = document.getElementById('dsaLabel');

  if (!options || !trigger || !label) return;

  // Clear existing options
  options.innerHTML = '';

  // Build options from registry
  for (const mode of DSA_MODES) {
    const li = document.createElement('li');

    if (mode.subModes && mode.subModes.length > 0) {
      // Parent with submenu
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = mode.label;
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-haspopup', 'true');
      li.appendChild(btn);

      const submenu = document.createElement('ul');
      submenu.className = 'dsa-submenu';
      submenu.setAttribute('role', 'menu');
      for (const sub of mode.subModes) {
        const subLi = document.createElement('li');
        const subBtn = document.createElement('button');
        subBtn.type = 'button';
        subBtn.textContent = sub.label;
        subBtn.setAttribute('role', 'menuitem');
        subBtn.dataset.value = sub.id;
        subLi.appendChild(subBtn);
        submenu.appendChild(subLi);
      }
      li.appendChild(submenu);
      li.classList.add('has-submenu');
    } else {
      // Leaf option
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = mode.status === 'planned' ? mode.label + ' (planned)' : mode.label;
      btn.setAttribute('role', 'menuitem');
      btn.dataset.value = mode.id;
      li.appendChild(btn);
    }
    options.appendChild(li);
  }

  // Restore saved selection
  let saved = null;
  try { saved = localStorage.getItem(DSA_STORE_KEY); } catch (err) { /* storage unavailable */ }
  const savedId = DSA_MODES.some((m) => m.id === saved) ? saved : 'none';
  selectDsaOption(savedId);

  // Dropdown toggle - click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !options.hidden;
    options.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', !isOpen);
  });

  // Dropdown hover - show on hover
  const dropdown = document.getElementById('dsaDropdown');
  dropdown.addEventListener('mouseenter', () => {
    options.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  });
  dropdown.addEventListener('mouseleave', (e) => {
    // Only hide if not moving to the options
    if (!e.relatedTarget || !options.contains(e.relatedTarget)) {
      options.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  // Keep open when hovering over options
  options.addEventListener('mouseenter', () => {
    options.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  });
  options.addEventListener('mouseleave', () => {
    options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  // Option selection
  options.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    const value = btn.dataset.value;
    selectDsaOption(value);
    options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  // Keyboard navigation
  options.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      options.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });
}

// Select a DSA option by its full ID (e.g., 'two-pointers.remove-duplicate')
function selectDsaOption(id) {
  const mode = DSA_MODES.find((m) => m.id === id) || DSA_MODES[0];
  const label = document.getElementById('dsaLabel');
  if (label) label.textContent = mode.status === 'planned' ? mode.label + ' (planned)' : mode.label;

  // Persist
  try { localStorage.setItem(DSA_STORE_KEY, mode.id); } catch (err) { /* storage unavailable */ }

  // Update active state in dropdown
  document.querySelectorAll('#dsaOptions button[data-value]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === id);
  });

  // Update status hint
  const status = document.getElementById('status');
  if (status && mode.status !== 'ready' && !state.runInProgress) {
    status.textContent = `${mode.label} visualisation is planned — code runs as usual`;
  }

  // A live trace re-renders under the new mode immediately
  if (state.steps.length && !state.runInProgress) render();
}
