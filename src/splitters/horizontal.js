/* ═══════════════ Splitter: editor ↔ output column width ═══════════════ */

import { els } from '../dom.js';
import { SPLIT_KEY, MIN_RIGHT, MIN_LEFT } from '../config.js';
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
  // Restore the width chosen in a previous session.
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  if (saved) applyRightWidth(saved);

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
    localStorage.setItem(SPLIT_KEY, String(els.right.getBoundingClientRect().width));
  };
  els.divider.addEventListener('pointerup', endDrag);
  els.divider.addEventListener('pointercancel', endDrag);

  // Double-click returns to the default split.
  els.divider.addEventListener('dblclick', () => {
    els.right.style.width = '';
    localStorage.removeItem(SPLIT_KEY);
    syncScroll();
  });

  // Keep the clamps honest when the window itself is resized.
  window.addEventListener('resize', () => {
    applyRightWidth(els.right.getBoundingClientRect().width);
  });
}
