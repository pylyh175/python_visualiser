/* ═══════════════ Dark mode toggle (2026-11-05-dark-mode-design.md) ═══════════════ */

import { els } from './dom.js';

const KEY = 'viz.theme';
// The button shows WHERE YOU'RE GOING: 🌙 in light mode (press for dark),
// ☀️ in dark mode — matching the app's emoji/glyph button language (Q4).
const ICON = { light: '🌙', dark: '☀️' };
const LABEL = { light: 'Switch to dark mode', dark: 'Switch to light mode' };

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

els.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch (err) { /* storage blocked: session-only */ }
  apply(next);
});
