/* ═══════════════ Shared pure helpers ═══════════════ */

// HTML-escape a string for safe innerHTML insertion.
export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Compact display form of a tracer JSON value (variables panel + labels).
export function fmtValue(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'string') return '"' + v + '"';
  if (Array.isArray(v)) {
    // List of lists: one row per line so it reads as a 2D array. (Rows are
    // already truncated by the tracer's caps; mixed lists stay flat JSON.)
    if (v.length > 0 && v.every(row => Array.isArray(row))) {
      return '[' + v.map(row => JSON.stringify(row)).join(',\n ') + ']';
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v).map(([k, val]) => `"${k}": ${typeof val === 'string' ? '"' : ''}${val}${typeof val === 'string' ? '"' : ''}`);
    return '{' + entries.join(', ') + '}';
  }
  return String(v);
}

// Compact text form for a JSON value inside a node label (recursion tree /
// stack cells): truncated to `cap` characters with an ellipsis.
export function treeValue(v, cap) {
  let s = fmtValue(v);
  if (s.length > cap) s = s.slice(0, cap) + '…';
  return s;
}
