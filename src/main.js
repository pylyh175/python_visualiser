/* ═══════════════ Bootstrap: wire the modules and start the app ═══════════════ */

// Modules with side-effect wiring (event listeners, default editor text):
// importing them is what installs their behavior.
import './editor/input.js';
import './navigation/steps.js';
import './panels/output.js';
import './runner.js';

// Explicit start-up calls.
import { init } from './pyodide.js';
import { render } from './panels/output.js';
import { initSplitter } from './splitters/horizontal.js';
import { initVarsSplitter } from './splitters/vertical.js';
import { buildDsaMenu } from './dsa.js';

render();
init();
initSplitter();
initVarsSplitter();
buildDsaMenu();
