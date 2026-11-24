/* ═══════════════ Two-pointer pattern logic (pure — no DOM, no state) ═══════════════
   Shared by every two-pointers pane (generic, Two Sum, Remove Duplicates,
   Reverse, Palindrome, Container) and importable from Node for testing.
   2026-11-24 visualisation-upgrade design. */

// Name heuristics for pointer-like variables (pair order = display order:
// the first name is drawn as the "first" pointer).
export const PTR_NAME_PAIRS = [
    ['left', 'right'], ['l', 'r'], ['start', 'end'], ['i', 'j'],
    ['slow', 'fast'], ['low', 'high'], ['lo', 'hi'], ['begin', 'end'],
    ['first', 'last'], ['head', 'tail'], ['p', 'q'], ['read', 'write'],
];

// Colour role of a pointer, by name. Converging pairs read left/right
// (blue/red); same-direction pairs read slow/fast (amber/green) so a
// writer/reader pair no longer looks like "left vs right".
const ROLE_BY_NAME = {
    left: 'left', l: 'left', start: 'left', lo: 'left', low: 'left', begin: 'left',
    first: 'left', head: 'left', p: 'left',
    right: 'right', r: 'right', end: 'right', hi: 'right', high: 'right', last: 'right',
    tail: 'right', q: 'right',
    slow: 'slow', i: 'slow', k: 'slow', write: 'slow', w: 'slow', insert: 'slow', pos: 'slow',
    fast: 'fast', j: 'fast', read: 'fast', scan: 'fast',
};

// Roles for a detected pair: name-based, with positional fallbacks so the
// two markers never share a colour.
export function pointerRoles(firstName, secondName) {
    const a = ROLE_BY_NAME[firstName] || ROLE_BY_NAME[String(firstName).toLowerCase()] || 'left';
    let b = ROLE_BY_NAME[secondName] || ROLE_BY_NAME[String(secondName).toLowerCase()] || 'right';
    if (b === a) b = a === 'left' ? 'right' : a === 'slow' ? 'fast' : a === 'fast' ? 'slow' : 'left';
    return [a, b];
}

// Words that can sit inside brackets without being an index variable.
const NOT_INDEX = new Set([
    'len', 'None', 'True', 'False', 'and', 'or', 'not', 'if', 'else', 'for', 'in',
    'is', 'lambda', 'int', 'str', 'float', 'bool', 'list', 'dict', 'tuple', 'set',
    'object', 'Any', 'range', 'min', 'max', 'abs', 'self',
]);
// Typing generics: `List[int]` is an annotation, not a subscript of a value.
const NOT_SEQUENCE = new Set([
    'List', 'Dict', 'Tuple', 'Set', 'Optional', 'Union', 'Sequence', 'Iterable',
    'Callable', 'Type', 'FrozenSet', 'Deque', 'list', 'dict', 'tuple', 'set',
    'type', 'Literal', 'Annotated',
    // keywords before a list literal: `return [l, r]`, `x in [a, b]` …
    'return', 'in', 'yield', 'and', 'or', 'not', 'if', 'elif', 'else', 'while',
    'for', 'is', 'lambda', 'await', 'assert', 'del', 'with', 'from', 'import',
    'raise', 'print',
]);

// Static scan of the source: which names index which sequence. `arr[left]`,
// `s[l:r+1]`, `nums[i - 1]` all record their identifiers against the name in
// front of the bracket. Returns { seqName: [idxName, …] } in first-appearance
// order. Plain text scan (precedent: stack.js scanStackSource) — no tracer
// change; comment lines are dropped so `# arr[x]` never counts.
export function scanPointerHints(code) {
    const hints = {};
    const src = String(code || '').replace(/(^|\s)#.*$/gm, '$1');
    const re = /([A-Za-z_]\w*)\s*\[([^[\]]*)\]/g;
    for (let m; (m = re.exec(src)) !== null;) {
        const seq = m[1];
        if (NOT_SEQUENCE.has(seq)) continue;
        const ids = (m[2].match(/[A-Za-z_]\w*/g) || []).filter((n) => !NOT_INDEX.has(n));
        if (!ids.length) continue;
        const list = hints[seq] || (hints[seq] = []);
        for (const n of ids) if (!list.includes(n)) list.push(n);
    }
    return hints;
}

const isArrayLike = (v) => !!v && typeof v === 'object' && typeof v.length === 'number';
// Pointers may sit one slot past either end (-1 or len): that is exactly
// the moment a loop condition fails, so it must stay visible (ghost slot).
const isPointer = (v, len) => typeof v === 'number' && Number.isInteger(v) && v >= -1 && v <= len;

// Find a sequence + two pointer variables in one step's locals.
//   kind: 'array' (lists/tuples) | 'string'
//   hints: scanPointerHints() result for the run's code (or null)
//   pin: { arr, left, right } user-pinned names (or null) — when set it is
//        the ONLY answer: a step without those names has no detection, so the
//        pane freezes on the pinned view instead of jumping to another pair.
// Returns { arrName, arrValue, leftName, rightName, leftIdx, rightIdx } | null.
export function detectSequencePointers(locals, { kind = 'array', hints = null, pin = null, maxStrLen = 500 } = {}) {
    const loc = locals || {};
    const isSeq = kind === 'string'
        ? (v) => typeof v === 'string' && v.length > 0 && v.length <= maxStrLen
        : isArrayLike;
    const mk = (arrName, leftName, rightName) => ({
        arrName, arrValue: loc[arrName], leftName, rightName,
        leftIdx: loc[leftName], rightIdx: loc[rightName],
    });

    if (pin) {
        const seq = loc[pin.arr];
        if (!isSeq(seq) || pin.left === pin.right) return null;
        const len = seq.length;
        return isPointer(loc[pin.left], len) && isPointer(loc[pin.right], len)
            ? mk(pin.arr, pin.left, pin.right) : null;
    }

    const entries = Object.entries(loc);
    let best = null;
    for (const [arrName, arr] of entries) {
        if (!isSeq(arr)) continue;
        const len = arr.length;
        const hinted = (hints && hints[arrName]) || [];
        const ints = entries.filter(([n, v]) => n !== arrName && isPointer(v, len));
        for (let a = 0; a < ints.length; a++) {
            for (let b = a + 1; b < ints.length; b++) {
                const n1 = ints[a][0], n2 = ints[b][0];
                let score = 0;
                let order = null;
                for (const [x, y] of PTR_NAME_PAIRS) {
                    if (n1 === x && n2 === y) { score += 10; order = [n1, n2]; }
                    else if (n1 === y && n2 === x) { score += 10; order = [n2, n1]; }
                }
                const h1 = hinted.indexOf(n1), h2 = hinted.indexOf(n2);
                if (h1 >= 0) score += 20;
                if (h2 >= 0) score += 20;
                // A pair needs a reason — a pointer-ish name pairing or real use as
                // an index of this sequence. Two arbitrary ints (a loop counter and
                // a total) that merely fall in range are not two pointers.
                if (score < 10) continue;
                if (!order) {
                    order = h1 >= 0 && h2 >= 0
                        ? (h1 <= h2 ? [n1, n2] : [n2, n1])
                        : (h1 >= 0 ? [n1, n2] : [n2, n1]);
                }
                if (!best || score > best.score) best = { score, arrName, order };
            }
        }
    }
    return best ? mk(best.arrName, best.order[0], best.order[1]) : null;
}

// Visible window over a long sequence: whole sequence when it fits the cap
// (always from index 0 — the 2026-11-17 bugfix, now shared by every pane);
// otherwise a cap-wide window anchored near the lower pointer, slid back so
// it never runs past the end.
export function visibleWindow(len, a, b, cap) {
    if (len <= cap) return [0, len];
    const lo = Math.max(0, Math.min(a, b));
    let start = Math.max(0, lo - 2);
    if (start + cap > len) start = Math.max(0, len - cap);
    return [start, Math.min(len, start + cap)];
}

// Bands of indices to draw when only `fit` cells fit the pane (2026-11-24
// viewport design): the whole sequence when it fits, otherwise one window
// around EACH pointer — merged when they touch — so neither pointer is ever
// cropped away (a single window lost the far pointer of a converging pair).
// Returns [[start, end), …] in order; a gap is implied between bands.
export function pointerBands(len, a, b, fit) {
    if (len <= 0) return [[0, 0]];
    if (len <= fit) return [[0, len]];
    const clamp = (x) => Math.max(0, Math.min(len - 1, x));
    const lo = clamp(Math.min(a, b)), hi = clamp(Math.max(a, b));
    // One window holds both pointers (plus a little context) when it can.
    if (hi - lo + 1 <= fit) {
        let start = Math.max(0, Math.round((lo + hi + 1) / 2 - fit / 2));
        if (start + fit > len) start = len - fit;
        return [[start, start + fit]];
    }
    // Two windows; one cell of width is reserved for the gap marker.
    const per = Math.max(1, Math.floor((fit - 1) / 2));
    const win = (c) => {
        let s = Math.max(0, c - Math.floor((per - 1) / 2));
        if (s + per > len) s = len - per;
        return [s, s + per];
    };
    const A = win(lo), B = win(hi);
    return A[1] >= B[0] ? [[A[0], Math.max(A[1], B[1])]] : [A, B];
}

// Indices whose value differs between two snapshots of the same sequence.
export function changedIndices(prev, cur) {
    if (!prev || !cur || prev.length !== cur.length) return [];
    const out = [];
    for (let i = 0; i < cur.length; i++) {
        if (JSON.stringify(prev[i]) !== JSON.stringify(cur[i])) out.push(i);
    }
    return out;
}

// "<", "=" or ">" for two comparable values.
export function cmpSymbol(a, b) {
    return a < b ? '<' : a > b ? '>' : '=';
}

// First numeric local with one of the given names (exact, then case-insensitive).
export function findNumberLocal(locals, names, exclude = []) {
    const loc = locals || {};
    for (const n of names) {
        if (!exclude.includes(n) && typeof loc[n] === 'number') return n;
    }
    const lower = names.map((n) => n.toLowerCase());
    for (const [k, v] of Object.entries(loc)) {
        if (typeof v === 'number' && !exclude.includes(k) && lower.includes(k.toLowerCase())) return k;
    }
    return null;
}

// A local that tracks a running best (max_area, maxArea, best, ans, …).
export function findBestLocal(locals, exclude = []) {
    for (const [k, v] of Object.entries(locals || {})) {
        if (typeof v !== 'number' || exclude.includes(k)) continue;
        if (/^(max|best|ans|res|result|most)/i.test(k)) return k;
    }
    return null;
}