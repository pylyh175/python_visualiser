/* ═══════════════ Shared mutable application state ═══════════════ */

// One mutable object for all cross-module state. ES module exports are
// read-only bindings for importers, so bare `let` exports cannot work —
// every module reads/writes `state.x` instead. Nothing here is assigned at
// module scope beyond the initial values.
export const state = {
  // Pyodide runtime
  pyodide: null,          // the loaded Pyodide instance
  runnerSource: null,     // runner.py text, fetched once at startup

  // Current trace
  steps: [],              // recorded execution steps
  idx: 0,                 // current step
  programError: null,     // { text, line } from a hard failure (e.g. syntax error)
  stoppedRun: false,      // run stopped by the step/time limit
  programOutput: '',      // full program stdout

  // Run flow / editor lock
  runInProgress: false,   // a Visualize run is currently executing
  locked: false,          // editor locked during playback until handback/edit

  // Output-panel tab family (recursion tree / stack / two-pointers visualisers)
  dsaMode: 'none',        // current DSA id: 'none' | 'recursion' | ... | 'two-pointers.two-sum'
  outTab: 'out',          // active tab: 'out' | 'tree' | 'stack' | 'two-pointers' | 'reverse' | 'palindrome' | 'container'
  userTab: false,         // the user picked a tab — keep it for this run
  treeAnnounced: false,   // the one-time auto-switch to the tree happened
  stackAnnounced: false,  // the one-time auto-switch to the stack panel
  twoPointersAnnounced: false, // the one-time auto-advance of the generic two-pointers pane
  reverseAnnounced: false,// the one-time auto-switch to the reverse panel
  palindromeAnnounced: false, // the one-time auto-switch to the palindrome panel
  containerAnnounced: false,  // the one-time auto-switch/advance to the container pane
  stackScan: null,        // scanStackSource() result for the running code
  outFam: null,           // which DSA mode the panel rendered last (full id; sub-mode switches also reset the tab choice)

  // Editor mirror / caret / glide internals
  mirrorSpacer: null,     // hidden element keeping the mirror as scrollable as the textarea
  stepGlide: null,        // the in-flight glide's requestAnimationFrame handle
  caretCellW: null,       // measured monospace cell width (lazily)
  caretFollowQueued: false,
};
