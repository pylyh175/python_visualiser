// Binary Search Tree sim (2026-11-29 design, Q10): runs runner.py on the
// default code with CPython, replays the trace through the pure facts
// module, and checks the moments the animation must show.
//   node tests/bst.sim.mjs          → assertions
//   node tests/bst.sim.mjs --dump   → one caption per step
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DSA_DEFAULT_CODE } from '../src/config.js';
import { analyse, frameAt } from '../src/panels/bstFacts.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const py = `
import sys, json
g = {}
exec(open("runner.py", encoding="utf-8").read(), g)
sys.stdout.write(g["__viz_run"](sys.stdin.read()))
`;
const run = (code) => JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', py], { cwd: root, input: code, maxBuffer: 1 << 28 }).toString());

const trace = run(DSA_DEFAULT_CODE['binary-search-tree']);
assert.equal(trace.error, null, 'default code runs without error');
const facts = analyse(trace.steps);
const frames = trace.steps.map((_, i) => frameAt(facts, i));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const keyOf = (f, k) => { const id = k.slice(1); const n = f.tree && (f.tree.nodes.get(id) || f.tree.loose.get(id)); return n ? n.key : k; };

if (process.argv.includes('--dump')) {
  let last = '';
  frames.forEach((f, i) => {
    const c = strip(f.caption);
    const marks = f.tree ? [...f.marks].map(([o, m]) => `${keyOf(f, 'n' + o)}:${m}`).join(',') : '';
    const extra = ` [${f.op ? f.op.label + (f.op.live ? '' : ' (last)') : '-'}${f.caseBadge ? ' | ' + f.caseBadge : ''}${f.slot ? ` | slot ${f.slot.state} ${keyOf(f, 'n' + f.slot.parent)}.${f.slot.side}` : ''} | ${marks} | tags ${f.tags.map((t) => t.name + '@' + (t.target === 'ghost' ? 'ghost' : keyOf(f, t.target))).join(',')}${f.flights.length ? ' | fly ' + f.flights.map((x) => `${x.kind}:${x.text}`).join(',') : ''}${f.heights.size ? ' | h ' + [...f.heights].map(([o, v]) => keyOf(f, 'n' + o) + '=' + v).join(',') : ''}${f.visits.size ? ' | #' + [...f.visits].map(([o, v]) => keyOf(f, 'n' + o) + '=' + v).join(',') : ''} | v${f.counters ? f.counters.visited : '-'}]`;
    if (c + extra !== last) console.log(String(i).padStart(4), trace.steps[i].line, c + extra);
    last = c + extra;
  });
  process.exit(0);
}

const caps = frames.map((f) => strip(f.caption));
const has = (re, msg) => assert.ok(caps.some((c) => re.test(c)), msg);
const any = (fn, msg) => assert.ok(frames.some(fn), msg);
const markOn = (f, key, m) => f.tree && [...f.marks].some(([o, x]) => x === m && f.tree.nodes.get(o) && f.tree.nodes.get(o).key === key);
assert.deepEqual(facts.tables.map((t) => t.name), ['bst'], 'one tree, by variable name');

has(/insert\(50, 'A'\): the tree is empty/, 'first insert into an empty tree');
has(/current is None → empty spot: 50 goes here as the root/, 'empty tree: the new node becomes the root');
has(/returns 50 → root becomes 50/, 'root link set');
has(/35 < 50 → go left to 30/, 'compare and go left');
has(/35 > 30 → go right to 40/, 'compare and go right');
has(/current is None → empty spot: 35 goes here, as 40\.left/, 'ghost slot for the insert');
any((f) => f.slot && f.slot.state === 'new' && f.tree.loose.get(f.slot.oid) && f.tree.loose.get(f.slot.oid).key === 35, 'new node 35 drawn in the slot');
has(/returns 35 → 40\.left becomes 35/, 'the changed link is named');
has(/returns 40 → 30\.right stays 40 \(no change\)/, 'unchanged links are muted');
any((f) => f.flights.some((x) => x.kind === 'ret' && x.text === '35'), 'return chip travels up');
has(/insert\(40, 'X'\) raised ValueError — 40 is already in the tree/, 'duplicate insert');
any((f) => markOn(f, 40, 'dup'), 'duplicate node flagged');
has(/45 == 45 → found/, 'search hit');
has(/search\(45\) → 'I'/, 'search returns the item');
has(/search\(55\) raised KeyError — 55 is not in the tree \(fell off at 60\.left\)/, 'search miss');
any((f) => f.slot && f.slot.state === 'miss', 'miss slot turns red');
has(/35 in bst (→|returns) True/, 'contains True');
has(/99 in bst → False/, 'contains False');
has(/at 30: left is 20 → keep going left/, 'minimum walk');
has(/get_minimal\(50\) → node 20/, 'minimum result');
has(/get_maximal\(50\) → node 80/, 'maximum result');
has(/successor of 50: one step right to 70, then all the way left/, 'successor walk');
has(/get_successor\(50\) → node 60/, 'successor result');
has(/found 20 → case 1 \(leaf\)/, 'delete case 1');
has(/returns None → 30\.left becomes None/, 'leaf unlinked');
has(/found 30 → case 2 \(one child\): return its only child 40/, 'delete case 2');
has(/returns 40 → 50\.left becomes 40/, 'child takes the place');
has(/found 50 → case 3 \(two children\)/, 'delete case 3');
has(/successor is 60 → copy its key and item into 50's node/, 'successor found inside delete');
any((f) => f.flights.some((x) => x.kind === 'copy' && x.text === '60'), 'successor key flies into the node');
has(/removing the successor: found 60 → case 2/, 'successor removed by the inner delete');
any((f) => f.caseBadge === 'removing successor 60 · case 2 · one child', 'case-3 sub badge');
has(/delete\(99\) raised KeyError — 99 is not in the tree \(fell off at 80\.right\)/, 'delete miss');
has(/height\(40\) = 1 \+ max\(1, 1\) = 2/, 'height computed bottom-up');
any((f) => f.heights.size === 10, 'every node gets a height badge');
has(/append 20 \(visit #1\) → result = \[20\]/, 'in-order visits the smallest first');
any((f) => f.visits.size === 10 && f.result && f.result.items.length === 10, 'in-order numbers every node');
has(/in_order\(\) → \[35, 40, 45, 60, 65, 70, 80\]/, 'final in-order');
any((f) => f.counters && f.counters.visited === 5 && f.op && /delete\(50\)/.test(f.op.label), 'visited counts the case-3 extra walks');
any((f) => f.counters && f.counters.height === 4 && f.counters.size === 10, 'counters track size and height');
console.log(`ok — ${trace.steps.length} steps, ${frames.filter((f) => f.op && f.op.live).length} inside an operation`);
