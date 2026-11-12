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

// Per-mode default code templates (2026-11-07 design, grilled Q1–Q6): the
// editor swaps to a mode's template when a new mode is picked, but ONLY if
// the editor still holds the previous mode's default — user code is never
// overwritten. '(none)' maps to DEFAULT_CODE; a mode with no entry here (or
// every 'planned' mode) keeps the editor honest with its own fallback.
// Adding a future mode's default = adding one entry, nothing else.
export const DSA_DEFAULT_CODE = {
  'recursion': [
    'def fib(n):',
    '    if n <= 1:',
    '        return n',
    '    return fib(n-1) + fib(n-2)',
    '',
    'print(fib(6))',
  ].join('\n'),
};

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
  { id: 'sliding-window', label: 'Sliding Window',    status: 'planned', subModes: [
    { id: 'sliding-window.find-k-closest-elements', label: 'Find K Closest Elements' },
    { id: 'sliding-window.lz77', label: 'LZ77' }
  ] },
  { id: 'dsa',          label: 'DSA', folder: true,   status: 'ready', subModes: [
    { id: 'stack',       label: 'Stack',       status: 'ready' },
    { id: 'queue',       label: 'Queue',       status: 'planned' },
    { id: 'circular queue', label: 'Circular Queue', status: 'planned'},
    { id: 'linked-list', label: 'Linked List', status: 'planned' },
    { id: 'hash-table',  label: 'Hash Table', status: 'planned' },
    { id: 'binary-tree', label: 'Binary Tree', status: 'planned' },
    { id: 'binary-search-tree', label: 'Binary Search Tree(BST)', status: 'planned' },
    { id: 'avl-tree', label: 'AVL Tree', status: 'planned' },
    { id: 'red-black-tree', label: 'Red Black Tree', status: 'planned' },
    { id: 'b-tree', label: 'B-Tree', status: 'planned' },
    { id: 'trie', label: 'Trie', status: 'planned' },
    { id: 'suffix-tree', label: 'Suffix Tree', status: 'planned' },
    { id: 'binary-heap', label: 'Binary Heap', status: 'planned' },
    { id: 'fibonacci-heap', label: 'Fibonacci Heap', status: 'planned' }
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
export const MIN_RIGHT = 260;               // narrowest the output column may get
export const MIN_LEFT = 320;                // narrowest the editor column may get
export const MIN_VARS = 48;                 // shortest the variables panel may get
export const OUT_BODY_MIN = 80;             // #outputBody's own min-height (style.css)

// ── Data-science wheels: deferred to first use (2026-11-13, grilled Q1–Q2) ──
// Boot used to loadPackage pandas+matplotlib+sklearn before the run path —
// ~15–20 s of wheel fetch (sklearn alone pulls scipy+joblib+threadpoolctl)
// before the ready pill. Now boot fetches numpy only (near-instant, and
// pandas/matplotlib depend on it), and a run fetches the wheels its own
// code imports just before executing. One table is the single source of
// truth: Python import name → Pyodide package name (sklearn's distribution
// is 'scikit-learn' — the alias the boot loop already had to carry).
export const DS_PACKAGES = {
  numpy: 'numpy',
  pandas: 'pandas',
  matplotlib: 'matplotlib',
  sklearn: 'scikit-learn',
};

// Pyodide package names a piece of code needs (root module of every
// `import X` / `from X import …` present in DS_PACKAGES), order-stable by
// first appearance. Plain string scan: runner.py's ast-based
// _viz_user_import_names is nested inside __viz_run and unreachable from
// JS, and the table keeps the audit able to pin the mapping.
export function neededDsPackages(code) {
  const roots = new Set();
  const re = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import\b)/gm;
  for (let m; (m = re.exec(code)) !== null;) {
    roots.add((m[1] || m[2]).split('.')[0]);
  }
  return [...roots].filter((r) => r in DS_PACKAGES).map((r) => DS_PACKAGES[r]);
}
