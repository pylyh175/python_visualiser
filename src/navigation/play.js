/* ═══════════════ Auto-play: watch the run like a video (2026-11-15) ═══════════════ */
/* Grilled Q1–Q12: play advances one step at a time through the single setIdx()
   path, from the current position (restart from step 0 if pressed on the last
   step); the last step stops playback (no loop); pause freezes in place; any
   manual navigation pauses; any trace reset (edit / re-run / DSA swap) stops
   hard; speed changes apply from the next step; no keyboard shortcut.          */

import { state } from '../state.js';
import { els } from '../dom.js';
import { PLAY_SPEEDS, PLAY_DEFAULT_SPEED } from '../config.js';
import { setIdx } from './steps.js';   // function-only cycle: steps.js imports pausePlayback

let timer = null;
let speed = PLAY_DEFAULT_SPEED;   // session-only; resets to Normal per load

function setButton() {
  els.play.textContent = state.playing ? '⏸<span class="bt"> Pause</span>' : '⏵<span class="bt"> Play</span>';
  els.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play')
}

// Schedule the next tick with the CURRENT speed (re-reading it each tick is
// what makes a mid-playback speed change apply from the next step on).
function arm() {
  timer = setTimeout(tick, PLAY_SPEEDS[speed] ?? PLAY_SPEEDS[PLAY_DEFAULT_SPEED]);
}

// One tick = one step, then re-arm only if still playing with steps left.
// The pre-check makes a cleared trace (resetRun) end playback instead of
// leaving a "playing" state stuck on an empty run (grilled Q10).
function tick() {
  timer = null;
  if (!state.playing || !state.steps.length) { stopPlayback(); return; }
  setIdx(state.idx + 1);                       // clamps + renders
  if (state.idx >= state.steps.length - 1) stopPlayback();   // end reached
  else arm();
}

// Soft stop: keeps the current step (grilled Q7). The button flips back and
// the pending tick is cancelled.
export function pausePlayback() {
  if (!state.playing) return;
  state.playing = false;
  clearTimeout(timer);
  timer = null;
  setButton();
}

// Hard stop: trace reset (edit / re-run / DSA swap) or playback end. Safe to
// call when not playing — resetRun fires on paths that never started playback.
export function stopPlayback() {
  state.playing = false;
  clearTimeout(timer);
  timer = null;
  setButton();
}

export function togglePlayback() {
  if (state.playing) { pausePlayback(); return; }
  if (!state.steps.length) return;
  state.playing = true;
  // Pressed on the last step: restart the video from the top (grilled Q1).
  if (state.idx >= state.steps.length - 1) setIdx(0);
  setButton();
  arm();
}

/* ---------- wiring ---------- */

els.play.addEventListener('click', togglePlayback);

els.playSpeed.addEventListener('change', () => {
  const v = els.playSpeed.value;
  speed = v in PLAY_SPEEDS ? v : PLAY_DEFAULT_SPEED;
  state.playSpeed = speed;    // visualiser panes scale their animation length to it
  els.playSpeed.title = `${PLAY_SPEEDS[speed]} ms per step`;
  // Live effect: re-arm so even the currently pending step uses
  // the new delay; when paused this is a no-op beyond storing the speed.
  if (state.playing) { clearTimeout(timer); arm(); }
});
