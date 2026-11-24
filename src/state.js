/* ═══════════════ Shared mutable application state ═══════════════ */

// One mutable object for all cross-module state. ES module exports are
// read-only bindings for importers, so bare `let` exports cannot work —
// every module reads/writes `state.x` instead. Nothing here is assigned at
// module scope beyond the initial values.
export const state = {
  // Pyodide runtime
  pyodide: null,          // the loaded Pyodide instance
  runnerSource: null,     // runner.py text, fetched once at startup
  pyodideReady: false,    // true ONLY after runner.py executed and __viz_run
                          // was verified callable (pyodide.js). Visualize is
                          // gated on this (lock.js + runner.js guard): users
                          // type during the multi-second boot, and a click
                          // before __viz_run exists raised "Internal error:
                          // NameError: __viz_run is not defined"
                          // (2026-11-11 user report).

  // Current trace
  steps: [],              // recorded execution steps
  idx: 0,                 // current step
  programError: null,     // { text, line } from a hard failure (e.g. syntax error)
  stoppedRun: false,      // run stopped by the step/time limit
  programOutput: '',      // full program stdout

  // Run flow / editor lock
  runInProgress: false,   // a Visualize run is currently executing
  locked: false,          // editor locked during playback until handback/edit

  // Auto-play (navigation/play.js)
  playing: false,         // a playback pass is advancing steps on a timer

  // Output-panel tab family (recursion tree / stack / two-pointers visualisers).
  // Per-run pane state lives in ONE object owned by panels/paneController.js,
  // so resets and one-time latches never belong to individual panes.
  dsaMode: 'none',        // current DSA id: 'none' | 'recursion' | ... | 'two-pointers.two-sum'
  panes: {
    mode: null,           // DSA mode the panel rendered last (full id; sub-mode switches reset the tab choice)
    tab: 'out',           // active tab: 'out' | 'tree' | 'stack' | 'two-pointers' | 'reverse' | 'palindrome' | 'container'
    userSelected: false,  // the user picked a tab — keep it for this run
    announced: {},        // pane id -> its one-time auto-switch/engage already happened
    lastValidFrame: -1,   // the step whose algorithm frame rendered last — frozen later when a step doesn't touch it (2026-11-06 persistent-animation design)
  },
  stackScan: null,        // scanStackSource() result for the running code

  // Editor mirror / caret / glide internals
  mirrorSpacer: null,     // hidden element keeping the mirror as scrollable as the textarea
  stepGlide: null,        // the in-flight glide's requestAnimationFrame handle
  caretCellW: null,       // measured monospace cell width (lazily)
  caretFollowQueued: false,
};
