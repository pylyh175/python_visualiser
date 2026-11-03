/* ═══════════════ Step navigation: arrows, auto-scroll, glide ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { STEP_MARGIN, STEP_ANIM_MS } from '../config.js';
import { syncScroll } from '../editor/render.js';   // function-only cycle, see render.js note
import { applyLock } from '../lock.js';
import { render } from '../panels/output.js';

export function setIdx(n) {
  if (!state.steps.length) return;
  state.idx = Math.max(0, Math.min(n, state.steps.length - 1));
  // A successful run that reached its final step hands the editor back: the
  // lock lifts and the trace stays for revisiting; the first real edit clears
  // it via the input listener (design doc
  // 2026-10-30-final-step-edit-design.md, 2026-11-02-live-navigation design).
  if (state.idx === state.steps.length - 1 && state.steps[state.idx].finished && !state.programError && !state.stoppedRun) {
    if (state.locked) { state.locked = false; applyLock(); }
  }
  render();
}

// The mirror row element for a 1-based line number (rows are children in
// order; the hidden spacer is last).
export function rowAt(line) {
  const row = els.mirror.children[line - 1];
  return row && row !== state.mirrorSpacer ? row : null;
}

// Scroll the editor so the given 1-based line is comfortably in view.
export function scrollToLine(line) {
  if (!line || line < 1) return;
  const row = rowAt(line);
  if (!row) return;
  cancelStepGlide();
  els.textarea.scrollTop = Math.max(0, row.offsetTop - els.textarea.clientHeight / 3);
  syncScroll();
}

// The arrow lines renderEditor draws for the current state — the single
// source consumed both when drawing and by the step auto-scroll below:
//   normal step: green on the previous step's line, orange on the current
//   return step: green only, on the return line (nothing is about to run)
//   error/limit final step: red only, on the failing line
export function stepArrowLines() {
  const atErrorStep = state.steps.length
    ? state.idx === state.steps.length - 1 && (!!state.programError || state.stoppedRun)
    : !!state.programError && !!state.programError.line;
  let greenLine = null;
  let orangeLine = null;
  let redLine = null;
  if (state.steps.length) {
    if (!atErrorStep) {
      if (state.steps[state.idx].retStep) {
        // A return step completes a call on its own line; the caller then
        // resumes silently on the same line, so only the green
        // just-finished arrow shows, on the return line itself.
        greenLine = state.steps[state.idx].line;
      } else {
        greenLine = state.idx > 0 ? state.steps[state.idx - 1].line : null;
        orangeLine = state.steps[state.idx].line;
      }
    } else {
      redLine = state.steps[state.idx].line;
    }
  } else if (state.programError && state.programError.line) {
    redLine = state.programError.line;
  }
  return { greenLine, orangeLine, redLine };
}

// Mirror rows of the arrows actually drawn this step, priority first
// (orange — or red/green when it is the only arrow — beats green when the
// viewport cannot hold both).
export function arrowRows() {
  const { greenLine, orangeLine, redLine } = stepArrowLines();
  const lines = [];
  if (redLine != null) {
    lines.push(redLine);
  } else {
    if (orangeLine != null) lines.push(orangeLine);
    if (greenLine != null && greenLine !== orangeLine) lines.push(greenLine);
  }
  return lines.map((line) => rowAt(line)).filter(Boolean);
}

// Keep the arrows the user watches (orange next-to-execute, green
// just-executed, red on the error step) visible while stepping, anchored on
// exactly what renderEditor draws — not on the next step's line. Policy:
// every drawn arrow row already in view ⇒ the scroll is left alone (manual
// scrolling is never fought); otherwise the adjusted position clamps into
// the arrows' shared window (STEP_MARGIN so a tracked line never glues to
// an edge); when no window covers both, the priority arrow wins and the
// other may leave the view. Adjustments glide (short ease-out, retargeted
// when the user keeps stepping); manual scrolling cancels the glide and
// prefers-reduced-motion users get instant moves instead.
export function ensureStepVisible() {
  if (!state.steps.length || state.idx >= state.steps.length) return;
  const rows = arrowRows();
  if (!rows.length) return;
  const t = els.textarea;
  const inView = (row) => row.offsetTop >= t.scrollTop
    && row.offsetTop + row.offsetHeight <= t.scrollTop + t.clientHeight;
  if (rows.every(inView)) return;   // everything fits: don't move
  const max = t.scrollHeight - t.clientHeight;
  const windowOf = (row) => {
    const lo = Math.max(0, row.offsetTop + row.offsetHeight + STEP_MARGIN - t.clientHeight);
    const hi = Math.min(max, row.offsetTop - STEP_MARGIN);
    if (hi < lo) {
      // Row taller than the viewport: park its top just inside the margin.
      const park = Math.max(0, Math.min(max, row.offsetTop - STEP_MARGIN));
      return [park, park];
    }
    return [lo, hi];
  };
  let win = null;
  for (const row of rows) {
    const w = windowOf(row);
    const joined = win
      ? [Math.max(win[0], w[0]), Math.min(win[1], w[1])]
      : w;
    if (joined[0] > joined[1]) break;   // conflict: the priority arrow wins
    win = joined;
  }
  if (!win) return;
  const target = Math.round(Math.min(win[1], Math.max(win[0], t.scrollTop)));
  if (target === Math.round(t.scrollTop)) return;
  glideScrollTo(t, target);
}

/* ---------- eased glide for automatic step adjustments ---------- */

export function cancelStepGlide() {
  if (state.stepGlide !== null) {
    cancelAnimationFrame(state.stepGlide);
    state.stepGlide = null;
  }
}

// Glide the editor's scrollTop to target with a short ease-out. A new call
// retargets from the current position (rapid stepping stays fluid); manual
// scrolling cancels it mid-flight, and reduced-motion users get an instant
// set instead.
export function glideScrollTo(t, target) {
  cancelStepGlide();
  const reduce = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    t.scrollTop = target;
    syncScroll();
    return;
  }
  const from = t.scrollTop;
  const delta = target - from;
  const start = performance.now();
  const ease = (p) => 1 - Math.pow(1 - p, 3);   // ease-out cubic
  const tick = (now) => {
    const p = Math.min(1, (now - start) / STEP_ANIM_MS);
    t.scrollTop = from + delta * ease(p);
    if (p < 1) {
      state.stepGlide = requestAnimationFrame(tick);
    } else {
      state.stepGlide = null;
      syncScroll();
    }
  };
  state.stepGlide = requestAnimationFrame(tick);
}

// Manual scrolling mid-glide wins: the animation never fights the user.
els.textarea.addEventListener('wheel', cancelStepGlide, { passive: true });
els.textarea.addEventListener('touchstart', cancelStepGlide, { passive: true });
els.textarea.addEventListener('pointerdown', cancelStepGlide, { passive: true });

/* ---------- playback controls ---------- */

els.first.addEventListener('click', () => setIdx(0));
els.prev.addEventListener('click', () => setIdx(state.idx - 1));
els.next.addEventListener('click', () => setIdx(state.idx + 1));
els.last.addEventListener('click', () => setIdx(state.steps.length - 1));

// Slider jump: the input event is the single path for slider-driven
// navigation; render() keeps the thumb in sync when idx moves by other means.
els.slider.addEventListener('input', () => setIdx(Number(els.slider.value)));

document.addEventListener('keydown', (e) => {
  // The slider handles ←/→ natively when focused (its input event steps);
  // skip it here so one keypress never steps twice.
  if (e.target === els.textarea || e.target === els.slider) return;
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { setIdx(state.idx - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { setIdx(state.idx + 1); e.preventDefault(); }
});
