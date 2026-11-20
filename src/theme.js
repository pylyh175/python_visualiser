/* ═══════════════ Dark mode toggle with circular view-transition reveal (2026-11-20) ═══════════════
   STRATEGY: the ripple IS the theme change, not an overlay painted on top.
   On click we hand the theme swap to the View Transition API: the browser
   snapshots the current theme, applies the new one, then the new render is
   revealed by a clip-path circle expanding from the toggle button. Because
   the circle uncovers the REAL re-styled content, text/code/panels are never
   covered — each area flips to the incoming theme exactly as the ripple
   passes over it.

   Falling back to an instant swap when the API is unavailable (Firefox,
   older Safari) or when the user asks for reduced motion. */

import { els } from './dom.js';

const KEY = 'viz.theme';
const ICON = { light: '🌙', dark: '☀️' };
const LABEL = { light: 'Switch to dark mode', dark: 'Switch to light mode' };
const WAVE_DURATION = 600;      // ms
const WAVE_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function apply(mode) {
  if (mode === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  els.themeToggle.textContent = ICON[mode];
  els.themeToggle.setAttribute('aria-pressed', String(mode === 'dark'));
  els.themeToggle.setAttribute('aria-label', LABEL[mode]);
}

// Initial mode: the inline <head> script already set data-theme before first
// paint (storage → OS default); this only syncs the button to it.
apply(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getButtonCenter() {
  const rect = els.themeToggle.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Farthest viewport corner from (x, y): the radius the circle must reach to
// flood the whole page.
function farCornerRadius(x, y) {
  const dx = Math.max(x, window.innerWidth - x);
  const dy = Math.max(y, window.innerHeight - y);
  return Math.hypot(dx, dy);
}

function switchTheme(next) {
  const supportsViewTransition = typeof document.startViewTransition === 'function';
  if (!supportsViewTransition || prefersReducedMotion()) {
    apply(next);
    return;
  }

  const { x, y } = getButtonCenter();
  const radius = farCornerRadius(x, y);

  const transition = document.startViewTransition(() => apply(next));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: WAVE_DURATION,
          easing: WAVE_EASING,
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => { /* transition skipped (hidden tab etc.): theme already applied */ });
}

els.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch (err) { /* storage blocked: session-only */ }
  switchTheme(next);
});

// Expose for tests / diagnostics.
export const __themeInternals = { WAVE_DURATION, WAVE_EASING };
