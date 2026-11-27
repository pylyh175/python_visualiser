/* ═══════════════ Output panel: render orchestration + output body ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { renderEditor } from '../editor/render.js';
import { ensureStepVisible } from '../navigation/steps.js';
import { dsaFamily } from '../config.js';
import { renderVars } from './variables.js';
import { renderTree, recursionSeenUpTo } from './recursion.js';
import { renderStack } from './stack.js';
import { renderQueuePanel, queueFound } from './queue.js';
import { renderCQueuePanel } from './cqueue.js';
import { renderLListPanel, llistFound } from './linkedlist.js';
import { renderHTablePanel, htableFound } from './hashtable.js';
import { renderHChainPanel, hchainFound } from './chaining.js';
import { renderBstPanel, bstFound } from './bst.js';
import { renderTwoPointersPanel, engagePointerPane, detectTwoPointers, clearDetectCache } from './twoPointers.js';
import { renderReversePanel } from './reverse.js';
import { renderPalindromePanel, detectPalindrome } from './palindrome.js';
import { renderContainerPanel } from './container.js';
import { hideOutTabsAll } from './shared.js';

// Master render: editor mirror, playback controls, all output-panel bodies.
// State changes come first (mode-change reset, one-time pane engage), so
// everything drawn below agrees on the same state.idx / state.outTab.
export function render() {
  syncOutFamily();
  engageActivePane();
  renderEditor();
  const total = state.steps.length;
  // "Step" is a hideable word: the phone dock shows just "3 / 20".
  els.stepLabel.innerHTML = `<span class="bt">Step </span>${total ? state.idx + 1 : 0} / ${total}`;
  // Playback controls are live whenever a trace exists — including terminal
  // states (successful final step, runtime error, limit stop) — so users can
  // revisit any recorded step; only a real edit resets the run.
  const playbackOn = state.steps.length > 0;
  els.first.disabled = els.prev.disabled = (state.idx <= 0 || !playbackOn);
  els.next.disabled = els.last.disabled = (state.idx >= total - 1 || !playbackOn);
  els.slider.max = String(Math.max(0, total - 1));
  els.slider.value = String(state.idx);
  els.slider.disabled = !playbackOn;
  // Auto-play obeys the same gating (grilled Q5); while playing the button
  // reads "⏸ Pause" and stays enabled — playbackOn is true whenever steps exist.
  els.play.disabled = !playbackOn;
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
  if (dsaFamily(state.dsaMode) === 'recursion' && !recursionSeenUpTo(state.steps.length - 1)) {
    text += '<span class="err">No recursion detected in this code.</span>';
  }
  // Stack mode, muted (not an error) note when no qualifying class was found
  // in the run's source (2026-11-03-stack-visualiser-design.md, call 5).
  if (dsaFamily(state.dsaMode) === 'stack' && state.stackScan && !state.stackScan.found) {
    text += '<span class="info">No Stack found — needs a class with push() and pop().</span>';
  }
  if (dsaFamily(state.dsaMode) === 'queue' && !queueFound()) {
    text += '<span class="info">No Queue found — needs a class with an array plus front and rear indices.</span>';
  }
  if (dsaFamily(state.dsaMode) === 'linked-list' && !llistFound()) {
    text += '<span class="info">No Linked List found — needs a class whose head points at nodes with next and data.</span>';
  }
  if (dsaFamily(state.dsaMode) === 'hash-table-linear-probe' && !htableFound()) {
    text += '<span class="info">No Hash Table found — needs a class whose array holds None or (key, value) pairs.</span>';
  }
  if (dsaFamily(state.dsaMode) === 'hash-table-separate-chaining' && !hchainFound()) {
    text += '<span class="info">No chained Hash Table found — needs a class whose array holds None or the first Node (key, value, next) of a chain.</span>';
  }
  if (dsaFamily(state.dsaMode) === 'binary-search-tree' && !bstFound()) {
    text += '<span class="info">No Binary Search Tree found — needs a class with root and nodes with left/right.</span>';
  }
  if (dsaFamily(state.dsaMode) === 'circular queue' && !queueFound()) {
    text += '<span class="info">No Circular Queue found — needs a class with an array plus front and rear indices.</span>';
  }
  els.output.innerHTML = text || '<span style="color:#9ca3af">(no output yet)</span>';
  els.output.scrollTop = els.output.scrollHeight;
}

// Any DSA change (family OR sub-mode) resets the manual tab choice and the
// one-time announce latches. Idempotent: a no-op while the mode is unchanged.
function syncOutFamily() {
  if (state.outFam === state.dsaMode) return;
  state.outFam = state.dsaMode;
  state.outTab = 'out'; state.userTab = false;
  state.treeAnnounced = false; state.stackAnnounced = false; state.queueAnnounced = false;
  state.cqueueAnnounced = false;
  state.llistAnnounced = false;
  state.htableAnnounced = false;
  state.hchainAnnounced = false;
  state.bstAnnounced = false;
  state.twoPointersAnnounced = false;
  state.reverseAnnounced = false;
  state.palindromeAnnounced = false;
  state.containerAnnounced = false;
  state.lastValidFrame = -1;   // a frozen frame never bleeds across sub-modes
  // A pointer pin names one algorithm's variables: a new mode starts on auto.
  if (state.pointerPin) { state.pointerPin = null; clearDetectCache(); }
}

// The two-pointer panes' one-time jump to their first detected step (and tab
// switch). Runs before render() draws anything — see engagePointerPane.
function engageActivePane() {
  if (dsaFamily(state.dsaMode) !== 'two-pointers') return;
  switch (state.dsaMode) {
    case 'two-pointers.reverse-array-string':
      return engagePointerPane(detectTwoPointers, 'reverseAnnounced', 'reverse');
    case 'two-pointers.valid-palindrome':
      return engagePointerPane(detectPalindrome, 'palindromeAnnounced', 'palindrome');
    case 'two-pointers.container-with-most-water':
      return engagePointerPane(detectTwoPointers, 'containerAnnounced', 'container');
    case 'two-pointers.two-sum':
    case 'two-pointers.remove-duplicate':
      // Dedicated views since 2026-11-24: they open their tab like the
      // other sub-modes (the shared pane, labelled with the sub-mode name).
      return engagePointerPane(detectTwoPointers, 'twoPointersAnnounced', 'two-pointers');
    default:
      // Generic pane: jumps to the detected step but keeps the Output tab.
      return engagePointerPane(detectTwoPointers, 'twoPointersAnnounced');
  }
}

// The panel shows one tab FAMILY per DSA mode: recursion → Output|Recursion
// (renderTree), stack → Output|Stack (renderStack), queue → Output|Queue
// (renderQueuePanel), circular queue → Output|Circular Queue (renderCQueuePanel),
// linked-list → Output|Linked List (renderLListPanel), hash-table-linear-probe →
// Output|Hash Table (renderHTablePanel), hash-table-separate-chaining →
// Output|Hash Table (Chaining) (renderHChainPanel), binary-search-tree →
// Output|Binary Search Tree (renderBstPanel), two-pointers →
// Output|Two Pointers (renderTwoPointersPanel) or — when the reverse-array
// sub-mode id is selected — Output|Reverse Array/String (renderReversePanel);
// blank mode or no trace → plain output without a tab bar. Any DSA change
// (family OR sub-mode — outFam now stores the full id) resets the manual tab
// choice.
export function renderOutPanel() {
  const fam = dsaFamily(state.dsaMode);
  syncOutFamily();
  const isReverse = state.dsaMode === 'two-pointers.reverse-array-string';
  const isPalindrome = state.dsaMode === 'two-pointers.valid-palindrome';
  const isContainer = state.dsaMode === 'two-pointers.container-with-most-water';
  els.tabTree.hidden = fam !== 'recursion';
  els.tabStack.hidden = fam !== 'stack';
  els.tabQueue.hidden = fam !== 'queue';
  els.tabCQueue.hidden = fam !== 'circular queue';
  els.tabLList.hidden = fam !== 'linked-list';
  els.tabHTable.hidden = fam !== 'hash-table-linear-probe';
  els.tabHChain.hidden = fam !== 'hash-table-separate-chaining';
  els.tabBst.hidden = fam !== 'binary-search-tree';
  els.tabTwoPtrs.hidden = fam !== 'two-pointers' || isReverse || isPalindrome || isContainer;
  els.tabReverse.hidden = fam !== 'two-pointers' || !isReverse;
  els.tabPalindrome.hidden = fam !== 'two-pointers' || !isPalindrome;
  els.tabContainer.hidden = fam !== 'two-pointers' || !isContainer;
  els.treeBody.hidden = fam !== 'recursion';
  els.stackBody.hidden = fam !== 'stack';
  els.queueBody.hidden = fam !== 'queue';
  els.cqueueBody.hidden = fam !== 'circular queue';
  els.llistBody.hidden = fam !== 'linked-list';
  els.htableBody.hidden = fam !== 'hash-table-linear-probe';
  els.hchainBody.hidden = fam !== 'hash-table-separate-chaining';
  els.bstBody.hidden = fam !== 'binary-search-tree';
  els.twoPtrsBody.hidden = fam !== 'two-pointers' || isReverse || isPalindrome || isContainer;
  els.reverseBody.hidden = fam !== 'two-pointers' || !isReverse;
  els.palindromeBody.hidden = fam !== 'two-pointers' || !isPalindrome;
  els.containerBody.hidden = fam !== 'two-pointers' || !isContainer || state.outTab !== 'container';
  // Tab highlight follows the actual pane for EVERY out-tab (2026-11-06
  // container-finalized-bars design Q4 — was only wired for recursion/stack);
  // single site, so clicks and auto-switches both land here.
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabTree.classList.toggle('active', state.outTab === 'tree');
  els.tabStack.classList.toggle('active', state.outTab === 'stack');
  els.tabQueue.classList.toggle('active', state.outTab === 'queue');
  els.tabCQueue.classList.toggle('active', state.outTab === 'cqueue');
  els.tabLList.classList.toggle('active', state.outTab === 'llist');
  els.tabHTable.classList.toggle('active', state.outTab === 'htable');
  els.tabHChain.classList.toggle('active', state.outTab === 'hchain');
  els.tabBst.classList.toggle('active', state.outTab === 'bst');
  els.tabTwoPtrs.classList.toggle('active', state.outTab === 'two-pointers');
  els.tabReverse.classList.toggle('active', state.outTab === 'reverse');
  els.tabPalindrome.classList.toggle('active', state.outTab === 'palindrome');
  els.tabContainer.classList.toggle('active', state.outTab === 'container');
  if (!state.steps.length || (fam !== 'recursion' && fam !== 'stack' && fam !== 'queue' && fam !== 'circular queue' && fam !== 'linked-list' && fam !== 'hash-table-linear-probe' && fam !== 'hash-table-separate-chaining' && fam !== 'binary-search-tree' && fam !== 'two-pointers')) {
    hideOutTabsAll(state.dsaMode);
    return;
  }
  if (fam === 'stack') renderStack();
  else if (fam === 'queue') renderQueuePanel();
  else if (fam === 'circular queue') renderCQueuePanel();
  else if (fam === 'linked-list') renderLListPanel();
  else if (fam === 'hash-table-linear-probe') renderHTablePanel();
  else if (fam === 'hash-table-separate-chaining') renderHChainPanel();
  else if (fam === 'binary-search-tree') renderBstPanel();
  else if (isReverse) renderReversePanel();
  else if (isPalindrome) renderPalindromePanel();
  else if (isContainer) renderContainerPanel();
  else if (fam === 'two-pointers') renderTwoPointersPanel();
  else renderTree();
}

// Visualiser panes ask for a full re-render (e.g. a pointer pin changed)
// through an event, so they never import this module back.
document.addEventListener('viz:rerender', () => {
  if (state.steps.length && !state.runInProgress) render();
});
// The device class or window size changed (viewport.js): measured visuals
// (cell windows, bar scale, tree fit) recompute for the new size.
document.addEventListener('viz:viewport', () => {
  if (!state.runInProgress) render();
});

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
els.tabQueue.addEventListener('click', () => {
  state.outTab = 'queue';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabCQueue.addEventListener('click', () => {
  state.outTab = 'cqueue';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabLList.addEventListener('click', () => {
  state.outTab = 'llist';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabBst.addEventListener('click', () => {
  state.outTab = 'bst';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabHChain.addEventListener('click', () => {
  state.outTab = 'hchain';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabHTable.addEventListener('click', () => {
  state.outTab = 'htable';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabTwoPtrs.addEventListener('click', () => {
  state.outTab = 'two-pointers';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabReverse.addEventListener('click', () => {
  state.outTab = 'reverse';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabPalindrome.addEventListener('click', () => {
  state.outTab = 'palindrome';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});
els.tabContainer.addEventListener('click', () => {
  state.outTab = 'container';
  if (state.steps.length) state.userTab = true;
  renderOutPanel();
});