/* ═══════════════ Variables display options (header dropdown menu) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { setIdx } from '../navigation/steps.js';

// The Variables panel's display options live in a dropdown beside the panel
// title (2026-11-16, grilled Q1–Q6): a "Display ▾" trigger at the right end
// of the header row opens a menu of checkboxes. Ticking a checkbox applies
// immediately (the current step re-renders — display-only, no re-run, safe
// mid-playback) and the menu stays open, so several options can be tweaked
// in one go. Outside click, Escape or re-clicking the trigger closes it.

// The registry: one entry per display option. Adding a future option is one
// push here (or one addDisplayOption call at runtime) — the menu rows, the
// persistence and the els wiring all come from this data; no menu, CSS or
// wiring changes (grilled Q5).
//   key   — localStorage key under which the '1'/'0' preference is stored
//   id    — element id of the checkbox; the render side reads els[id].checked
//   label — the row's visible text
const OPTIONS = [
  { key: 'viz2d', id: 'vars2d', label: 'Render list of lists as 2D array' },
];

// Runtime extension point (the same contract as a registry entry): push the
// option and call initDisplayOptions() again to rebuild the menu.
export function addDisplayOption(entry) {
  OPTIONS.push(entry);
}

// (Re)build the menu rows from the registry. Idempotent: called again after
// registry changes, it rebuilds from scratch — no duplicate rows. Each
// checkbox restores its saved preference and owns its save + re-render
// wiring; els[id] is (re)assigned so the render side keeps reading the same
// handle it always has (mem2dEnabled reads els.vars2d — mechanism unchanged,
// grilled Q6). Same try/catch discipline as theme.js: storage-blocked
// sessions just lose the persistence.
function buildMenu() {
  const menu = els.varsDisplayMenu;
  const btn = els.varsDisplayBtn;
  if (!menu || !btn) return;
  menu.innerHTML = '';
  OPTIONS.forEach((opt) => {
    const row = document.createElement('label');
    row.className = 'vars-display-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = opt.id;
    let saved = null;
    try { saved = localStorage.getItem(opt.key); } catch (err) { /* storage unavailable */ }
    box.checked = saved === '1';
    box.addEventListener('change', () => {
      try { localStorage.setItem(opt.key, box.checked ? '1' : '0'); } catch (err) { /* ignore */ }
      setIdx(state.idx);   // re-render the CURRENT step only
    });
    row.appendChild(box);
    row.appendChild(document.createTextNode(opt.label));
    menu.appendChild(row);
    els[opt.id] = box;
  });
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

// Build the rows, then wire the open/close behaviour exactly once (rebuilds
// must not stack duplicate listeners). Clicking the trigger toggles; a click
// inside the menu (ticking a checkbox) or on the trigger itself never
// reaches the outside-click closer, and Escape closes an open menu.
let wired = false;

export function initDisplayOptions() {
  const menu = els.varsDisplayMenu;
  const btn = els.varsDisplayBtn;
  if (!menu || !btn) return;
  buildMenu();
  if (wired) return;
  wired = true;
  btn.addEventListener('click', () => {
    const closing = !menu.hidden;
    menu.hidden = closing;
    btn.setAttribute('aria-expanded', closing ? 'false' : 'true');
  });
  document.addEventListener('click', (e) => {
    if (menu.hidden || btn.contains(e.target) || menu.contains(e.target)) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}
