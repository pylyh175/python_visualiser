/* ═══════════════ Pane barrel: installs every registered visualiser ═══════════════ */

// Importing a pane module runs its registerPane(...) call. This is the only
// place that lists panes; output.js and the shared reset helpers stay closed
// for modification. Add a new visualiser = new module + one import here.
import './twoPointers.js';
import './reverse.js';
import './palindrome.js';
import './container.js';
import './recursion.js';
import './stack.js';
