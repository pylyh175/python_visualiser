/* ═══════════════ Pyodide runtime loading ═══════════════ */

import { state } from './state.js';
import { els } from './dom.js';
import { syncVisualizeEnabled } from './lock.js';

// The Python tracer lives in runner.py, fetched once at startup and executed
// in Pyodide to define __viz_run.
export async function init() {
  try {
    const resp = await fetch('runner.py');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    state.runnerSource = await resp.text();
    if (!state.runnerSource.trim()) throw new Error('runner.py is empty');
    console.log('Fetched runner.py, length:', state.runnerSource.length);
  } catch (err) {
    // file:// pages cannot read sibling files (browser CORS); the site must
    // be opened through start.bat (a tiny local web server) or any server.
    els.status.textContent = 'runner.py could not be loaded — open via start.bat (local web server)';
    console.error(err);
    return;
  }
  try {
    // Ground-truth guard (user report: opaque "check internet" on refresh): if
    // the <script src="…/pyodide.js"> tag failed (offline / blocked / OOM'd
    // tab), loadPyodide doesn't exist — name THAT instead of blaming a fetch.
    if (typeof loadPyodide !== 'function') {
      throw new Error('pyodide.js script did not load from cdn.jsdelivr.net (offline or blocked)');
    }
    console.log('Loading Pyodide from CDN…');
    // WASM heap headroom: Pyodide/Emscripten's small default heap can be tight
    // for deep recursion + big variable snapshots; give the runtime 4 MB.
    state.pyodide = await loadPyodide({
      totalMemory: 4 * 1024 * 1024,   // 4 MB heap for the WASM runtime
    });

    // Load data science libraries into Pyodide environment
    // This provides the same foundation for browser execution as the Python runner
    for (const libName of ["numpy", "pandas", "matplotlib", "sklearn", "scikit-learn"]) {
      try {
        await state.pyodide.loadPackage(libName);
      } catch (e) {
        // library not available in this Pyodide installation; preserve the error
        // for when users try to import it
        console.warn(`Pyodide package '${libName}' not available:`, e.message);
      }
    }

    console.log('Executing runner.py in Pyodide...');
    // Pin execution to the exact globals dict the run path uses (runner.js
    // writes __viz_code via state.pyodide.globals.set and reads __viz_run from
    // it) — never a namespace a future Pyodide version might pick itself.
    await state.pyodide.runPythonAsync(state.runnerSource, {
      globals: state.pyodide.globals,
    });

    // Ground-truth verification (2026-11-06 fresh-load bug): the old check ran
    // '__viz_run in globals()' THROUGH the Python evaluator, which returned a
    // false negative on first load even though runner.py defines __viz_run
    // unconditionally at top level — proof it mis-reported: typing any code
    // re-enabled the (init-gated) Visualize button and runs then worked on the
    // SAME runtime. Probe the object the run path actually uses, so
    // verification can never diverge from execution reality.
    const vizRun = state.pyodide.globals.get('__viz_run');
    if (typeof vizRun !== 'function') {
      console.error('__viz_run missing; pyodide.globals keys:', [...state.pyodide.globals.keys()]);
      throw new Error('__viz_run not defined after runner.py execution');
    }
    console.log('__viz_run callable in pyodide.globals ✓');
    
    els.status.textContent = 'Python ready ✓';
    els.status.classList.add('ready');
    syncVisualizeEnabled();

    /* Warm-import-after-ready DISABLED

    void (async () => {
      for (const modName of ["numpy", "pandas", "matplotlib", "sklearn"]) {
        try {
          await state.pyodide.runPythonAsync(`__import__('${modName}')`);
        } catch (e) {
          console.warn(`warm import '${modName}' failed:`, e && e.message);
        }
      }
    })();
    */
  } catch (err) {
    // Surface the REAL failure instead of the old one-size "check internet"
    // guess (user report 2026-11-06): CDN fetch, runner.py execution and the
    // __viz_run verification all landed here indistinguishably before.
    const msg = err && err.message ? err.message : String(err);
    els.status.textContent = `Failed to load Python runtime — ${msg.slice(0, 110)} (refresh to retry)`;
    console.error(err);
  }
}
