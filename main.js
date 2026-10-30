/* ═══════════════════════ Application logic ═══════════════════════ */

const DEFAULT_CODE = [
  'total = 0',
  'numbers = [3, 1, 4, 1, 5]',
  '',
  'for n in numbers:',
  '    if n % 2 == 0:',
  '        print(n, "is even")',
  '    else:',
  '        print(n, "is odd")',
  '    total = total + n',
  '',
  'print("total:", total)',
].join("\n");

const els = {
  status: document.getElementById('status'),
  mirror: document.getElementById('mirror'),
  textarea: document.getElementById('codeInput'),
  visualize: document.getElementById('btnVisualize'),
  edit: document.getElementById('btnEdit'),
  hint: document.querySelector('.hint'),
  main: document.querySelector('main'),
  divider: document.getElementById('divider'),
  right: document.getElementById('right'),
  first: document.getElementById('btnFirst'),
  prev: document.getElementById('btnPrev'),
  next: document.getElementById('btnNext'),
  last: document.getElementById('btnLast'),
  slider: document.getElementById('stepSlider'),
  stepLabel: document.getElementById('stepLabel'),
  output: document.getElementById('outputBody'),
  vars: document.getElementById('varsBody'),
  outTitle: document.getElementById('outTitle'),
  outTabs: document.getElementById('outTabs'),
  tabOut: document.getElementById('tabOut'),
  tabTree: document.getElementById('tabTree'),
  treeBody: document.getElementById('treeBody'),
};

let pyodide = null;
let steps = [];
let idx = 0;          // current step
let programError = null;   // { text, line } from a hard failure (e.g. syntax error)
let stoppedRun = false;
let programOutput = '';
let runInProgress = false;  // a Visualize run is currently executing
let locked = false;         // editor locked until ✎ Edit is clicked
let awaitingEdit = false;   // terminal run state: trace kept, editor unlocked, waiting for the first real edit to clear it
const HINT_DEFAULT = 'Type or paste Python code, then click Visualize.';

// Visualize is only meaningful with code on the editor, and never while a
// run is still in flight (the user can keep typing during execution).
function syncVisualizeEnabled() {
  els.visualize.disabled = runInProgress || !els.textarea.value.trim();
}

// Apply the editor lock: readOnly blocks direct typing (all programmatic
// edit paths check `locked` too, see the keydown guard), the faint tint and
// hint text make the state visible, and Edit is enabled only while locked
// and no run is in flight — unlocking mid-run would let code change under a
// live execution.
function applyLock() {
  els.textarea.readOnly = locked;
  els.edit.disabled = !locked || runInProgress;
  els.hint.textContent = locked ? 'Code locked — click ✎ Edit to modify' : HINT_DEFAULT;
}

/* ---------- editor rendering (mirror behind the textarea) ---------- */

let mirrorSpacer = null;   // hidden element keeping the mirror as scrollable as the textarea

// Size the spacer so the mirror's scroll range matches the textarea's exactly.
// The textarea reserves space for its own scrollbars, which the mirror
// (overflow: hidden) does not: its client box is smaller, so even with
// identical content the textarea can scroll further (scroll range =
// scrollHeight − clientHeight). Add that difference to the spacer; without it,
// offsets near the end of the range are silently clamped on the mirror side
// and the two texts drift apart, showing doubled, misaligned text. This must
// run after every mirror rebuild (renderEditor), not only on scroll: an
// innerHTML rebuild can otherwise clamp/reset the mirror's position.
function syncSpacerSize() {
  if (!mirrorSpacer) return;
  const t = els.textarea;
  const m = els.mirror;
  const w = t.scrollWidth + Math.max(0, m.clientWidth - t.clientWidth);
  const h = t.scrollHeight + Math.max(0, m.clientHeight - t.clientHeight);
  const ws = w + 'px';
  const hs = h + 'px';
  if (mirrorSpacer.style.width !== ws) mirrorSpacer.style.width = ws;
  if (mirrorSpacer.style.height !== hs) mirrorSpacer.style.height = hs;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderEditor() {
  const text = els.textarea.value;
  const lines = text.split('\n');
  // Error state: on a syntax error there are no steps at all and the line
  // comes from programError; on a runtime error / limit stop it is the last
  // step, but only while that step is the one being viewed (stepping back
  // returns to the normal green/orange playback colours).
  // Steps are recorded on the tracer's line events, i.e. immediately
  // *before* the event's line runs. At step idx the line about to execute
  // is steps[idx].line (orange "next" arrow) and the line that just
  // executed is the previous step's, steps[idx-1].line (green arrow). The
  // first step has nothing executed yet, so only the next-line arrow
  // shows there. The runner's synthetic final step repeats the last real
  // line, so at the end the green arrow lands on that line and nothing is
  // left pending. Return steps (the runner records one at every call
  // return) complete a call on their own line — nothing is about to run
  // afterwards, so they show the green arrow on the return line only.
  // Error/limit final step: red buggy-line marker instead.
  const atErrorStep = steps.length
    ? idx === steps.length - 1 && (!!programError || stoppedRun)
    : !!programError && !!programError.line;
  let greenLine = null;
  let nextLine = null;
  let redLine = null;
  if (steps.length) {
    if (!atErrorStep) {
      if (steps[idx].retStep) {
        // A return step completes a call on its own line; the caller then
        // resumes silently on the same line, so only the green
        // just-finished arrow shows, on the return line itself.
        greenLine = steps[idx].line;
        nextLine = null;
      } else {
        greenLine = idx > 0 ? steps[idx - 1].line : null;
        nextLine = steps[idx].line;
      }
    } else {
      redLine = steps[idx].line;
    }
  } else if (programError && programError.line) {
    redLine = programError.line;
  }

  const parts = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    let cls = 'row';
    let arrow = '';
    if (n === redLine) {
      cls += ' hl-error';
      arrow = '<span class="arrow arrow-error">▶</span>';
    } else if (n === greenLine) {
      cls += ' hl-current';
      arrow = '<span class="arrow arrow-prev">▶</span>';
    } else if (n === nextLine) {
      cls += ' hl-next';
      arrow = '<span class="arrow arrow-next">▶</span>';
    } else {
      arrow = '<span class="arrow"></span>';
    }
    parts.push(`<div class="${cls}"><span class="ln">${n}</span>${arrow}${escapeHtml(lines[i])}</div>`);
  }
  // Hidden spacer keeps the scroll ranges identical (see syncSpacerSize);
  // sized right after the rebuild via syncScroll below.
  parts.push('<div class="spacer"></div>');
  els.mirror.innerHTML = parts.join('');
  mirrorSpacer = els.mirror.lastElementChild;
  // Rebuilding innerHTML resets the mirror's scroll area; restore the exact
  // scroll offsets so the text stays glued to the line numbers. This is what
  // keeps Visualize / First / Prev / Next / Last from re-breaking alignment
  // when the code is scrolled (e.g. to the bottom) before them.
  syncScroll();
}

function refresh() {
  renderEditor();
  syncScroll();
}

function syncScroll() {
  // The mirror is its own scroll container, so the sticky line numbers
  // and arrows keep working while text scrolls underneath.
  const t = els.textarea;
  const m = els.mirror;
  // The textarea reserves space for its own scrollbars, which the mirror
  // (overflow: hidden) does not. syncSpacerSize keeps the mirror's scroll
  // range identical to the textarea's, so the copies below can never clamp
  // and the two texts stay aligned. Re-run on every scroll because scrollbar
  // visibility can change with size or content.
  syncSpacerSize();
  if (m.scrollTop !== t.scrollTop) m.scrollTop = t.scrollTop;
  if (m.scrollLeft !== t.scrollLeft) m.scrollLeft = t.scrollLeft;
}

els.textarea.addEventListener('scroll', syncScroll);
// Caret-follow triggers on caret movement only: clicks and keyboard
// navigation here, edits via the 'input' listener below. Scroll alone is
// deliberately never wired — manual scrolling must not be fought.
els.textarea.addEventListener('click', scheduleCaretFollow);
els.textarea.addEventListener('keyup', scheduleCaretFollow);
els.textarea.addEventListener('input', () => {
  const t = els.textarea;
  // First real modification while unlocked (after a failed run): back to the
  // initial state — error display and highlights go. Locked editors never
  // reach this, so a successful run's trace is safe to inspect.
  if (!locked && (programError || stoppedRun || steps.length)) resetRun();
  // Code gone (or whitespace only): the previous run's trace refers to text
  // that no longer exists — clear it so stale steps, output, and error
  // highlighting don't linger over an empty editor.
  if (!t.value.trim()) resetRun();
  syncVisualizeEnabled();
  scheduleCaretFollow();
  // Smart dedent: typing else/elif/except/finally at the start of an
  // indented line usually means the keyword closes a block. A blind
  // one-level outdent misaligns it (e.g. an else under a nested if was
  // popped out to the outer block instead of pairing with its own if), so
  // instead find the block header the keyword pairs with — the nearest
  // open block above — and only outdent when the typed indent is deeper
  // than that header. Lines already at the header's indent are left alone:
  // the check is idempotent, so follow-up keystrokes (' ', ':' …)
  // re-running it change nothing and no per-line memory is needed.
  const pos = t.selectionStart;
  const before = t.value.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const typedPart = before.slice(lineStart);
  if (/^ +(else|elif|except|finally)(?![A-Za-z_])/.test(typedPart)) {
    setTimeout(() => {
      if (t.selectionStart !== t.selectionEnd) return;
      const nl = t.value.indexOf('\n', lineStart);
      const lineEnd = nl === -1 ? t.value.length : nl;
      // Re-verify against the current value (things may have changed meanwhile).
      const lineText = t.value.slice(lineStart, lineEnd);
      const gm = lineText.match(/^( +)(else|elif|except|finally)(?![A-Za-z_])/);
      if (!gm) return;
      // The user must still be on this line — Enter since then moved the
      // caret elsewhere and the correction no longer applies.
      if (t.selectionStart < lineStart || t.selectionStart > lineEnd) return;
      const target = closerTargetIndent(t.value, lineStart);
      if (target === null || target >= gm[1].length) return;   // aligned / nothing open
      const cutFrom = lineStart + target;
      const cut = gm[1].length - target;
      const caretAfter = cutFrom + gm[2].length + (lineText.length - gm[0].length);
      try {
        t.setSelectionRange(cutFrom, lineStart + gm[1].length);
        if (!document.execCommand('delete')) {
          throw new Error('delete rejected');
        }
        // execCommand leaves the caret at the removal point; restore it to
        // the user's typing position (after keyword + whatever followed).
        t.setSelectionRange(caretAfter, caretAfter);
      } catch (err) {
        const hadFocus = document.activeElement === t;
        const all = t.value;
        t.value = all.slice(0, cutFrom) + all.slice(cutFrom + cut);
        t.selectionStart = t.selectionEnd = caretAfter;
        if (!hadFocus) t.focus();
      }
      renderEditor();
      syncScroll();
      scheduleCaretFollow();   // smart dedent also moved the caret
    }, 0);
  }
  renderEditor();
  syncScroll();
});

// Tab inserts 4 spaces; Shift+Tab outdents; Enter auto-indents smartly.
const INDENT = '    ';   // one indentation level
const DEDENT_LINE = /^\s*(return\b|pass\b|break\b|continue\b|raise\b)/;  // line closes one

/* ---------- lightweight Python lexical scanner ---------- */
// The block heuristics must never react to colons, keywords, or brackets
// inside strings (incl. triple-quoted), comments, or bracketed
// continuations — that whole bug class misindents nested if/else after a
// dict literal, a multi-line header, or a docstring. pyScanLine walks one
// line, carrying bracket depth / string state across lines, and reports
// facts about the statement at its outer level only. It is a heuristic
// scanner, not a full tokenizer; it covers what this editor realistically
// holds.
const COMPOUND_KW = /^(?:\s*)(?:async\s+)?(?:if|elif|else|for|while|try|except|finally|with|def|class|match|case)\b/;

function pyScanLine(line, st) {
  // st = { depth, triple } — persistent, mutated in place.
  // Returns { kw, endsColon, backslash, openStr }: statement facts; openStr
  // means a single-line quote was left open (mid-typing state).
  const kw = st.depth === 0 && !st.triple && COMPOUND_KW.test(line);
  let endsColon = false;
  let backslash = false;
  const hold = { q: null };   // single-line string state; never persists
  let i = 0;
  let codeEnd = line.length;
  while (i < line.length) {
    if (st.triple) {
      if (line.startsWith(st.triple, i)) { st.triple = null; i += 3; }
      else i += line[i] === '\\' ? 2 : 1;   // escapes inside triple-quotes
      continue;
    }
    const c = line[i];
    if (hold.q) {
      if (c === '\\') i += 2;
      else { if (c === hold.q) hold.q = null; i += 1; }
      continue;
    }
    if (c === '#') { codeEnd = i; break; }   // comment: inert tail
    if (c === '"' || c === "'") {
      if (line.startsWith(c + c + c, i)) { st.triple = c.repeat(3); i += 3; }
      else { hold.q = c; i += 1; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') st.depth += 1;
    else if (c === ')' || c === ']' || c === '}') st.depth = Math.max(0, st.depth - 1);
    i += 1;
  }
  if (!st.triple && !hold.q) {   // tail is real code, not part of a string
    const code = line.slice(0, codeEnd).trimEnd();
    const last = code.length ? code[code.length - 1] : '';
    endsColon = last === ':' && st.depth === 0;
    backslash = last === '\\';
  }
  return { kw, endsColon, backslash, openStr: hold.q !== null };
}

// Scanner state standing before the line starting at `lineStart` (built
// from every earlier line) plus whether that statement was still open —
// i.e. the line at lineStart is a continuation.
function pyScanTo(text, lineStart) {
  const st = { depth: 0, triple: null, pendingHeader: -1 };
  let open = false;
  let s = 0;
  while (s < lineStart) {
    let nl = text.indexOf('\n', s);
    if (nl === -1 || nl > lineStart) nl = lineStart;
    const line = text.slice(s, nl);
    s = nl + 1;
    const info = pyScanLine(line, st);
    if (open || st.pendingHeader >= 0) {
      // Scan is header-tracking only here: a completed multi-line header
      // keeps its indent in st.pendingHeader for the caller.
      if (st.depth === 0 && !st.triple && !info.backslash) {
        if (!info.endsColon) st.pendingHeader = -1;
      }
    } else if (info.kw && !info.endsColon) {
      st.pendingHeader = (line.match(/^ */))[0].length;
    } else {
      st.pendingHeader = -1;
    }
    open = st.depth > 0 || st.triple !== null || info.backslash;
  }
  return { st, open };
}

// Finds the header line an else/elif/except/finally just typed on the line
// starting at `lineStart` should align with: scans the completed lines
// above it, keeping a stack of open blocks. Continuation lines (inside
// brackets, triple-strings, or after a trailing backslash) neither pop nor
// push — but they can COMPLETE a pending multi-line header, when its final
// colon lands at depth 0 (e.g. "b):" closing "if (a and"). Returns the
// deepest open header's indent, or null when no block is open.
function closerTargetIndent(text, lineStart) {
  const stack = [];
  const st = { depth: 0, triple: null };
  let open = false;
  let pendingHeader = -1;
  let s = 0;
  while (s < lineStart) {
    let nl = text.indexOf('\n', s);
    if (nl === -1 || nl > lineStart) nl = lineStart;
    const line = text.slice(s, nl);
    s = nl + 1;
    const cont = open || pendingHeader >= 0;
    const info = pyScanLine(line, st);
    open = st.depth > 0 || st.triple !== null || info.backslash;
    if (!line.trim() || /^\s*#/.test(line)) continue;   // blank or comment
    if (cont) {
      if (st.depth === 0 && !st.triple && !info.backslash) {
        if (info.endsColon && pendingHeader >= 0) stack.push(pendingHeader);
        pendingHeader = -1;
      }
      continue;
    }
    const indent = (line.match(/^ */) || [''])[0].length;
    // A statement at this indent sits outside every block whose header is
    // at the same or deeper indent — those pop off the stack.
    while (stack.length && stack[stack.length - 1] >= indent) stack.pop();
    if (info.kw && info.endsColon) stack.push(indent);
    else if (info.kw && open) pendingHeader = indent;
    else pendingHeader = -1;
  }
  return stack.length ? stack[stack.length - 1] : null;
}

// Fallback for browsers without execCommand('insertText') support.
function spliceInsert(t, start, end, text) {
  t.value = t.value.slice(0, start) + text + t.value.slice(end);
  t.selectionStart = t.selectionEnd = start + text.length;
  renderEditor();
  syncScroll();
}

els.textarea.addEventListener('keydown', (e) => {
  const t = els.textarea;
  if (locked) return;   // readOnly blocks typing; these handlers must not splice values either

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = t.selectionStart;
    const end = t.selectionEnd;
    if (e.shiftKey) {
      // Outdent: remove up to one level of indentation from each selected line.
      const lineStart = t.value.lastIndexOf('\n', start - 1) + 1;
      const blockEnd = t.value.indexOf('\n', end) === -1
        ? t.value.length
        : t.value.indexOf('\n', end);
      const lines = t.value.slice(lineStart, blockEnd).split('\n');
      let offset = 0;
      const outdented = lines.map((line) => {
        const removed = line.match(/^( {1,4}|\t)/);
        const cut = removed ? removed[0].length : 0;
        offset -= cut;
        return line.slice(cut);
      }).join('\n');
      spliceInsert(t, lineStart, blockEnd, outdented);
      t.selectionStart = start + offset;
      t.selectionEnd = end + offset;
      renderEditor();
      syncScroll();
      scheduleCaretFollow();
    } else {
      t.value = t.value.slice(0, start) + INDENT + t.value.slice(end);
      t.selectionStart = t.selectionEnd = start + INDENT.length;
      renderEditor();
      syncScroll();
      scheduleCaretFollow();
    }
    return;
  }

  // Smart Backspace: with the caret right after the leading whitespace of a
  // line, delete one indentation level instead of a single space (common in
  // Python editors) so beginners can outdent easily.
  if (e.key === 'Backspace') {
    const t = els.textarea;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    if (start !== end || start === 0) return;      // selection or at doc start: default
    const ls = t.value.lastIndexOf('\n', start - 1) + 1;
    const linePrefix = t.value.slice(ls, start);
    const charAfter = t.value[start];              // undefined at end of text
    const isAtContentStart = charAfter === undefined || charAfter === '\n' || !/\s/.test(charAfter);
    if (!/^[ \t]+$/.test(linePrefix) || !isAtContentStart) return;   // not the smart case
    e.preventDefault();
    // Back to the previous indent stop: remove 4 spaces if they are there,
    // otherwise fall back to a single character (tab or stray space).
    const cut = linePrefix.slice(-INDENT.length) === INDENT
      ? INDENT.length
      : 1;
    try {
      t.setSelectionRange(start - cut, start);
      if (!document.execCommand('delete')) throw new Error('rejected');
    } catch (err) {
      const hadFocus = document.activeElement === t;
      const all = t.value;
      t.value = all.slice(0, start - cut) + all.slice(start);
      t.selectionStart = t.selectionEnd = start - cut;
      if (!hadFocus) t.focus();
      renderEditor();
      syncScroll();
      scheduleCaretFollow();
    }
    // execCommand('delete') above fires 'input' which re-renders.
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const pos = t.selectionStart;
    const before = t.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const curLine = before.slice(lineStart);
    const indent = curLine.match(/^[ \t]*/)[0];
    const content = curLine.trim().replace(/#.*$/, '').trimEnd();

    let nextIndent = indent;
    let replaceFrom = pos;               // where the inserted text replaces from
    // Lexical state before/inside the caret line: inside brackets, a string
    // (incl. triple), or a trailing-\ continuation changes every decision —
    // an Enter there is just a line split: no block is opened nor exited.
    const scan = pyScanTo(t.value, lineStart);
    const st = scan.st;
    const info = pyScanLine(curLine, st);
    const openStatement = scan.open || st.depth > 0 || st.triple !== null
      || info.backslash || info.openStr;
    // Does the caret line complete a pending multi-line header? (its colon
    // just landed at depth 0; st.pendingHeader still holds that header's
    // indent) — e.g. Enter right after the "        b):" that closes a
    // multi-line "if (a and" header opens the block body at that indent.
    const completesHeader = st.pendingHeader >= 0 && info.endsColon
      && st.depth === 0 && !st.triple && !info.backslash && !info.openStr
      && !info.kw;
    if (!content && indent.length > 0 && !openStatement) {
      // Blank auto-indented line + Enter = exit the block: the caret moves
      // to column 0 of this line, no empty line is left behind. (Blank lines
      // inside brackets or a docstring are not block exits — plain splits.)
      t.setSelectionRange(lineStart, pos);
      if (document.execCommand && document.execCommand('delete')) {
        // caret now sits at lineStart (column 0); nothing left to insert
        scheduleCaretFollow();
        return;
      }
      spliceInsert(t, lineStart, pos, '');
      scheduleCaretFollow();
      return;
    }
    if (completesHeader) {
      nextIndent = ' '.repeat(st.pendingHeader) + INDENT;
    } else if (openStatement) {
      // Line split inside a bracket/string/continuation: keep the level.
    } else if (info.kw && info.endsColon) {
      // A compound header (if/for/while/def/try/with … ending in ":" outside
      // all brackets and strings) opens a block.
      nextIndent = indent + INDENT;
    } else if (DEDENT_LINE.test(content)) {
      // return/pass/break/continue/raise: back out one level.
      nextIndent = indent.slice(0, Math.max(0, indent.length - INDENT.length));
    }

    const insertion = '\n' + nextIndent;
    try {
      t.setSelectionRange(replaceFrom, t.selectionEnd);
      if (!document.execCommand('insertText', false, insertion)) {
        throw new Error('insertText rejected');
      }
    } catch (err) {
      spliceInsert(t, replaceFrom, t.selectionEnd, insertion);
    }
    // The 'input' event fired by execCommand re-renders the mirror; make sure the
    // view is scrolled if this code fell outside the visible area.
    scheduleCaretFollow();
  }
});

els.textarea.value = DEFAULT_CODE;

/* ---------- controls ---------- */

function render() {
  renderEditor();
  const total = steps.length;
  els.stepLabel.textContent = total ? `Step ${idx + 1} / ${total}` : 'Step 0 / 0';
  // Playback is live only while a run is actually playing: with no steps (fresh
  // state) or in the terminal awaiting-edit state, the controls are disabled.
  const playbackOn = steps.length > 0 && !awaitingEdit;
  els.first.disabled = els.prev.disabled = (idx <= 0 || !playbackOn);
  els.next.disabled = els.last.disabled = (idx >= total - 1 || !playbackOn);
  els.slider.max = String(Math.max(0, total - 1));
  els.slider.value = String(idx);
  els.slider.disabled = !playbackOn;
  renderOutput();
  renderVars();
  renderTree();
  ensureStepVisible();
}

function errorDisplayText() {
  // "Line N: …" prefix so the message matches the highlighted editor line.
  const where = programError && programError.line ? `Line ${programError.line}: ` : '';
  return where + (programError ? programError.text : '');
}

function renderOutput() {
  if (!steps.length) {
    els.output.innerHTML = programError
      ? `<span class="err">${escapeHtml(errorDisplayText())}</span>`
      : '<span style="color:#9ca3af">(no output yet)</span>';
    return;
  }
  const step = steps[idx];
  let text = step.outLen != null ? programOutput.slice(0, step.outLen) : programOutput;
  if (text) text += '\n';
  if (idx === steps.length - 1 && programError) {
    text += `<span class="err">${escapeHtml(errorDisplayText())}</span>`;
  }
  if (idx === steps.length - 1 && stoppedRun) {
    text += '<span class="err">— execution stopped: step/time limit reached (too many steps)</span>';
  }
  els.output.innerHTML = text || '<span style="color:#9ca3af">(no output yet)</span>';
  els.output.scrollTop = els.output.scrollHeight;
}

function renderVars() {
  if (!steps.length) {
    els.vars.innerHTML = '<span class="empty">Run some code first.</span>';
    return;
  }
  const vars = steps[idx].locals || {};
  const names = Object.keys(vars);
  if (!names.length) {
    els.vars.innerHTML = '<span class="empty">(no variables)</span>';
    return;
  }
  const rows = names.map((k) =>
    `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(fmtValue(vars[k]))}</td></tr>`
  ).join('');
  els.vars.innerHTML = `<table>${rows}</table>`;
}

function fmtValue(v) {
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

function setIdx(n) {
  if (!steps.length) return;
  if (awaitingEdit) return;   // terminal state: playback frozen until an edit resets
  idx = Math.max(0, Math.min(n, steps.length - 1));
  // A successful run that reached its final step hands the editor back: unlock
  // and wait for the user's first real edit to clear the trace (design doc
  // 2026-10-30-final-step-edit-design.md, grilled Q1–Q5).
  if (idx === steps.length - 1 && steps[idx].finished && !programError && !stoppedRun) {
    if (locked) { locked = false; applyLock(); }
    awaitingEdit = true;
  }
  render();
}

// The mirror row element for a 1-based line number (rows are children in
// order; the hidden spacer is last).
function rowAt(line) {
  const row = els.mirror.children[line - 1];
  return row && row !== mirrorSpacer ? row : null;
}

// Scroll the editor so the given 1-based line is comfortably in view.
function scrollToLine(line) {
  if (!line || line < 1) return;
  const row = rowAt(line);
  if (!row) return;
  els.textarea.scrollTop = Math.max(0, row.offsetTop - els.textarea.clientHeight / 3);
  syncScroll();
}

// Keep the green (just-executed) and orange (next) lines visible together
// while stepping. Only when the two cannot both be seen in the viewport,
// scroll just enough to bring the NEXT line into view, so the user follows
// execution without manual scrolling. If both already fit, never scroll.
function ensureStepVisible() {
  if (!steps.length || idx >= steps.length) return;
  const cur = rowAt(steps[idx].line);
  if (!cur) return;
  const nxt = (idx + 1 < steps.length && rowAt(steps[idx + 1].line)) || cur;
  const t = els.textarea;
  const top = Math.min(cur.offsetTop, nxt.offsetTop);
  const bottom = Math.max(cur.offsetTop + cur.offsetHeight, nxt.offsetTop + nxt.offsetHeight);
  if (top >= t.scrollTop && bottom <= t.scrollTop + t.clientHeight) return;   // both visible
  // Not both visible: land the next line inside the viewport (a line's
  // height of margin so it is not glued to the edge), clamped to the
  // scroll range. Scrolling up stops just above the next line, so the
  // just-executed line in front of it stays visible too when it fits.
  const want = nxt.offsetTop + nxt.offsetHeight + 22 - t.clientHeight;
  const lo = Math.max(0, nxt.offsetTop - 22);
  t.scrollTop = Math.max(lo, Math.min(want, t.scrollHeight - t.clientHeight));
  syncScroll();
}

/* ---------- keep the caret inside the view while editing ---------- */

// Monospace advance of one character cell (measured once, lazily). Both
// editor layers share one font and tab-size, so text coordinates are exact
// for both vertical rows and horizontal columns.
let caretCellW = null;
function caretCellWidth() {
  if (caretCellW !== null) return caretCellW;
  try {
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(64);
    const cs = getComputedStyle(els.mirror);
    probe.style.cssText = 'position:absolute;visibility:hidden;top:-9999px;left:0;'
      + 'white-space:pre;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize;
    document.body.appendChild(probe);
    caretCellW = probe.getBoundingClientRect().width / 64;
    probe.remove();
  } catch (err) {
    caretCellW = 0;
  }
  if (!caretCellW) caretCellW = 8.4;   // sane monospace default at 14px
  return caretCellW;
}

// Caret's horizontal position in content coordinates. Each non-tab
// character advances one cell; a tab jumps to the next 4-cell stop
// (tab-size 4, as rendered).
function caretColumnX(linePrefix) {
  const cw = caretCellWidth();
  let x = 0;
  for (const ch of linePrefix) {
    if (ch === '\t') x = (Math.floor(x / (cw * 4)) + 1) * cw * 4;
    else x += cw;
  }
  return x;
}

// Follow the caret after it moves (typing, Enter, click, arrow keys):
// scroll the editor minimally when the caret left the visible area, with
// one line-height of margin so it does not sit glued to an edge. Only
// caret-movement events reach this — wheel/scrollbar scrolling alone is
// never fought — and locked playback keeps its own tracking
// (ensureStepVisible), so the two behaviors cannot fight each other.
function keepCaretVisible() {
  const t = els.textarea;
  if (locked || document.activeElement !== t) return;
  const pos = t.selectionStart;
  const start = t.value.lastIndexOf('\n', pos - 1) + 1;
  const line = t.value.slice(0, start).split('\n').length;
  const row = rowAt(line);
  if (!row) return;
  let changed = false;
  const top = row.offsetTop;
  const bot = top + (row.offsetHeight);
  if (top < t.scrollTop) {
    t.scrollTop = Math.max(0, top);
    changed = true;
  } else if (bot > t.scrollTop + t.clientHeight) {
    t.scrollTop = Math.min(t.scrollHeight - t.clientHeight, bot - t.clientHeight);
    changed = true;
  }
  // Horizontal: the same policy along the caret column (long lines and
  // tabs are already priced in by caretColumnX).
  const x = caretColumnX(t.value.slice(start, pos));
  const cw = caretCellWidth();
  if (x < t.scrollLeft) {
    t.scrollLeft = Math.max(0, x);
    changed = true;
  } else if (x + cw > t.scrollLeft + t.clientWidth) {
    t.scrollLeft = Math.min(t.scrollWidth - t.clientWidth, x + cw - t.clientWidth);
    changed = true;
  }
  if (changed) syncScroll();
}

// One rAF pass after caret movement: glue the mirror first (a renderEditor
// rebuild can reset its scroll, see syncSpacerSize), then follow the caret.
let caretFollowQueued = false;
function scheduleCaretFollow() {
  if (caretFollowQueued) return;
  caretFollowQueued = true;
  requestAnimationFrame(() => {
    caretFollowQueued = false;
    syncScroll();
    keepCaretVisible();
  });
}

els.first.addEventListener('click', () => setIdx(0));
els.prev.addEventListener('click', () => setIdx(idx - 1));
els.next.addEventListener('click', () => setIdx(idx + 1));
els.last.addEventListener('click', () => setIdx(steps.length - 1));

// Slider jump: the input event is the single path for slider-driven
// navigation; render() keeps the thumb in sync when idx moves by other means.
els.slider.addEventListener('input', () => setIdx(Number(els.slider.value)));

document.addEventListener('keydown', (e) => {
  // The slider handles ←/→ natively when focused (its input event steps);
  // skip it here so one keypress never steps twice.
  if (e.target === els.textarea || e.target === els.slider) return;
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { setIdx(idx - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { setIdx(idx + 1); e.preventDefault(); }
});

/* ---------- recursion tree (Recursion tab in the output panel) ---------- */

const TREE_NODE_CAP = 20000;   // nodes drawn; overflow becomes a summary row

let outTab = 'out';          // active output-panel tab: 'out' | 'tree'
let userTab = false;         // the user picked a tab — keep it for this run
let treeAnnounced = false;   // the one-time auto-switch to the tree happened

// Replay steps 0..idx into a tree: each step's `stack` (outermost user frame
// first) registers or confirms its frames, joined parent ← child following
// the chain order, and `ret` entries resolve nodes with return values.
// Repetition is safe: maps are built only from ids already recorded, so
// stepping back re-derives an earlier state exactly.
function treeData(upTo) {
  const nodes = new Map();   // insertion order = call order
  const childCount = new Map();
  for (let s = 0; s <= Math.min(upTo, steps.length - 1); s++) {
    const stack = steps[s].stack;
    if (stack) {
      for (let d = 0; d < stack.length; d++) {
        const e = stack[d];
        if (!nodes.has(e.id)) {
          const parent = d ? stack[d - 1].id : null;
          nodes.set(e.id, {
            id: e.id, parent, fn: e.fn, args: e.args || {},
            ret: null, retSet: false, order: childCount.get(parent) || 0,
          });
          childCount.set(parent, (childCount.get(parent) || 0) + 1);
        }
      }
    }
    const rets = steps[s].ret;
    if (rets) for (const r of rets) {
      const n = nodes.get(r.id);
      // The module frame's own return (value None) never resolves a node.
      if (n && !n.retSet && n.fn !== '<module>') { n.ret = r.value; n.retSet = true; }
    }
  }
  return nodes;
}

// Compact text form for a JSON value inside a node label.
function treeValue(v, cap) {
  let s = fmtValue(v);
  if (s.length > cap) s = s.slice(0, cap) + '…';
  return s;
}

function renderTree() {
  // Tabs exist only for runs where a user function was called while another
  // user function was still on the stack (i.e. actual recursion/nesting).
  const recursive = steps.length && steps.some((s) => s.stack && s.stack.length >= 2);
  if (!recursive) {
    els.outTabs.hidden = true;
    els.outTitle.hidden = false;
    els.output.hidden = false;
    els.treeBody.hidden = true;
    outTab = 'out'; userTab = false; treeAnnounced = false;
    return;
  }
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  // Once the run actually starts recursing, show the tree (first time only —
  // after that a manual tab choice is sticky until the run is reset).
  const cur = steps[idx].stack || [];
  if (!userTab && !treeAnnounced && cur.length >= 2) {
    treeAnnounced = true;
    outTab = 'tree';
  }
  els.tabOut.classList.toggle('active', outTab === 'out');
  els.tabTree.classList.toggle('active', outTab === 'tree');
  els.output.hidden = outTab !== 'out';
  els.treeBody.hidden = outTab !== 'tree';
  if (outTab !== 'tree') return;

  const nodes = treeData(idx);
  // Cap the drawing; nodes beyond the cap are always later in call order
  // than any parents already shown, so no orphaned look-arounds occur.
  const shown = new Map();
  let extra = 0;
  for (const n of nodes.values()) {
    if (shown.size < TREE_NODE_CAP) shown.set(n.id, n);
    else extra++;
  }
  const kids = new Map();
  for (const n of shown.values()) {
    if (n.parent !== null && !shown.has(n.parent)) continue;
    const list = kids.get(n.parent) || [];
    list.push(n);
    kids.set(n.parent, list);
  }
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order);

  const curStack = steps[idx].stack || [];
  // The active node is the innermost stack frame *without* a return value
  // at this step. On ordinary line steps that is just the stack top. On a
  // return step the top frame is the one that just resolved (it is still in
  // the chain snapshot), so the call beneath — the one about to consume
  // that value — is shown as active while the callee renders done below.
  // Returns that resolve nothing displayed (the module's own) never block
  // this: the walk falls through to the outermost frame.
  const stepRets = steps[idx].ret || [];
  let activeId = null;
  for (let d = curStack.length - 1; d >= 0; d--) {
    if (!stepRets.some((r) => r.id === curStack[d].id)) {
      activeId = curStack[d].id;
      break;
    }
  }
  const atErrorStep = idx === steps.length - 1 && (!!programError || stoppedRun);

  const lines = [];
  // Root = the one node with no parent (the module frame). Its id is not a
  // fixed number: the module frame gets a 'call' event like any other.
  let root = null;
  for (const n of shown.values()) if (n.parent === null) { root = n; break; }
  if (root) {
    const rootCls = root.id === activeId ? (atErrorStep ? 'tn-error' : 'tn-active') : '';
    lines.push(`<span class="${rootCls}">(program)</span>`);
    const walk = (parent, prefix) => {
      const list = kids.get(parent) || [];
      list.forEach((k, i) => {
        const last = i === list.length - 1;
        let cls, label;
        if (k.retSet) {
          // Resolved beats active: during a return step the callee that
          // just resolved is still the stack top, but the node must show
          // its green done state with the value it returned.
          cls = 'tn-done';
        } else if (k.id === activeId) {
          cls = atErrorStep ? 'tn-error' : 'tn-active';
        } else {
          cls = '';
        }
        const argStr = Object.keys(k.args).slice(0, 3)
          .map((a) => `${a}=${treeValue(k.args[a], 24)}`).join(', ');
        label = (k.fn === '<module>' ? '(program)' : k.fn) + '(' + argStr + ')';
        if (k.retSet) label += ' → ' + treeValue(k.ret, 40);
        lines.push(`<span class="${cls}">${escapeHtml(prefix + (last ? '└─ ' : '├─ '))}${escapeHtml(label)}</span>`);
        walk(k.id, prefix + (last ? '   ' : '│  '));
      });
    };
    walk(root.id, '');
  }
  if (extra > 0) {
    lines.push(`<span class="tn-more">+${extra} more calls not shown</span>`);
  }
  els.treeBody.innerHTML = lines.join('\n') || '<span class="tn-more">(no calls yet)</span>';
  els.treeBody.scrollTop = els.treeBody.scrollHeight;
}

els.tabOut.addEventListener('click', () => {
  outTab = 'out';
  if (steps.length) userTab = true;   // manual choice sticks until the run resets
  renderTree();
});
els.tabTree.addEventListener('click', () => {
  outTab = 'tree';
  if (steps.length) userTab = true;
  renderTree();
});

function resetRun() {
  steps = [];
  programError = null;
  stoppedRun = false;
  idx = 0;
  programOutput = '';
  awaitingEdit = false;
  outTab = 'out'; userTab = false; treeAnnounced = false;
  render();
}

/* ---------- Pyodide integration ---------- */

// The Python tracer lives in runner.py, fetched once at startup and executed
// in Pyodide to define __viz_run.
let runnerSource = null;

async function init() {
  try {
    const resp = await fetch('runner.py');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    runnerSource = await resp.text();
    if (!runnerSource.trim()) throw new Error('runner.py is empty');
  } catch (err) {
    // file:// pages cannot read sibling files (browser CORS); the site must
    // be opened through start.bat (a tiny local web server) or any server.
    els.status.textContent = 'runner.py could not be loaded — open via start.bat (local web server)';
    console.error(err);
    return;
  }
  try {
    // WASM heap headroom: Pyodide/Emscripten's small default heap can be tight
    // for deep recursion + big variable snapshots; give the runtime 4 MB.
    pyodide = await loadPyodide({
      totalMemory: 4 * 1024 * 1024,   // 4 MB heap for the WASM runtime
    });
    await pyodide.runPythonAsync(runnerSource);
    els.status.textContent = 'Python ready ✓';
    els.status.classList.add('ready');
    syncVisualizeEnabled();
  } catch (err) {
    els.status.textContent = 'Failed to load Python runtime (check internet connection)';
    console.error(err);
  }
}

els.visualize.addEventListener('click', async () => {
  const code = els.textarea.value;
  if (!code.trim()) {
    // Nothing to visualize (the button is disabled for this, but guard the
    // race where the editor was cleared mid-click): clear the stale panels.
    resetRun();
    return;
  }
  resetRun();
  runInProgress = true;
  locked = true;
  syncVisualizeEnabled();
  applyLock();
  els.status.textContent = 'Executing…';
  els.status.classList.remove('ready');
  let failed = false;
  try {
    pyodide.globals.set('__viz_code', code);
    const json = await pyodide.runPythonAsync('__viz_run(__viz_code)');
    const result = JSON.parse(json);

    // The editor was emptied while the run was in flight: discard the result.
    if (!els.textarea.value.trim()) { resetRun(); return; }

    programOutput = result.output || '';
    steps = result.steps || [];
    stoppedRun = !!result.stopped;

    if (result.error) {
      failed = true;
      programError = { text: result.error, line: result.errorLine };
      if (!result.errorLine || !steps.length) {
        // A syntax error before anything ran: no stepping is possible.
        steps = [];
      }
    }
    if (stoppedRun) failed = true;
    if (!steps.length) {
      render();
      scrollToLine(programError && programError.line);
      return;
    }
    // An error or a limit stop lands straight on the last executed line —
    // the buggy line for runtime errors — instead of the first step.
    if (programError || stoppedRun) {
      // Terminal state (runtime error / step-time limit stop): the editor is
      // already auto-unlocked via the failed flag; freeze playback controls
      // and wait for the first real edit to clear the trace (design doc).
      if (steps.length) awaitingEdit = true;
      idx = steps.length - 1;
      render();
      scrollToLine(steps[idx].line);
      return;
    }
    idx = 0;
    render();
  } catch (err) {
    failed = true;
    programError = { text: 'Internal error: ' + (err && err.message || err), line: null };
    steps = [];
    render();
  } finally {
    runInProgress = false;
    // A failed run (syntax/runtime/internal error or a limit stop) drops the
    // user straight into edit mode, but KEEPS the error display — the red
    // buggy-line highlight, the error in the output panel, and the trace
    // stay until the user actually starts editing (reset then, in the input
    // listener) or clicks Edit. Successful runs stay locked as before.
    if (failed) {
      locked = false;
    }
    syncVisualizeEnabled();
    applyLock();
    els.status.textContent = 'Python ready ✓';
    els.status.classList.add('ready');
  }
});

els.edit.addEventListener('click', () => {
  locked = false;
  // Back to the pre-run state: arrows, highlights, output, variables, step
  // counter, and slider all reset (the trace is regenerated by Visualize).
  resetRun();
  applyLock();
});

/* ---------- draggable splitter between editor and output ---------- */

const SPLIT_KEY = 'vizSplitWidth';   // localStorage key for the chosen width
const MIN_RIGHT = 260;               // narrowest the output column may get
const MIN_LEFT = 320;                // narrowest the editor column may get

// Clamp a requested output-column width to what the window can hold.
function applyRightWidth(px) {
  const rect = els.main.getBoundingClientRect();
  const chrome = 24 /* main padding */ + 12 /* gaps */ + 8 /* divider */ + MIN_LEFT;
  const max = Math.max(MIN_RIGHT, rect.width - chrome);
  const w = Math.min(max, Math.max(MIN_RIGHT, px));
  els.right.style.width = w + 'px';
  // Resizing can change the textarea's scroll compartments; re-sync the mirror.
  syncScroll();
  return w;
}

function initSplitter() {
  // Restore the width chosen in a previous session.
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  if (saved) applyRightWidth(saved);

  let dragging = false;

  els.divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    els.divider.setPointerCapture(e.pointerId);
    els.divider.classList.add('dragging');
    document.body.classList.add('resizing');
  });

  els.divider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // 12 = main's right padding; width spans from the pointer to the right edge.
    applyRightWidth(els.main.getBoundingClientRect().right - 12 - e.clientX);
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    els.divider.classList.remove('dragging');
    document.body.classList.remove('resizing');
    try { els.divider.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    localStorage.setItem(SPLIT_KEY, String(els.right.getBoundingClientRect().width));
  };
  els.divider.addEventListener('pointerup', endDrag);
  els.divider.addEventListener('pointercancel', endDrag);

  // Double-click returns to the default split.
  els.divider.addEventListener('dblclick', () => {
    els.right.style.width = '';
    localStorage.removeItem(SPLIT_KEY);
    syncScroll();
  });

  // Keep the clamps honest when the window itself is resized.
  window.addEventListener('resize', () => {
    applyRightWidth(els.right.getBoundingClientRect().width);
  });
}

render();
init();
initSplitter();
