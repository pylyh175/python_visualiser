/* ═══════════════ Recursion tree (Recursion tab in the output panel) ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { TREE_NODE_CAP } from '../config.js';
import { escapeHtml, treeValue } from '../utils.js';
import { hideOutTabsAll } from './shared.js';

// Replay steps 0..idx into a tree: each step's `stack` (outermost user frame
// first) registers or confirms its frames, joined parent ← child following
// the chain order, and `ret` entries resolve nodes with return values.
// Repetition is safe: maps are built only from ids already recorded, so
// stepping back re-derives an earlier state exactly.
export function treeData(upTo) {
  const nodes = new Map();   // insertion order = call order
  const childCount = new Map();
  for (let s = 0; s <= Math.min(upTo, state.steps.length - 1); s++) {
    const stack = state.steps[s].stack;
    if (stack) {
      for (let d = 0; d < stack.length; d++) {
        const e = stack[d];
        if (!nodes.has(e.id)) {
          const parent = d ? stack[d - 1].id : null;
          nodes.set(e.id, {
            id: e.id, parent, fn: e.fn, args: e.args || {},
            ret: null, retSet: false, order: childCount.get(parent) || 0,
          });
          childCount.set(parent, (childCount.get(parent) || 0) + 1);
        }
      }
    }
    const rets = state.steps[s].ret;
    if (rets) for (const r of rets) {
      const n = nodes.get(r.id);
      // The module frame's own return (value None) never resolves a node.
      if (n && !n.retSet && n.fn !== '<module>') { n.ret = r.value; n.retSet = true; }
    }
  }
  return nodes;
}

// True recursion = the same function's *code* re-entered deeper in one call
// chain — direct (f→f) or indirect (f→g→f). Plain nesting (module → method,
// helper calls) never repeats a code object: frames are matched by function
// name plus signature (co_firstlineno, provided as `sig` by the runner), so a
// module-level function and a same-named method on one chain don't collide.
export function chainIsRecursive(chain) {
  if (!chain || chain.length < 2) return false;
  for (let i = 0; i < chain.length; i++) {
    for (let j = i + 1; j < chain.length; j++) {
      if (chain[i].fn === chain[j].fn && chain[i].sig === chain[j].sig) return true;
    }
  }
  return false;
}

// Did the steps up to i re-enter code? Prefix scan driving the Recursion-tab
// offering (hidden when rewound before the first recursive step). The
// no-recursion verdict calls it with steps.length - 1 — a whole-run check.
export function recursionSeenUpTo(i) {
  for (let s = 0; s <= i && s < state.steps.length; s++) {
    if (chainIsRecursive(state.steps[s].stack || [])) return true;
  }
  return false;
}

export function renderTree() {
  // Tabs exist only in Recursion mode, and only once the trace played so far
  // (steps 0..idx) contains actual recursion: the same function's code
  // re-entered on some recorded call chain. In (none) mode — the blank
  // default — the output panel stays tab-free even for recursive code;
  // rewinding before the first recursive step hides the tabs again
  // (2026-11-03-dsa-mode-gating-design.md). Nested user calls (methods or
  // helpers at chain depth ≥ 2) are not recursion and keep the tabs hidden.
  const recursive = els.dsaMode.value === 'recursion' && recursionSeenUpTo(state.idx);
  if (!recursive) {
    els.outTabs.hidden = true;
    els.outTitle.hidden = false;
    els.output.hidden = false;
    els.treeBody.hidden = true;
    state.outTab = 'out'; state.userTab = false; state.treeAnnounced = false;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  // Once the current chain starts re-entering code, show the tree (first time
  // only — after that a manual tab choice is sticky until the run is reset).
  const cur = state.steps[state.idx].stack || [];
  if (els.dsaMode.value === 'recursion' && !state.userTab && !state.treeAnnounced && chainIsRecursive(cur)) {
    state.treeAnnounced = true;
    state.outTab = 'tree';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabTree.classList.toggle('active', state.outTab === 'tree');
  els.output.hidden = state.outTab !== 'out';
  els.treeBody.hidden = state.outTab !== 'tree';
  if (state.outTab !== 'tree') return;

  const nodes = treeData(state.idx);
  // Cap the drawing; nodes beyond the cap are always later in call order
  // than any parents already shown, so no orphaned look-arounds occur.
  const shown = new Map();
  let extra = 0;
  for (const n of nodes.values()) {
    if (shown.size < TREE_NODE_CAP) shown.set(n.id, n);
    else extra++;
  }
  const kids = new Map();
  for (const n of shown.values()) {
    if (n.parent !== null && !shown.has(n.parent)) continue;
    const list = kids.get(n.parent) || [];
    list.push(n);
    kids.set(n.parent, list);
  }
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order);

  const curStack = state.steps[state.idx].stack || [];
  // The active node is the innermost stack frame *without* a return value
  // at this step. On ordinary line steps that is just the stack top. On a
  // return step the top frame is the one that just resolved (it is still in
  // the chain snapshot), so the call beneath — the one about to consume
  // that value — is shown as active while the callee renders done below.
  // Returns that resolve nothing displayed (the module's own) never block
  // this: the walk falls through to the outermost frame.
  const stepRets = state.steps[state.idx].ret || [];
  let activeId = null;
  for (let d = curStack.length - 1; d >= 0; d--) {
    if (!stepRets.some((r) => r.id === curStack[d].id)) {
      activeId = curStack[d].id;
      break;
    }
  }
  const atErrorStep = state.idx === state.steps.length - 1 && (!!state.programError || state.stoppedRun);

  const lines = [];
  // Root = the one node with no parent (the module frame). Its id is not a
  // fixed number: the module frame gets a 'call' event like any other.
  let root = null;
  for (const n of shown.values()) if (n.parent === null) { root = n; break; }
  if (root) {
    const rootCls = root.id === activeId ? (atErrorStep ? 'tn-error' : 'tn-active') : '';
    lines.push(`<span class="${rootCls}">(program)</span>`);
    const walk = (parent, prefix) => {
      const list = kids.get(parent) || [];
      list.forEach((k, i) => {
        const last = i === list.length - 1;
        let cls, label;
        if (k.retSet) {
          // Resolved beats active: during a return step the callee that
          // just resolved is still the stack top, but the node must show
          // its green done state with the value it returned.
          cls = 'tn-done';
        } else if (k.id === activeId) {
          cls = atErrorStep ? 'tn-error' : 'tn-active';
        } else {
          cls = '';
        }
        const argStr = Object.keys(k.args).slice(0, 3)
          .map((a) => `${a}=${treeValue(k.args[a], 24)}`).join(', ');
        label = (k.fn === '<module>' ? '(program)' : k.fn) + '(' + argStr + ')';
        if (k.retSet) label += ' → ' + treeValue(k.ret, 40);
        lines.push(`<span class="${cls}">${escapeHtml(prefix + (last ? '└─ ' : '├─ '))}${escapeHtml(label)}</span>`);
        walk(k.id, prefix + (last ? '   ' : '│  '));
      });
    };
    walk(root.id, '');
  }
  if (extra > 0) {
    lines.push(`<span class="tn-more">+${extra} more calls not shown</span>`);
  }
  els.treeBody.innerHTML = lines.join('\n') || '<span class="tn-more">(no calls yet)</span>';
  els.treeBody.scrollTop = els.treeBody.scrollHeight;
}
