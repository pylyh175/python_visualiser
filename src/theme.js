/* ═══════════════ Dark mode toggle with circular view-transition reveal (2026-11-20) ═══════════════
   STRATEGY: the ripple IS the theme change, not an overlay painted on top.
   On click we hand the theme swap to the View Transition API: the browser
   snapshots the current theme, applies the new one, then the new render is
   revealed by a clip-path circle expanding from the toggle button. Because
   the circle uncovers the REAL re-styled content, text/code/panels are never
   covered — each area flips to the incoming theme exactly as the ripple
   passes over it.

   Rapid switching: tearing a snapshot down mid-clip (cancel/skipTransition)
   left a frozen partial circle, and re-capturing snapshots on every click
   stalled the ripple. The toggle therefore locks for ~1s on each click so
   every 300ms ripple completes uninterrupted. Clicks during the lock are
   ignored. Coalescing is kept as a safety net.

   Falling back to an instant swap when the API is unavailable (Firefox,
   older Safari) or when the user asks for reduced motion. */

import { els } from './dom.js';

const KEY = 'viz.theme';
const ICON = { light: '🌙', dark: '☀️' };
const LABEL = { light: 'Switch to dark mode', dark: 'Switch to light mode' };
const WAVE_DURATION = 300;      // ms — snappy and smooth
const WAVE_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

// The theme the app considers current. Kept separate from the DOM attribute
// because during a ripple the DOM already shows the ripple's target, and
// rapid clicks must still alternate from the USER's last choice, not from the
// half-applied visual state.
let targetTheme = 'light';
let running = null;             // { transition, anim, theme } while a ripple plays
let queuedTheme = null;         // latest request received mid-ripple (safety net)
let coolDownTimer = null;       // button disabled for ~1s so a ripple can never be interrupted

function appliedTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(mode) {
  if (mode === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  els.themeToggle.textContent = ICON[mode];
  els.themeToggle.setAttribute('aria-pressed', String(mode === 'dark'));
  els.themeToggle.setAttribute('aria-label', LABEL[mode]);
}

// Initial mode: the inline <head> script already set data-theme before first
// paint (storage → OS default); this only syncs the button to it.
targetTheme = appliedTheme();
apply(targetTheme);

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function disableToggle(ms) {
  // While a ripple plays the button must stay disabled: Chrome's view-transition
  // snapshot owns hit-testing for its whole duration, so any mid-ripple click
  // either lands on <html> and is lost, or would interrupt a live snapshot and
  // leave a frozen partial circle behind. A fixed cool-down keeps every ripple
  // uninterrupted and the animation smooth.
  els.themeToggle.disabled = true;
  if (coolDownTimer) clearTimeout(coolDownTimer);
  coolDownTimer = setTimeout(() => {
    els.themeToggle.disabled = false;
    coolDownTimer = null;
  }, ms);
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

function startRipple(next) {
  queuedTheme = null;

  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    apply(next);
    return;
  }

  const { x, y } = getButtonCenter();
  const radius = farCornerRadius(x, y);

  let transition;
  try {
    transition = document.startViewTransition(() => apply(next));
  } catch (err) {
    apply(next);
    return;
  }

  const rec = { transition, anim: null, theme: next };
  running = rec;

  transition.ready
    .then(() => {
      if (running !== rec) return; // superseded defensively
      rec.anim = document.documentElement.animate(
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

  transition.finished
    .catch(() => { /* aborted (hidden tab etc.): fall through to cleanup */ })
    .finally(() => {
      if (running !== rec) return;
      running = null;
      // A later click landed mid-ripple: animate once more to the latest choice.
      if (queuedTheme && queuedTheme !== appliedTheme()) startRipple(queuedTheme);
    });
}

function requestToggle() {
  const next = targetTheme === 'dark' ? 'light' : 'dark';
  targetTheme = next;
  try { localStorage.setItem(KEY, next); } catch (err) { /* storage blocked: session-only */ }

  // Lock the button for the ripple's duration (plus slack) so rapid clicks
  // can never interrupt a live view-transition snapshot.
  disableToggle(1000);

  if (running) {
    // Coalescing safety net: a click that arrived while still disabled should
    // not be possible, but guard anyway.
    queuedTheme = next;
    return;
  }
  startRipple(next);
}

els.themeToggle.addEventListener('click', requestToggle);

// While a view transition runs, its snapshot layer sits in the top layer and
// consumes pointer hit-testing, so a click on the toggle arrives with
// target === <html> instead of the button. Recover it when the point falls
// inside the toggle so rapid switching stays responsive.
document.addEventListener('click', (event) => {
  if (!running) return;
  if (event.target !== document.documentElement) return;
  const rect = els.themeToggle.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) return;
  requestToggle();
}, true);

// Expose for tests / diagnostics.
export const __themeInternals = { WAVE_DURATION, WAVE_EASING };
