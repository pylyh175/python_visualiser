/* ═══════════════ DSA mode dropdown (hierarchical, CSS-hover driven) ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { DSA_MODES, DSA_STORE_KEY, dsaEntryById, DSA_DEFAULT_CODE, DEFAULT_CODE } from './config.js';
import { render } from './panels/output.js';
import { renderEditor } from './editor/render.js';
import { stopPlayback } from './navigation/play.js';

// The template currently filling the editor (per-mode defaults, grilled
// Q1–Q6 2026-11-07). When a new mode is picked, the editor swaps ONLY if it
// still holds this exact default — user code is never overwritten.
let lastLoadedDefault = DEFAULT_CODE;

// Build the hierarchical dropdown from the registry — index.html ships an
// empty wrapper, so the option tree lives in exactly one place: adding a
// future category or sub-algorithm means adding one registry entry.
// Open/close is still pure CSS (:hover for the pointer, :focus-within for the
// keyboard — see style.css); JS adds one `dsa-suppressed` class after a pick
// so the panel collapses instead of staying under the pointer/focus, then
// clears it when the user re-arms (pointer leave, trigger click/key/focus).
// Mode dispatch goes through state.dsaMode (an id like 'stack' or
// 'two-pointers.two-sum'); the trigger label is a cosmetic breadcrumb only
// (2026-11-04 dropdown grill, Q1/Q2; collapse-after-pick 2026-11-27 Q1–Q6).
export function buildDsaMenu() {
  const options = els.dsaOptions;
  const trigger = els.dsaTrigger;
  const dropdown = els.dsaDropdown || (trigger && trigger.closest('.dsa-dropdown'));
  if (!options || !trigger || !dropdown) return;

  options.innerHTML = '';
  for (const mode of DSA_MODES) {
    const li = document.createElement('li');
    const suffix = mode.status === 'planned' ? ' (planned)' : '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = mode.label + suffix;
    // Pure folders (grilled 2026-11-05, Q1–Q3: the 'DSA' grouping) carry no
    // value — clicking them does nothing; hover/focus still expands the
    // submenu. Selectable parents (grilled 2026-11-04 Q4b, e.g.
    // 'two-pointers') keep their generic mode: clicking it picks it as today.
    if (!mode.folder) {
      btn.dataset.value = mode.id;
    } else {
      li.classList.add('dsa-folder');
    }
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
        // Sub-mode leaves carry their own suffix (Q5): Queue / Linked List
        // read '(planned)' in the menu, Stack reads plain.
        subBtn.textContent = sub.label + (sub.status === 'planned' ? ' (planned)' : '');
        subBtn.dataset.value = sub.id;
        subLi.appendChild(subBtn);
        submenu.appendChild(subLi);
      }
      li.appendChild(submenu);
      // Long sub-menus scroll (style.css cap): every fresh open starts at the
      // top, then centres the selected row, so a reopened flyout lands on the
      // current choice instead of an arbitrary offset. Pointer entry and
      // focus on the parent row are the only "fresh open" moments — tabbing
      // between submenu items must not yank the list back.
      const prepareSubmenu = () => {
        requestAnimationFrame(() => {
          if (!submenu.clientHeight) return;   // closed again before the frame
          // CSS caps at min(360px, 60vh); on a short window a lower parent row
          // could still push the flyout past the bottom edge, so tighten it to
          // the room left below its anchor. Recomputed on every open, because
          // the anchor row and the window height both vary.
          const rect = submenu.getBoundingClientRect();
          const room = window.innerHeight - rect.top - 8;
          if (rect.bottom > window.innerHeight && room > 0) {
            submenu.style.maxHeight = `${Math.min(360, window.innerHeight * 0.6, room)}px`;
          } else {
            submenu.style.removeProperty('max-height');
          }
          const active = submenu.querySelector('button.active');
          if (!active) { submenu.scrollTop = 0; return; }
          // Rows inside the flyout are position:relative too (.dsa-options li),
          // so offsetTop is row-local. Use viewport rects: the delta already
          // includes the list's current scroll offset.
          const delta = active.getBoundingClientRect().top - submenu.getBoundingClientRect().top;
          submenu.scrollTop += delta - (submenu.clientHeight - active.offsetHeight) / 2;
        });
      };
      li.addEventListener('mouseenter', prepareSubmenu);
      btn.addEventListener('focus', prepareSubmenu);
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

  // ── Collapse after a selection (2026-11-27 grilled Q1–Q6) ──
  // Visibility stays CSS; this class only blocks the :hover/:focus-within
  // open rules, so the existing hover, caret and submenu behaviour is intact.
  // Re-arming (Q2/Q3): a pointer pick drops focus, so leaving the dropdown
  // clears the flag and hovering back opens it; a keyboard pick keeps focus
  // on the trigger, and a click / Enter / Space / Arrow key re-opens.
  const setExpanded = (open) => {
    const value = open ? 'true' : 'false';
    dropdown.setAttribute('aria-expanded', value);
    trigger.setAttribute('aria-expanded', value);
  };
  const release = () => dropdown.classList.remove('dsa-suppressed');
  const suppress = () => {
    dropdown.classList.add('dsa-suppressed');
    setExpanded(false);
  };

  // aria-expanded mirrors what CSS is already showing (Q4). Pointer leave
  // closes the hover-open menu; when focus is still inside (keyboard user's
  // place) the menu legitimately stays open, so neither flag nor aria moves.
  dropdown.addEventListener('mouseenter', () => {
    if (!dropdown.classList.contains('dsa-suppressed')) setExpanded(true);
  });
  dropdown.addEventListener('mouseleave', () => {
    if (!dropdown.contains(document.activeElement)) {
      release();
      setExpanded(false);
    }
  });
  // Focus left the whole control (Tab, Shift+Tab, click into the editor):
  // re-arm so the next focus can open the menu again.
  dropdown.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !dropdown.contains(e.relatedTarget)) release();
  });
  // Arriving from elsewhere re-arms. A programmatic focus after a keyboard
  // pick runs BEFORE suppress(), so this cannot reopen that menu.
  trigger.addEventListener('focus', () => {
    release();
    setExpanded(true);
  });
  trigger.addEventListener('click', () => {
    release();
    setExpanded(true);
  });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      release();
      setExpanded(true);
    }
  });

  // Selection: any leaf — top-level or sub-mode. A pure-folder row has no
  // data-value, so clicking it keeps the flyout open (nothing was selected).
  options.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    const pointer = e.detail > 0;   // keyboard activation reports detail 0
    selectDsaOption(btn.dataset.value);
    if (pointer) {
      if (dropdown.contains(document.activeElement)) document.activeElement.blur();
    } else {
      trigger.focus();
    }
    suppress();
  });

  // Escape hands focus back to the trigger and collapses BOTH levels.
  options.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    trigger.focus();   // closes the submenu (focus leaves its row)
    suppress();        // closes the first level too, keyboard-first
  });

  setExpanded(false);
}

// Resolve the full id against the registry (flat, sub-modes included),
// update state + breadcrumb label + persistence, then re-render a live trace
// under the new mode immediately.
function selectDsaOption(id) {
  const entry = dsaEntryById(id);
  state.dsaMode = entry.id;
  stopPlayback();   // a mode swap hard-stops auto-play even if the trace survives (grilled Q10)

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

  // Status pill on selection (2026-11-06 user report: implemented two-pointers
  // sub-modes showed "planned" because the guard tested !== 'ready' while they
  // carry NO status field at all). Whitelist 'planned' instead — future
  // implemented sub-modes default-correct without registry boilerplate — and
  // confirm implemented modes explicitly. (none) stays silent: no visualiser
  // exists to be "ready". The pill is never stomped mid-run.
  if (els.status && !state.runInProgress) {
    if (entry.status === 'planned') {
      els.status.textContent = `${entry.label} visualisation is planned — code runs as usual`;
    } else if (entry.id !== 'none') {
      els.status.textContent = `${entry.label} visualisation is ready — run your code`;
    }
  }

  // Per-mode default code (2026-11-07 design, grilled Q1–Q6): '(none)' and
  // implemented modes without a template fall back to DEFAULT_CODE; planned
  // modes get their template if one exists, else a placeholder comment. The
  // swap only happens when the editor still holds the previous template
  // (stale default) — normalize is defined
  // BEFORE its first use (the previous session's bug: TDZ ReferenceError).
  const normalize = (s) => s.replace(/\r\n/g, '\n').trim();
  let newDefault = (entry.id === 'none' || !DSA_DEFAULT_CODE[entry.id])
    ? DEFAULT_CODE
    : DSA_DEFAULT_CODE[entry.id];
  if (entry.status === 'planned' && !DSA_DEFAULT_CODE[entry.id]) {
    newDefault = `# ${entry.label} visualisation is planned — implement your code here`;
  }
  if (normalize(els.textarea.value) === normalize(lastLoadedDefault)) {
    els.textarea.value = newDefault;
    lastLoadedDefault = newDefault;
    // A programmatic value write fires no 'input' event, so the highlighted
    // mirror behind the textarea keeps showing the previous code (visible
    // only before the first Visualize — afterwards render() rebuilds it).
    // Rebuild the mirror now, exactly like the boot writer's render() pass.
    renderEditor();
  }

  // A live trace re-renders under the new mode immediately.
  if (state.steps.length && !state.runInProgress) render();
}
