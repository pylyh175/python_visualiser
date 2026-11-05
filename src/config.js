/* ═══════════════ Configuration & constants (single source of truth) ═══════════════ */

// Default code shown in the editor on first load.
export const DEFAULT_CODE = [
  'total = 0',
  'numbers = [3, 1, 4, 1, 5]',
  '',
  'for n in numbers:',
  '    if n % 2 == 0:',
  '        print(n, "is even")',
  '    else:',
  '        print(n, "is odd")',
  '    total = total + n',
  '',
  'print("total:", total)',
].join('\n');

// Hint text shown while the editor is unlocked.
export const HINT_DEFAULT = 'Type or paste Python code, then click Visualize.';

// ── DSA selection (2026-11-03-dsa-dropdown-design.md, mode-gating design) ──
// Single source of truth for the mode dropdown in the toolbar. status
// 'ready' = implemented, 'planned' = selectable but inert (hint only, runs
// as usual). (none) is the blank default: nothing chosen, the code runs and
// displays normally. Each future DSA registers one entry here — and, later,
// its own visualiser module against the same id.
// Sub-modes use dot notation: parent.submode (e.g., 'two-pointers.remove-duplicate')
// EXCEPT under pure display folders (folder: true, e.g. the 2026-11-05 'DSA'
// folder): their sub-modes keep their own unsuffixed ids ('stack', …) so every
// family check / visualiser gate keeps working unchanged.
export const DSA_MODES = [
  { id: 'none',         label: '(none / normal run)', status: 'ready' },
  { id: 'recursion',    label: 'Recursion',           status: 'ready' },
  { id: 'two-pointers', label: 'Two Pointers',        status: 'ready', subModes: [
    { id: 'two-pointers.remove-duplicate', label: 'Remove Duplicate' },
    { id: 'two-pointers.two-sum',          label: 'Two Sum' },
    { id: 'two-pointers.reverse-array-string'   , label: 'Reverse Array/String'},
    { id: 'two-pointers.valid-palindrome', label: 'Valid Palindrome'},
    { id: 'two-pointers.container-with-most-water',  label: 'Container With Most Water' }
  ] },
  { id: 'dsa',          label: 'DSA', folder: true,   status: 'ready', subModes: [
    { id: 'stack',       label: 'Stack',       status: 'ready' },
    { id: 'queue',       label: 'Queue',       status: 'planned' },
    { id: 'linked-list', label: 'Linked List', status: 'planned' },
  ] }
];
export const DSA_STORE_KEY = 'vizDsaMode';

// Flat lookup across the registry, including sub-modes. An unknown id falls
// back to the blank default so a stale persisted value can never name a
// nonexistent mode.
export function dsaEntryById(id) {
  for (const m of DSA_MODES) {
    if (m.id === id) return m;
    for (const s of m.subModes || []) if (s.id === id) return s;
  }
  return DSA_MODES[0];
}

// Family of a stored id: sub-modes (dot notation, e.g. 'two-pointers.two-sum')
// belong to their parent's family; top-level ids are their own family. Every
// mode check in the render paths goes through this — never through the
// trigger's label text, which is cosmetic (breadcrumb) only.
export function dsaFamily(id = 'none') {
  const own = dsaEntryById(id).id;
  return own.includes('.') ? own.slice(0, own.indexOf('.')) : own;
}

// ── Recursion tree ──
export const TREE_NODE_CAP = 20000;   // nodes drawn; overflow becomes a summary row

// ── Stack visualiser (2026-11-03-stack-visualiser-design.md) ──
// Minimum slot count: a figure with ≤ this many items always draws exactly
// this many slots (bottom-up, dashed empties above). Beyond it the figure
// GROWS to its content height (2026-11-05-stack-dynamic-growth-design.md,
// grilled Q1–Q6) — this constant is the floor, not a cap.
export const STACK_VIS_CAP = 8;
// Contract C (grilled): a user-defined class qualifies with `push` + `pop`;
// optional ops degrade gracefully — a missing method simply never matches a
// frame, its visual never appears. Each method is recorded with the def's
// LINE NUMBER, which matches the runner's per-frame `sig` (= co_firstlineno).
export const STACK_CONTRACT = [
  { key: 'push',  names: ['push'] },
  { key: 'pop',   names: ['pop'] },
  { key: 'peek',  names: ['peek', 'top'] },
  { key: 'init',  names: ['__init__'] },
  { key: 'empty', names: ['is_empty', 'isEmpty', '__bool__'] },
  { key: 'size',  names: ['size', 'length', '__len__'] },
];

// ── Editor indentation ──
export const INDENT = '    ';   // one indentation level
// Line that closes one block level (return/pass/break/continue/raise).
export const DEDENT_LINE = /^\s*(return\b|pass\b|break\b|continue\b|raise\b)/;
// Compound-header keyword line (if/for/while/def/try/with/match …).
export const COMPOUND_KW = /^(?:\s*)(?:async\s+)?(?:if|elif|else|for|while|try|except|finally|with|def|class|match|case)\b/;

// ── Step auto-scroll (navigation/steps.js) ──
export const STEP_MARGIN = 22;        // px of breathing room so a tracked line never
                                      // glues to the viewport edge
export const STEP_ANIM_MS = 150;      // glide time for automatic step adjustments

// ── Splitters ──
export const SPLIT_KEY = 'vizSplitWidth';   // localStorage key for the editor/output split
export const MIN_RIGHT = 260;               // narrowest the output column may get
export const MIN_LEFT = 320;                // narrowest the editor column may get
export const VARS_KEY = 'vizVarsHeight';    // localStorage key for the variables-panel split
export const MIN_VARS = 48;                 // shortest the variables panel may get
export const OUT_BODY_MIN = 80;             // #outputBody's own min-height (style.css)
