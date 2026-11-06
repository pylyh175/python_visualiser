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
    await state.pyodide.runPythonAsync(state.runnerSource);
    
    // Verify __viz_run was defined in globals
    const hasVizRun = await state.pyodide.runPythonAsync('__viz_run in globals()');
    console.log('__viz_run defined in globals:', hasVizRun);
    if (!hasVizRun) {
      // Try to see what's in globals
      const keys = await state.pyodide.runPythonAsync('list(globals().keys())');
      console.log('Globals keys:', keys);
      throw new Error('__viz_run not defined after runner.py execution');
    }
    // Also verify it's callable
    const isCallable = await state.pyodide.runPythonAsync('callable(globals()["__viz_run"])');
    console.log('__viz_run is callable:', isCallable);
    
    els.status.textContent = 'Python ready ✓';
    els.status.classList.add('ready');
    syncVisualizeEnabled();
  } catch (err) {
    // Surface the REAL failure instead of the old one-size "check internet"
    // guess (user report 2026-11-06): CDN fetch, runner.py execution and the
    // __viz_run verification all landed here indistinguishably before.
    const msg = err && err.message ? err.message : String(err);
    els.status.textContent = `Failed to load Python runtime — ${msg.slice(0, 110)} (refresh to retry)`;
    console.error(err);
  }
}
