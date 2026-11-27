// Hash Table (Separate Chaining) sim (2026-11-28 design, Q11): runs runner.py
// on the default code with CPython, replays the trace through the pure facts
// module, and checks the moments the animation must show.
//   node tests/chaining.sim.mjs          → assertions
//   node tests/chaining.sim.mjs --dump   → one caption per step
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DSA_DEFAULT_CODE } from '../src/config.js';
import { analyse, frameAt } from '../src/panels/chainingFacts.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const py = `
import sys, json
g = {}
exec(open("runner.py", encoding="utf-8").read(), g)
sys.stdout.write(g["__viz_run"](sys.stdin.read()))
`;
const run = (code) => JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', py], { cwd: root, input: code, maxBuffer: 1 << 28 }).toString());

const trace = run(DSA_DEFAULT_CODE['hash-table-separate-chaining']);
assert.equal(trace.error, null, 'default code runs without error');
const facts = analyse(trace.steps);
const frames = trace.steps.map((_, i) => frameAt(facts, i));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

if (process.argv.includes('--dump')) {
  let last = '';
  frames.forEach((f, i) => {
    const c = strip(f.caption);
    const a = f.figures.find((x) => x.active);
    const extra = a ? ` [home ${a.home} scan ${a.scanBucket} tags ${a.tags.map((t) => t.name + '@' + t.target).join(',')}${a.detached.length ? ' det ' + a.detached.map((d) => d.role + ':' + d.key).join(',') : ''}${a.links.size ? ' links ' + [...a.links].map((x) => x.join(':')).join(',') : ''}]` : '';
    if (c + extra !== last) console.log(String(i).padStart(4), trace.steps[i].line, c + extra);
    last = c + extra;
  });
  process.exit(0);
}

const caps = frames.map((f) => strip(f.caption));
const has = (re, msg) => assert.ok(caps.some((c) => re.test(c)), msg);
const any = (fn, msg) => assert.ok(frames.some(fn), msg);
assert.deepEqual(facts.tables.map((t) => t.name), ['table'], 'one table, by variable name (the size-1 table never got an array)');

has(/hash\('apple'\): character/, 'hash strip walks the characters');
has(/hash\('cherry'\) = 2 → go to bucket 2 \(chain of 1\)/, 'cherry goes to bucket 2, which already holds apple');
has(/current → apple ≠ 'cherry' → follow next/, 'walk passes apple');
has(/current is None → end of the chain: 'cherry' is a new key/, 'walk ends: new key');
any((f) => f.figures.some((x) => x.detached.some((d) => d.role === 'new' && d.key === 'cherry')), 'new cherry node floats before linking');
has(/array\[2\] = new node → cherry is now first in bucket 2 \(its next → apple\): insert at the FRONT/, 'cherry linked at the front');
has(/array\[1\] is None|array\[0\] is None → empty bucket: 'kiwi' is a new key/, 'insert into an empty bucket');
has(/load 7\/5 = 1\.40 — more keys than buckets is fine/, 'load factor passes 1');
has(/update: 'cherry' already lives in bucket 2 → value 3 → 30, count stays 7/, 'update keeps the count');
has(/current → apple = 'apple' → found, return its value \(node 3 of 3\)/, 'lookup walks to the last node');
has(/current → date = 'date' → found, return its value \(node 1 of 2\)/, 'lookup hits the first node');
has(/array\[1\] is None → bucket 1 is empty: 'lemon' is not here/, 'miss on an empty bucket');
any((f) => f.figures.some((x) => x.flashSlot.get(1) === 'hc-miss'), 'empty-bucket miss flashes the slot');
has(/__getitem__\('pear'\) raised KeyError — walked all 1 node of bucket 0's chain/, 'miss after walking a chain');
has(/melon\.next = cherry\.next → skip over cherry, straight to apple/, 'middle delete bypasses cherry');
any((f) => f.figures.some((x) => x.detached.some((d) => d.role === 'removed' && d.key === 'cherry')), 'removed cherry drops below');
has(/array\[3\] = date\.next → bucket 3 now starts at banana/, 'first-node delete moves the slot arrow');
has(/array\[0\] = None — kiwi was the only node, so bucket 0 is empty again/, 'only-node delete empties the bucket');
has(/__delitem__\('kiwi'\) raised KeyError — bucket 0 is empty/, 'delete miss on an empty bucket');
has(/__delitem__\('ham'\) raised KeyError — walked all 2 nodes of bucket 2's chain/, 'delete miss after walking a chain');
has(/get_all_keys: bucket 1 is empty — skip/, 'scan skips empty buckets');
has(/get_all_keys: bucket 2 · current → apple \(node 2 of 2\)/, 'scan walks inside a chain');
has(/get_all_keys\(\) → \['melon', 'apple', 'banana', 'fig'\]/, 'scan result');
has(/__contains__\('date'\) → True/, 'contains → True');
has(/get_all_keys: bucket 2 → head is melon, walk its chain of 2/, 'scan starts each bucket at its head');
has(/cherry is unlinked — no node or slot points at it/, 'unlinked node explained until return');
has(/__contains__\('lemon'\) → False/, 'contains → False');
has(/load_factor\(\) → 1\.4/, 'load_factor badge');
has(/is_empty\(\) → True/, 'is_empty badge');
console.log(`ok — ${trace.steps.length} steps, ${frames.filter((f) => f.walk).length} with a chain walk`);
