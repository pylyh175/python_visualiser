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
  runEpoch: 0,            // bumped on a DSA mode change; an in-flight run whose
                          // epoch no longer matches discards its result

  // Auto-play (navigation/play.js)
  playing: false,         // a playback pass is advancing steps on a timer
  playSpeed: 'normal',    // current speed key (PLAY_SPEEDS) — panes scale their animations to it

  // Output-panel tab family (recursion tree / stack / two-pointers visualisers)
  dsaMode: 'none',        // current DSA id: 'none' | 'recursion' | ... | 'two-pointers.two-sum'
  outTab: 'out',          // active tab: 'out' | 'tree' | 'stack' | 'two-pointers' | 'reverse' | 'palindrome' | 'container'
  userTab: false,         // the user picked a tab — keep it for this run
  treeAnnounced: false,   // the one-time auto-switch to the tree happened
  stackAnnounced: false,  // the one-time auto-switch to the stack panel
  queueAnnounced: false,  // the one-time auto-switch to the queue panel
  cqueueAnnounced: false, // the one-time auto-switch to the circular queue panel
  llistAnnounced: false,  // the one-time auto-switch to the linked list panel
  htableAnnounced: false, // the one-time auto-switch to the hash table panel
  twoPointersAnnounced: false, // the one-time auto-advance of the generic two-pointers pane
  reverseAnnounced: false,// the one-time auto-switch to the reverse panel
  palindromeAnnounced: false, // the one-time auto-switch to the palindrome panel
  containerAnnounced: false,  // the one-time auto-switch/advance to the container pane
  lastValidFrame: -1,     // the step whose algorithm frame rendered last — frozen later when a step doesn't touch it (2026-11-06 persistent-animation design)
  stackScan: null,        // scanStackSource() result for the running code
  defs: null,             // runner's run-level definition metadata (class cards)
  pointerHints: null,     // scanPointerHints() result: { seq: [idxName…] } for the running code
  pointerPin: null,       // user-pinned two-pointer names { arr, left, right } (null = auto-detect)
  treeView: 'graph',      // recursion pane view: 'graph' (SVG tree) | 'text' (ASCII tree)
  viewport: null,         // classifyViewport() result: { device, layout, orientation, short, touch }
  outFam: null,           // which DSA mode the panel rendered last (full id; sub-mode switches also reset the tab choice)

  // Editor mirror / caret / glide internals
  mirrorSpacer: null,     // hidden element keeping the mirror as scrollable as the textarea
  stepGlide: null,        // the in-flight glide's requestAnimationFrame handle
  caretCellW: null,       // measured monospace cell width (lazily)
  caretFollowQueued: false,
};
