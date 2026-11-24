/* ═══════════════ Output panel: render orchestration + output body ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { renderEditor } from '../editor/render.js';
import { ensureStepVisible, renderStepControls } from '../navigation/steps.js';
import { dsaFamily } from '../config.js';
import { renderVars } from './variables.js';
import { recursionSeenUpTo } from './recursion.js';
import {
  engagePanes, renderOutputPanel, syncPaneMode,
} from './paneController.js';

// Master render: composition only. Pane state changes come first (mode-change
// reset, one-time pane engage), so everything drawn below agrees on the same
// state.idx / state.panes.tab.
export function render() {
  syncPaneMode();
  engagePanes();
  renderEditor();
  renderStepControls();
  renderOutput();
  renderVars();
  renderOutputPanel();
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
  // Static Output for every mode that has an algorithm tab (2026-11-06, user
  // report: "animation only in the algorithm's own tab, never the Output tab").
  // Keyed on the FAMILY (recursion / stack / two-pointers — including every
  // future family the registry gains) — not per sub-mode — so new algorithms
  // inherit this automatically. Only plain 'none' mode (no algorithm pane at
  // all) keeps the per-step print reveal.
  const hasAlgoTab = dsaFamily(state.dsaMode) !== 'none';
  let text = hasAlgoTab
    ? state.programOutput
    : (step.outLen != null ? state.programOutput.slice(0, step.outLen) : state.programOutput);
  // Printed output is untrusted text. Escape it before appending the app's
  // own markup below; otherwise print("<img onerror=...>") becomes live DOM
  // in the page origin (2026-11-23 fix). Newlines survive: #outputBody is
  // white-space: pre-wrap.
  if (text) text = escapeHtml(text) + '\n';
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
  if (dsaFamily(state.dsaMode) === 'recursion' && !recursionSeenUpTo(state.steps.length - 1)) {
    text += '<span class="err">No recursion detected in this code.</span>';
  }
  // Stack mode, muted (not an error) note when no qualifying class was found
  // in the run's source (2026-11-03-stack-visualiser-design.md, call 5).
  if (dsaFamily(state.dsaMode) === 'stack' && state.stackScan && !state.stackScan.found) {
    text += '<span class="info">No Stack found — needs a class with push() and pop().</span>';
  }
  els.output.innerHTML = text || '<span style="color:#9ca3af">(no output yet)</span>';
  els.output.scrollTop = els.output.scrollHeight;
}
