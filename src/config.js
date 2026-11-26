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
  // remove-duplicate default code.
  'two-pointers.remove-duplicate': [
    'def removeDuplicates(nums: List[int]) -> int:',
    '    i = 1',
    '',
    '    for j in range(1, len(nums)):',
    '        if nums[j] != nums[i - 1]:',
    '            nums[i] = nums[j]',
    '            i += 1',
    '',
    '    return i',
    '',
    "nums = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4]",
    'k = removeDuplicates(nums)',
    'print("k =", k, "nums[:k] =", nums[:k])',
  ].join('\n'),
  // two sum default code.
  'two-pointers.two-sum': [
    'def twoSum(num: List[int], target: int) -> List[int]:',
    '    left = 0',
    '    right = len(num) - 1',
    '',
    '    while left < right:',
    '        if num[left] + num[right] == target:',
    '            return [left, right]',
    '        elif num[left] + num[right] < target:',
    '            left += 1',
    '        else:',
    '            right -= 1',
    '',
    '    return []',
    '',
    'if __name__ == "__main__":',
    '    lst = [2, 3, 5, 7, 9, 11]',
    '    print(twoSum(lst, 12))',
  ].join('\n'),
  // reverse array / string default code.
  'two-pointers.reverse-array-string': [
    'def reverse_arr(arr: List[int]):',
    '    left = 0',
    '    right = len(arr) - 1',
    '    while left < right:',
    '        arr[left], arr[right] = arr[right], arr[left]',
    '        left += 1',
    '        right -= 1',
    '',
    '    return arr',
    '',
    'if __name__ == "__main__":',
    '    num = [1,2,3,4,5]',
    '    reverse_arr(num)',
    '    print(num)',
  ].join('\n'),
  // Valid Palindrome default code.
  'two-pointers.valid-palindrome': [
    'def isPalindrome(string: str) -> bool:',
    '    left = 0',
    '    right = len(string) - 1',
    '',
    '    while left < right:',
    '',
    '        while left < right and not string[left].isalnum():',
    '            left += 1',
    '',
    '        while left < right and not string[right].isalnum():',
    '            right -= 1',
    '',
    '        if string[left].lower() != string[right].lower():',
    '            return False',
    '',
    '        left += 1',
    '        right -= 1',
    '',
    '    return True',
    '',
    'if __name__ == "__main__":',
    '    s = "A man, a plan, a canal: Panama"',
    '    print(isPalindrome(s))',
  ].join('\n'),
  // Container with most water default code.
  'two-pointers.container-with-most-water': [
    'def maxArea(height: List[int]) -> int:',
    '    left = 0',
    '    right = len(height) - 1',
    '    maxArea = 0',
    '',
    '    while left < right:',
    '        currentArea = min(height[left], height[right]) * (right - left)',
    '        maxArea = max(maxArea, currentArea)',
    '',
    '        if height[left] < height[right]:',
    '            left += 1',
    '        else:',
    '            right -= 1',
    '',
    '    return maxArea',
    '',
    'if __name__ == "__main__":',
    '    heights = [1, 8, 6, 2, 5, 4, 8, 3, 7]',
    '    print(maxArea(heights))',
  ].join('\n'),
  // Stack default code. push must use `self.<list>.append` — that is how the
  // stack visualiser finds the list to draw (scanStackSource/pushBodyMatch).
  'stack': [
    'class Stack:',
    '    def __init__(self, max_capacity):',
    '        if max_capacity <= 0:',
    '            raise ValueError("Capacity should be larger than 0.")',
    '        self.max_capacity = max_capacity',
    '        self.items = []',
    '',
    '    def is_full(self):',
    '        return len(self.items) == self.max_capacity',
    '',
    '    def is_empty(self):',
    '        return len(self.items) == 0',
    '',
    '    def size(self):',
    '        return len(self.items)',
    '',
    '    def push(self, item):',
    '        if self.is_full():',
    '            raise OverflowError("Stack is full")',
    '        self.items.append(item)',
    '',
    '    def pop(self):',
    '        if self.is_empty():',
    '            raise IndexError("Stack is empty")',
    '        return self.items.pop()',
    '',
    '    def peek(self):',
    '        if self.is_empty():',
    '            raise IndexError("Stack is empty")',
    '        return self.items[-1]',
    '',
    '    def clear(self):',
    '        self.items.clear()',
    '',
    'if __name__ == "__main__":',
    '    s = Stack(3)',
    '    s.push(10)',
    '    s.push(20)',
    '    s.push(30)',
    '    print("full?", s.is_full())',
    '',
    '    try:',
    '        s.push(40)',
    '    except OverflowError as e:',
    '        print("push(40) failed:", e)',
    '',
    '    print("peek:", s.peek())',
    '    print("pop:", s.pop())',
    '    print("pop:", s.pop())',
    '    print("size:", s.size())',
    '',
    '    s.clear()',
    '    print("empty?", s.is_empty())',
  ].join('\n'),
  // Queue default code (linear array queue: front/rear indices).
  'queue': [
    'class Queue:',
    '    def __init__(self, max_capacity):',
    '        if max_capacity <= 0:',
    '            raise ValueError("Capacity should be larger than 0.")',
    '        self.array = [None] * max_capacity',
    '        self.front = 0   # index of the next item to serve',
    '        self.rear = 0    # index where the next item goes',
    '',
    '    def __len__(self):',
    '        return self.rear - self.front',
    '',
    '    def is_empty(self):',
    '        return len(self) == 0',
    '',
    '    def is_full(self):',
    '        # Linear queue: once rear reaches the end, slots freed at the',
    '        # front are never reused (a Circular Queue fixes this).',
    '        return self.rear == len(self.array)',
    '',
    '    def append(self, item):',
    '        if self.is_full():',
    '            raise OverflowError("Queue is full")',
    '        self.array[self.rear] = item',
    '        self.rear += 1',
    '',
    '    def serve(self):',
    '        if self.is_empty():',
    '            raise IndexError("Queue is empty")',
    '        item = self.array[self.front]',
    '        self.array[self.front] = None',
    '        self.front += 1',
    '        return item',
    '',
    '    def peek(self):',
    '        if self.is_empty():',
    '            raise IndexError("Queue is empty")',
    '        return self.array[self.front]',
    '',
    '    def clear(self):',
    '        self.array = [None] * len(self.array)',
    '        self.front = 0',
    '        self.rear = 0',
    '',
    'if __name__ == "__main__":',
    '    q = Queue(4)',
    '    q.append("A")',
    '    q.append("B")',
    '    q.append("C")',
    '    print("peek:", q.peek())',
    '    print("serve:", q.serve())',
    '    print("serve:", q.serve())',
    '    print("size:", len(q))',
    '',
    '    q.append("D")',
    '    print("full?", q.is_full())',
    '',
    '    try:',
    '        q.append("E")',
    '    except OverflowError as e:',
    '        print("append(E) failed:", e, "- size is only", len(q))',
    '',
    '    q.clear()',
    '    print("empty?", q.is_empty())',
  ].join('\n'),
  // Circular Queue default code (front/rear wrap with %; length counter).
  'circular queue': [
    'class CircularQueue:',
    '    def __init__(self, max_capacity):',
    '        if max_capacity <= 0:',
    '            raise ValueError("Capacity should be larger than 0.")',
    '        self.array = [None] * max_capacity',
    '        self.front = 0   # index of the next item to serve',
    '        self.rear = 0    # index where the next item goes',
    '        # front == rear both when empty AND when full, so count the items.',
    '        self.length = 0',
    '',
    '    def __len__(self):',
    '        return self.length',
    '',
    '    def is_empty(self):',
    '        return self.length == 0',
    '',
    '    def is_full(self):',
    '        return self.length == len(self.array)',
    '',
    '    def append(self, item):',
    '        if self.is_full():',
    '            raise OverflowError("Queue is full")',
    '        self.array[self.rear] = item',
    '        self.rear = (self.rear + 1) % len(self.array)   # wrap to index 0',
    '        self.length += 1',
    '',
    '    def serve(self):',
    '        if self.is_empty():',
    '            raise IndexError("Queue is empty")',
    '        item = self.array[self.front]',
    '        self.array[self.front] = None',
    '        self.front = (self.front + 1) % len(self.array)   # wrap to index 0',
    '        self.length -= 1',
    '        return item',
    '',
    '    def peek(self):',
    '        if self.is_empty():',
    '            raise IndexError("Queue is empty")',
    '        return self.array[self.front]',
    '',
    '    def clear(self):',
    '        self.array = [None] * len(self.array)',
    '        self.front = 0',
    '        self.rear = 0',
    '        self.length = 0',
    '',
    'if __name__ == "__main__":',
    '    q = CircularQueue(4)',
    '    q.append("A")',
    '    q.append("B")',
    '    q.append("C")',
    '    print("serve:", q.serve())',
    '    print("serve:", q.serve())',
    '',
    '    # rear wraps around to index 0 and reuses the freed slots',
    '    q.append("D")',
    '    q.append("E")',
    '    q.append("F")',
    '    print("full?", q.is_full(), "size:", len(q))',
    '    print("front:", q.front, "rear:", q.rear)',
    '',
    '    try:',
    '        q.append("G")',
    '    except OverflowError as e:',
    '        print("append(G) failed:", e)',
    '',
    '    print("peek:", q.peek())',
    '    while not q.is_empty():',
    '        print("serve:", q.serve())',
    '',
    '    q.clear()',
    '    print("empty?", q.is_empty())',
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
  { id: 'none', label: '(none / normal run)', status: 'ready' },
  { id: 'recursion', label: 'Recursion', status: 'ready' },
  {
    id: 'two-pointers', label: 'Two Pointers', status: 'ready', subModes: [
      { id: 'two-pointers.remove-duplicate', label: 'Remove Duplicate' },
      { id: 'two-pointers.two-sum', label: 'Two Sum' },
      { id: 'two-pointers.reverse-array-string', label: 'Reverse Array/String' },
      { id: 'two-pointers.valid-palindrome', label: 'Valid Palindrome' },
      { id: 'two-pointers.container-with-most-water', label: 'Container With Most Water' }
    ]
  },
  {
    id: 'sliding-window', label: 'Sliding Window', status: 'planned', subModes: [
      { id: 'sliding-window.find-k-closest-elements', label: 'Find K Closest Elements' },
      { id: 'sliding-window.lz77', label: 'LZ77' }
    ]
  },
  {
    id: 'dynamic-programming', label: 'Dynamic Programming', status: 'planned', subModes: [
      { id: 'dynamic-programming.coins-change', label: 'Coins Change' },
      { id: 'dynamic-programming.unbounded-knapsack', label: 'Unbounded Knapsack' },
      { id: 'dynamic-programming.0-1-knapsack', label: '0/1 Knapsack' },
      { id: 'dynamic-programming.edit-distance', label: 'Edit Distance' }
    ]
  },
  {
    id: 'dsa', label: 'DSA', folder: true, status: 'ready', subModes: [
      { id: 'stack', label: 'Stack', status: 'ready' },
      { id: 'queue', label: 'Queue', status: 'ready' },
      { id: 'circular queue', label: 'Circular Queue', status: 'planned' },
      { id: 'linked-list', label: 'Linked List', status: 'planned' },
      { id: 'hash-table', label: 'Hash Table', status: 'planned' },
      { id: 'binary-tree', label: 'Binary Tree', status: 'planned' },
      { id: 'binary-search-tree', label: 'Binary Search Tree(BST)', status: 'planned' },
      { id: 'avl-tree', label: 'AVL Tree', status: 'planned' },
      { id: 'red-black-tree', label: 'Red Black Tree', status: 'planned' },
      { id: 'b-tree', label: 'B-Tree', status: 'planned' },
      { id: 'trie', label: 'Trie', status: 'planned' },
      { id: 'suffix-tree', label: 'Suffix Tree', status: 'planned' },
      { id: 'binary-heap', label: 'Binary Heap', status: 'planned' },
      { id: 'fibonacci-heap', label: 'Fibonacci Heap', status: 'planned' }
    ]
  }
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
export const TREE_SVG_CAP = 250;      // graphical (SVG) tree limit; bigger trees use the text view

// ── Stack visualiser (2026-11-03-stack-visualiser-design.md) ──
// Capacity-driven figure (2026-11-26 capacity design, grilled Q1–Q15): the
// instance's own capacity decides whether ONE dashed "room left" box is
// drawn above the content — the figure never pads out to the capacity.
// Sources, in order: the instance snapshot's capacity attribute (first name
// present in this list), then the `__init__` frame's local while that frame
// is the recorded top (same `sig` match as stackOpKey), then unknown.
// Only a genuine int > 0 counts: strings, floats, booleans (True is an int in
// Python) and 0/negative values all mean unknown.
export const STACK_CAPACITY_NAMES = [
  'max_capacity', 'capacity', 'max_size', 'maxsize', 'cap', 'limit',
  '_max_capacity', '_capacity', '_cap',
];
// Contract C (grilled): a user-defined class qualifies with `push` + `pop`;
// optional ops degrade gracefully — a missing method simply never matches a
// frame, its visual never appears. Each method is recorded with the def's
// LINE NUMBER, which matches the runner's per-frame `sig` (= co_firstlineno).
export const STACK_CONTRACT = [
  { key: 'push', names: ['push'] },
  { key: 'pop', names: ['pop'] },
  { key: 'peek', names: ['peek', 'top'] },
  { key: 'init', names: ['__init__'] },
  { key: 'empty', names: ['is_empty', 'isEmpty', '__bool__'] },
  { key: 'size', names: ['size', 'length', '__len__'] },
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

// ── Auto-play (navigation/play.js, 2026-11-15, grilled Q1–Q12) ──
// Per-step delay in ms for each playback speed. Fixed delays, not scaled to
// step count — a long run simply takes longer at Low, same as a video.
export const PLAY_SPEEDS = {
  low: 1000,
  normal: 450,
  high: 150,
};
export const PLAY_DEFAULT_SPEED = 'normal';   // session-only choice, resets per load

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
