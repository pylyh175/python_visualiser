/* ═══════════════ Dark mode toggle with circular reveal (2026-11-20) ═══════════════
   STRATEGY: a snapshot-free circular reveal of real content.

   The View Transition API version looked right but captured the whole page
   twice per toggle. On slower GPUs the composer stalled right after the first
   frame of the sweep — the circle appeared frozen at a few percent of its
   radius (and the renderer could even crash when transitions were interrupted).
   That cost lives inside the browser's snapshot pipeline, so it cannot be tuned
   away from JS.

   Instead, on click we build a lightweight clone of the page's own DOM in a
   fixed layer, frozen in the INCOMING theme's palette (all theme tokens are
   copied onto the layer, so the clone keeps that palette while the real page
   stays in the outgoing theme). The clone is clipped with a circle that expands
   from the toggle — the same compositor-friendly clip-path animation, but over
   one ordinary layer instead of two page snapshots. When the circle covers the
   viewport the real theme is applied underneath and the clone is removed in the
   same frame, so the handoff is invisible. Inside the circle the real content
   (text, panels, borders, the icon) is visible the whole time; outside it the
   outgoing theme is still visible.

   The clone is small (≈170 nodes, ~6 ms) and inert: no scripts, no ids are
   removed (CSS needs them but the live elements come first in tree order), form
   values and scroll offsets are copied so it matches exactly.

   Rapid clicking: one reveal owns the screen at a time. The toggle is inert
   until it has fully settled, and clicks in that window are ignored outright.
   A watchdog releases the lock if the tab is hidden or the animation never
   resolves.

   Reduced motion: instant swap, no clone. */

import { els } from './dom.js';

const KEY = 'viz.theme';
const ICON = { light: '🌙', dark: '☀️' };
const LABEL = { light: 'Switch to dark mode', dark: 'Switch to light mode' };
const WAVE_DURATION = 340;      // ms — snappy and smooth
const WAVE_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
// After the reveal ends, stay locked briefly before the next click.
const SETTLE_MS = 150;
// Watchdog: a background/occluded tab can throttle animations for seconds.
// Settle anyway so the toggle can never stay disabled forever.
const MAX_RIPPLE_MS = 1500;

// Every custom property the two themes swap. Copied onto the clone layer so it
// keeps the incoming palette while the live page still shows the outgoing one.
const THEME_VARS = [
  '--bg', '--panel', '--border', '--text', '--muted', '--accent',
  '--green', '--green-bg', '--orange', '--orange-bg', '--red', '--red-bg',
  '--gutter', '--text-body', '--sb-size', '--sb-thumb', '--sb-thumb-hover',
  '--mono',
];

// The theme the app considers current. Kept separate from the DOM attribute
// because the DOM only changes at the end of the reveal.
let targetTheme = 'light';
let running = null;             // { anim, watchdog, theme, applied } while a reveal plays
let lockUntil = 0;              // performance.now() before which clicks are ignored
let waveEl = null;              // the fixed layer the incoming clone is drawn on

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

function canAnimate() {
  return typeof Element.prototype.animate === 'function' && !prefersReducedMotion();
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

function waveLayer() {
  if (!waveEl) {
    waveEl = document.createElement('div');
    waveEl.id = 'themeWave';
    waveEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(waveEl);
  }
  return waveEl;
}

// Resolve the incoming theme's tokens without painting it: set the attribute,
// read the custom properties, restore it — all inside one task, so no frame is
// ever rendered with the temporary state.
function readThemeVars(mode) {
  const root = document.documentElement;
  const previous = root.dataset.theme;
  if (mode === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  const cs = getComputedStyle(root);
  const vars = {};
  for (const name of THEME_VARS) {
    const value = cs.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  if (previous === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  return vars;
}

// Deep-copy the app's own DOM (never scripts or the wave layer) into the wave
// layer, freeze it in the incoming palette, and mirror live form/scroll state.
function buildClone(mode, vars) {
  const layer = waveLayer();
  layer.textContent = '';
  layer.dataset.theme = mode;
  for (const name of THEME_VARS) layer.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) layer.style.setProperty(name, value);
  layer.style.color = vars['--text'] || '';
  layer.style.background = vars['--bg'] || '';

  const sources = [];
  for (const child of document.body.children) {
    if (child === layer || child.tagName === 'SCRIPT') continue;
    sources.push(child);
    layer.appendChild(child.cloneNode(true));
  }

  // cloneNode preserves structure 1:1, so element order aligns between the
  // source roots and the clone roots.
  const srcAll = sources.flatMap((root) => [...root.querySelectorAll('*')]);
  const dstAll = [...layer.children].flatMap((root) => [...root.querySelectorAll('*')]);
  const count = Math.min(srcAll.length, dstAll.length);
  for (let i = 0; i < count; i++) {
    const src = srcAll[i];
    const dst = dstAll[i];
    if (src.tagName === 'TEXTAREA' || src.tagName === 'INPUT' || src.tagName === 'SELECT') {
      if (dst.value !== src.value) dst.value = src.value;
      if (src.type === 'checkbox' || src.type === 'radio') dst.checked = src.checked;
    }
    if (src.scrollTop) dst.scrollTop = src.scrollTop;
    if (src.scrollLeft) dst.scrollLeft = src.scrollLeft;
  }
  layer.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));

  // The clone shows the incoming theme, so its toggle must already show the
  // incoming icon (the live button is still on the outgoing theme).
  const cloneToggle = layer.querySelector('#themeToggle');
  if (cloneToggle) {
    cloneToggle.textContent = ICON[mode];
    cloneToggle.setAttribute('aria-pressed', String(mode === 'dark'));
    cloneToggle.setAttribute('aria-label', LABEL[mode]);
    cloneToggle.disabled = true;
  }

  layer.inert = true;   // display-only: never focusable or interactive
  return layer;
}

function settle(rec) {
  if (running !== rec) return;
  running = null;
  if (rec.watchdog) clearTimeout(rec.watchdog);
  if (rec.anim) { try { rec.anim.cancel(); } catch (err) { /* torn down */ } }
  // Safety net: if the reveal was cut short (hidden tab, watchdog), the real
  // theme must still match the user's last choice.
  if (!rec.applied && rec.theme !== appliedTheme()) apply(rec.theme);
  if (waveEl) {
    waveEl.style.display = 'none';
    waveEl.style.clipPath = '';
    waveEl.textContent = '';
  }
  lockUntil = performance.now() + SETTLE_MS;
  setTimeout(() => {
    if (!running) els.themeToggle.disabled = false;
  }, SETTLE_MS);
}

function startWave(next) {
  if (!canAnimate()) {
    apply(next);
    return;
  }

  const { x, y } = getButtonCenter();
  const radius = farCornerRadius(x, y);

  let layer;
  try {
    layer = buildClone(next, readThemeVars(next));
  } catch (err) {
    apply(next);   // never leave the theme unapplied because the clone failed
    return;
  }

  layer.style.clipPath = `circle(0px at ${x}px ${y}px)`;
  layer.style.display = 'flex';

  const rec = { anim: null, watchdog: null, theme: next, applied: false };
  running = rec;
  els.themeToggle.disabled = true;
  rec.watchdog = setTimeout(() => settle(rec), MAX_RIPPLE_MS);

  const anim = layer.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    },
    { duration: WAVE_DURATION, easing: WAVE_EASING, fill: 'forwards' }
  );
  rec.anim = anim;

  anim.finished.then(() => {
    if (running !== rec) return;
    // The clone now covers the viewport: swap the real page to the same theme
    // and drop the clone in one task, so the handoff cannot be seen.
    apply(next);
    rec.applied = true;
    settle(rec);
  }, () => settle(rec));
}

function requestToggle() {
  // A live reveal owns the screen: ignore the click completely.
  if (running || performance.now() < lockUntil) return;

  const next = targetTheme === 'dark' ? 'light' : 'dark';
  targetTheme = next;
  try { localStorage.setItem(KEY, next); } catch (err) { /* storage blocked: session-only */ }
  startWave(next);
}

els.themeToggle.addEventListener('click', requestToggle);

// Expose for tests / diagnostics.
export const __themeInternals = { WAVE_DURATION, WAVE_EASING };
