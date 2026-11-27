// Hash Table (Linear Probing) sim (2026-11-27 design, R2 Q6): runs runner.py
// on the default code with CPython, replays the trace through the pure facts
// module, and checks the moments the animation must show.
//   node tests/hashtable.sim.mjs          → assertions
//   node tests/hashtable.sim.mjs --dump   → one caption per step
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DSA_DEFAULT_CODE } from '../src/config.js';
import { analyse, frameAt } from '../src/panels/hashtableFacts.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const py = `
import sys, json
g = {}
exec(open("runner.py", encoding="utf-8").read(), g)
sys.stdout.write(g["__viz_run"](sys.stdin.read()))
`;
const run = (code) => JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', py], { cwd: root, input: code, maxBuffer: 1 << 28 }).toString());

const trace = run(DSA_DEFAULT_CODE['hash-table-linear-probe']);
assert.equal(trace.error, null, 'default code runs without error');
const facts = analyse(trace.steps);
const frames = trace.steps.map((_, i) => frameAt(facts, i));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

if (process.argv.includes('--dump')) {
  let last = '';
  frames.forEach((f, i) => {
    const c = strip(f.caption);
    const a = f.figures.find((x) => x.active);
    const extra = a ? ` [home ${a.home} cur ${a.cursor} scan ${a.scan} gap ${a.gap}${a.ghost ? ' ghost ' + a.ghost.key : ''}${a.old ? ' OLD' : ''}${a.wrapNow ? ' WRAP' : ''}]` : '';
    if (c + extra !== last) console.log(String(i).padStart(4), trace.steps[i].line, c + extra);
    last = c + extra;
  });
  process.exit(0);
}

const caps = frames.map((f) => strip(f.caption));
const has = (re, msg) => assert.ok(caps.some((c) => re.test(c)), msg);
const tableNames = facts.tables.map((t) => t.name);
assert.deepEqual(tableNames, ['table', 'tiny'], 'two tables, by variable name, first-appearance order');

has(/hash\('fig'\): character/, 'hash strip walks the characters of fig');
has(/slot 4 holds 'fig' ≠ 'lime' → collision/, 'lime collides with fig in slot 4');
has(/slot 4 was the last slot → wrap around to slot 0/, 'lime wraps to slot 0');
assert.ok(frames.some((f) => f.figures.some((x) => x.wrapNow)), 'a wrap is flagged for the arrow');
has(/rehash: count 3 > 5 \/ 2/, 'rehash triggered past half full');
assert.ok(frames.some((f) => f.figures.some((x) => x.old && x.old.table.size === 5 && x.table.size === 13)), 'old 5-slot table shown above the new 13-slot one');
assert.ok(frames.some((f) => f.figures.some((x) => x.old && x.old.crossed.size === 3)), 'all three old slots crossed out once re-inserted');
has(/update: 'apple' already lives in slot 6 → value becomes 30, count stays 6/, 'apple update keeps the count');
has(/slot 9 is empty → 'kiwi' is not in the table/, 'kiwi lookup stops at the empty slot');
has(/KeyError/, 'missing key raises KeyError');
has(/array\[6\] = None — a gap/, 'deleting apple leaves a gap');
has(/'lime' stays at slot 7/, 'lime stays put');
has(/'banana' moves 8 → 6/, 'banana moves back to its home');
has(/'jam' moves 0 → 12/, 'jam moves back across the wrap');
has(/cluster ends/, 'cluster scan stops at an empty slot');
has(/get_all_keys: slot \d+ is empty — skip/, 'scan cursor walks empty slots');
has(/get_all_keys\(\) → \['banana', 'lime', 'jam'\]/, 'scan result badge');
has(/__contains__\('banana'\) → True/, 'contains → True');
has(/__contains__\('kiwi'\) → False/, 'contains → False');
has(/__len__\(\) → \d/, 'len badge');
has(/is_empty\(\) → True/, 'is_empty badge');
assert.ok(frames.some((f) => /Table is full! All 3 slots were probed/.test(f.banner || '')), 'tiny table full banner');
has(/linear_probe raised ValueError — every slot holds another key/, 'full-table caption explains the ValueError');
has(/rehash: count 2 > 3 \/ 2, but there is no bigger size left/, 'tiny cannot grow');
has(/all 3 slots probed, none empty and none holds 'd'/, 'KeyError on a full table explained');
// Every probe trail stays inside its own table and never repeats a slot.
for (const f of frames) {
  if (!f.probe) continue;
  const slots = f.probe.trail.map((e) => e.slot);
  assert.equal(new Set(slots).size, slots.length, 'trail never repeats a slot');
  assert.ok(slots.every((s) => s >= 0 && s < f.probe.size), 'trail inside the table');
}
console.log(`ok — ${trace.steps.length} steps, ${frames.filter((f) => f.probe).length} with a probe`);
