// Mode switch clears the previous run (Output + Variables + visualiser tab).
// Drives the real app in headless Chromium: starts `python -m http.server`
// in the repo, loads index.html (Pyodide comes from the CDN, so this needs
// network), visualises, switches modes and checks nothing stale survives.
//   node tests/mode-switch.e2e.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8771);
const server = spawn(process.env.PYTHON || 'python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = (cond, msg) => { assert.ok(cond, msg); passed++; console.log(`  ✓ ${msg}`); };

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('vizDsaMode', 'none'));
  for (let i = 0; ; i++) {   // the server needs a moment to bind
    try { await page.goto(`http://127.0.0.1:${PORT}/index.html`); break; } catch (e) { if (i > 40) throw e; await page.waitForTimeout(250); }
  }
  await page.waitForFunction(() => !document.getElementById('btnVisualize').disabled, null, { timeout: 180000 });

  const pick = (id) => page.evaluate((v) => document.querySelector(`#dsaOptions button[data-value="${v}"]`).click(), id);
  const idle = () => page.waitForFunction(() => document.getElementById('status').textContent.includes('Python ready'), null, { timeout: 60000 });
  const visualize = async () => {
    await page.click('#btnVisualize');
    await idle();
    await page.waitForFunction(() => !/^\s*(Step\s*)?0 \/ 0/.test(document.getElementById('stepLabel').textContent), null, { timeout: 60000 });
  };
  const boxes = () => page.evaluate(() => ({
    out: document.getElementById('outputBody').textContent.trim(),
    vars: document.getElementById('varsBody').textContent.trim(),
    tabs: document.getElementById('outTabs').hidden,
    step: document.getElementById('stepLabel').textContent.replace(/\s+/g, ' ').trim(),
    code: document.getElementById('codeInput').value,
  }));
  const isCleared = (b) => b.out === '(no output yet)' && b.vars === 'Run some code first.' && b.tabs && /0 \/ 0$/.test(b.step);

  console.log('Queue → Recursion');
  await pick('queue');
  await visualize();
  let b = await boxes();
  check(b.out.includes('serve: A') && b.vars !== 'Run some code first.' && !b.tabs, 'Queue run fills Output, Variables and its tab');
  await pick('recursion');
  b = await boxes();
  check(isCleared(b), 'switching to Recursion empties Output, Variables and the tab bar');
  check(b.code.startsWith('def fib('), 'untouched Queue default swapped for the Recursion default');
  await visualize();
  b = await boxes();
  check(b.out.includes('8') && b.vars !== 'Run some code first.', 'Visualize after the switch fills both boxes again');

  console.log('Same mode re-picked');
  const before = b.out;
  await pick('recursion');
  b = await boxes();
  check(b.out === before && b.vars !== 'Run some code first.', 're-picking the active mode keeps the results');

  console.log('Sub-mode → sub-mode');
  await pick('two-pointers.two-sum');
  check(isCleared(await boxes()), 'Recursion → Two Sum clears');
  await visualize();
  check((await boxes()).out.includes('['), 'Two Sum run fills Output');
  await pick('two-pointers.remove-duplicate');
  check(isCleared(await boxes()), 'Two Sum → Remove Duplicate clears');

  console.log('Edited code + error message');
  await pick('none');
  await page.fill('#codeInput', 'x = 1\nprint(x / 0)\n');
  await visualize();
  b = await boxes();
  check(b.out.includes('ZeroDivisionError'), 'error run shows the error in Output');
  await pick('stack');
  b = await boxes();
  check(isCleared(b) && !b.out.includes('ZeroDivisionError'), 'switching clears the error message too');
  check(b.code.startsWith('x = 1'), 'edited code stays in the editor');

  console.log('Late result from an abandoned run');
  await page.fill('#codeInput', 'total = 0\nfor i in range(4000):\n    total += i\nprint("late", total)\n');
  await page.evaluate(() => {
    document.getElementById('btnVisualize').click();
    document.querySelector('#dsaOptions button[data-value="queue"]').click();
  });
  await idle();
  await page.waitForTimeout(300);
  b = await boxes();
  check(isCleared(b) && !b.out.includes('late'), 'a run started before the switch never fills the boxes');

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(`ok — ${passed} checks`);
} finally {
  await browser.close();
  server.kill();
}
