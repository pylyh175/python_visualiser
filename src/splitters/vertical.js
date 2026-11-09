/* ═══════════════ Splitter: variables ↔ output panel height ═══════════════ */

import { els } from '../dom.js';
import { MIN_VARS, OUT_BODY_MIN } from '../config.js';
import { syncScroll } from '../editor/render.js';

// Clamp a requested variables-panel height to what the column can hold.
export function applyVarsHeight(px) {
  const right = els.right.getBoundingClientRect();
  const gap = 12;                  // #right's row-gap (applies on both sides)
  // Output floor: its header + tabs (0 when hidden) + the 80px body floor.
  const outMin = els.outTitle.offsetHeight + els.outTabs.offsetHeight + OUT_BODY_MIN;
  const avail = right.height - gap * 2 - outMin;
  const h = Math.min(Math.max(px, MIN_VARS), Math.max(MIN_VARS, avail));
  els.varsPanel.style.height = h + 'px';
  // The drag's inline height must win over the CSS default flex-basis.
  els.varsPanel.style.maxHeight = 'none';
  syncScroll();
  return h;
}

export function initVarsSplitter() {
  // Default layout is the CSS fixed 50/50 split (style.css#varsPanel).
  // Resizes are session-only: no persistence — every fresh load re-applies
  // the default, double-click re-applies it too.

  let dragging = false;

  els.vdivider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    els.vdivider.setPointerCapture(e.pointerId);
    els.vdivider.classList.add('dragging');
    document.body.classList.add('resizing-v');
  });

  els.vdivider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // Height spans from the pointer up to the panel's top edge.
    applyVarsHeight(e.clientY - els.varsPanel.getBoundingClientRect().top);
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    els.vdivider.classList.remove('dragging');
    document.body.classList.remove('resizing-v');
    try { els.vdivider.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };
  els.vdivider.addEventListener('pointerup', endDrag);
  els.vdivider.addEventListener('pointercancel', endDrag);

  // Double-click returns to the default fixed 50/50 split (clears the
  // inline height; the CSS default re-takes over).
  els.vdivider.addEventListener('dblclick', () => {
    els.varsPanel.style.height = '';
    els.varsPanel.style.maxHeight = '';
    syncScroll();
  });

  // The CSS 50/50 default adapts to window resizes on its own; only a
  // user-set inline height needs re-clamping.
  window.addEventListener('resize', () => {
    if (els.varsPanel.style.height) {
      applyVarsHeight(els.varsPanel.getBoundingClientRect().height);
    }
  });
}
