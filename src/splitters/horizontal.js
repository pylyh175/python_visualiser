/* ═══════════════ Splitter: editor ↔ output column width ═══════════════ */

import { els } from '../dom.js';
import { MIN_RIGHT, MIN_LEFT } from '../config.js';
import { syncScroll } from '../editor/render.js';

// Clamp a requested output-column width to what the window can hold.
export function applyRightWidth(px) {
  const rect = els.main.getBoundingClientRect();
  const chrome = 24 /* main padding */ + 12 /* gaps */ + 8 /* divider */ + MIN_LEFT;
  const max = Math.max(MIN_RIGHT, rect.width - chrome);
  const w = Math.min(max, Math.max(MIN_RIGHT, px));
  els.right.style.width = w + 'px';
  // Resizing can change the textarea's scroll compartments; re-sync the mirror.
  syncScroll();
  return w;
}

export function initSplitter() {
  // Default layout is the CSS 50/50 half-guess (style.css#right). Resizes are
  // session-only: no persistence — every fresh load re-applies the default,
  // double-click re-applies it too.

  let dragging = false;

  els.divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    els.divider.setPointerCapture(e.pointerId);
    els.divider.classList.add('dragging');
    document.body.classList.add('resizing');
  });

  els.divider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyRightWidth(window.innerWidth - e.clientX - 12 /* gap to the right edge */);
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    els.divider.classList.remove('dragging');
    document.body.classList.remove('resizing');
    try { els.divider.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };
  els.divider.addEventListener('pointerup', endDrag);
  els.divider.addEventListener('pointercancel', endDrag);

  // Double-click returns to the default 50/50 split (clears the inline px;
  // the CSS default re-takes over).
  els.divider.addEventListener('dblclick', () => {
    els.right.style.width = '';
    syncScroll();
  });

  // The CSS 50/50 default adapts to window resizes on its own; only a
  // user-set inline width needs re-clamping.
  window.addEventListener('resize', () => {
    if (els.right.style.width) {
      applyRightWidth(els.right.getBoundingClientRect().width);
    }
  });
}
