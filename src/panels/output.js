/* ═══════════════ Output panel: render orchestration + output body ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { renderEditor } from '../editor/render.js';
import { ensureStepVisible } from '../navigation/steps.js';
import { renderVars } from './variables.js';
import { renderTree, recursionSeenUpTo } from './recursion.js';
import { renderStack } from './stack.js';
import { renderTwoPointersPanel } from './twoPointers.js';
import { hideOutTabsAll } from './shared.js';

// Master render: editor mirror, playback controls, all output-panel bodies.
export function render() {
  renderEditor();
  const total = state.steps.length;
  els.stepLabel.textContent = total ? `Step ${state.idx + 1} / ${total}` : 'Step 0 / 0';
  // Playback controls are live whenever a trace exists — including terminal
  // states (successful final step, runtime error, limit stop) — so users can
  // revisit any recorded step; only a real edit resets the run.
  const playbackOn = state.steps.length > 0;
  els.first.disabled = els.prev.disabled = (state.idx <= 0 || !playbackOn);
  els.next.disabled = els.last.disabled = (state.idx >= total - 1 || !playbackOn);
  els.slider.max = String(Math.max(0, total - 1));
  els.slider.value = String(state.idx);
  els.slider.disabled = !playbackOn;
  renderOutput();
  renderVars();
  renderOutPanel();
  ensureStepVisible();
}

export function errorDisplayText() {
  // "Line N: …" prefix so the message matches the highlighted editor line.
  const where = state.programError && state.programError.line ? `Line ${state.programError.line}: ` : '';
  return where + (state.programError ? state.programError.text : '');
}

export function renderOutput() {
  if (!state.steps.length) {
    els.output.innerHTML = state.programError
      ? `<span class="err">${escapeHtml(errorDisplayText())}</span>`
      : '<span style="color:#9ca3af">(no output yet)</span>';
    return;
  }
  const step = state.steps[state.idx];
  let text = step.outLen != null ? state.programOutput.slice(0, step.outLen) : state.programOutput;
  if (text) text += '\n';
  if (state.idx === state.steps.length - 1 && state.programError) {
    text += `<span class="err">${escapeHtml(errorDisplayText())}</span>`;
  }
  if (state.idx === state.steps.length - 1 && state.stoppedRun) {
    text += '<span class="err">— execution stopped: step/time limit reached (too many steps)</span>';
  }
  // Recursion mode verdict (2026-11-03-dsa-mode-gating-design.md): a verdict
  // about THE CODE, so it scans the whole recorded trace — shown only when no
  // recursion exists anywhere in it. (An earlier prefix scan 0..idx printed
  // the line on the early, pre-first-call steps of clearly recursive code —
  // ground-truth probe: steps 0-3 of fib(6) showed it right after the run.)
  if (els.dsaLabel.textContent === 'Recursion' && !recursionSeenUpTo(state.steps.length - 1)) {
    text += '<span class="err">No recursion detected in this code.</span>';
  }
  // Stack mode, muted (not an error) note when no qualifying class was found
  // in the run's source (2026-11-03-stack-visualiser-design.md, call 5).
  if (els.dsaLabel.textContent === 'Stack' && state.stackScan && !state.stackScan.found) {
    text += '<span class="info">No Stack found — needs a class with push() and pop().</span>';
  }
  els.output.innerHTML = text || '<span style="color:#9ca3af">(no output yet)</span>';
  els.output.scrollTop = els.output.scrollHeight;
}

// The panel shows one tab FAMILY per DSA mode: recursion → Output|Recursion
// (renderTree), stack → Output|Stack (renderStack), two-pointers →
// Output|Two Pointers (renderTwoPointersPanel), blank mode or no trace →
// plain output without a tab bar. Family switching (mode change on a live
// trace) resets the manual tab choice.
export function renderOutPanel() {
  const fam = els.dsaLabel.textContent || 'none';
  if (fam !== state.outFam) {
    state.outFam = fam;
    state.outTab = 'out'; state.userTab = false;
    state.treeAnnounced = false; state.stackAnnounced = false;
  }
  els.tabTree.hidden = fam !== 'recursion';
  els.tabStack.hidden = fam !== 'stack';
  els.tabTwoPtrs.hidden = fam !== 'two-pointers';
  els.treeBody.hidden = fam !== 'recursion';
  els.stackBody.hidden = fam !== 'stack';
  els.twoPtrsBody.hidden = fam !== 'two-pointers';
  if (!state.steps.length || (fam !== 'recursion' && fam !== 'stack' && fam !== 'two-pointers')) {
    hideOutTabsAll(fam);
    return;
  }
  if (fam === 'stack') renderStack();
  else if (fam === 'two-pointers') renderTwoPointersPanel();
  else renderTree();
}

els.tabOut.addEventListener('click', () => {
  state.outTab = 'out';
  if (state.steps.length) state.userTab = true;   // manual choice sticks until the run resets
  renderOutPanel();
});
els.tabTree.addEventListener('click', () => {
  state.outTab = 'tree';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabStack.addEventListener('click', () => {
  state.outTab = 'stack';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabTwoPtrs.addEventListener('click', () => {
  state.outTab = 'two-pointers';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
