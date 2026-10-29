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
};

let pyodide = null;
let steps = [];
let idx = 0;          // current step
let programError = null;   // { text, line } from a hard failure (e.g. syntax error)
let stoppedRun = false;
let programOutput = '';
let runInProgress = false;  // a Visualize run is currently executing
let locked = false;         // editor locked until ✎ Edit is clicked
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
  const atErrorStep = steps.length
    ? idx === steps.length - 1 && (!!programError || stoppedRun)
    : !!programError && !!programError.line;
  const currentLine = steps.length
    ? steps[idx].line
    : (programError && programError.line) || null;
  const hlClass = atErrorStep ? 'hl-error' : 'hl-current';
  const arrowClass = atErrorStep ? 'arrow-error' : 'arrow-prev';
  const nextLine = idx + 1 < steps.length ? steps[idx + 1].line : null;

  const parts = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    let cls = 'row';
    let arrow = '';
    if (n === currentLine) {
      cls += ' ' + hlClass;
      arrow = `<span class="arrow ${arrowClass}">▶</span>`;
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
els.textarea.addEventListener('input', () => {
  const t = els.textarea;
  // Code gone (or whitespace only): the previous run's trace refers to text
  // that no longer exists — clear it so stale steps, output, and error
  // highlighting don't linger over an empty editor.
  if (!t.value.trim()) resetRun();
  syncVisualizeEnabled();
  // Smart dedent: if the user just typed else/elif/except/finally at the start of
  // an indented line, pop the line back out one level (the keyword closes a block).
  // The correction is deferred (execCommand inside the 'input' event itself
  // corrupts the browser's in-flight edit) and re-verified when it runs.
  // Dedent each keyword at most once per line: characters typed right after the
  // keyword (':', ' ', …) re-match the pattern and must not pop another level.
  const pos = t.selectionStart;
  const before = t.value.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const typedPart = before.slice(lineStart);
  const alreadyHandled = recentDedent
    && recentDedent.lineStart === lineStart
    && typedPart.startsWith(recentDedent.expectPrefix);
  if (recentDedent && recentDedent.lineStart === lineStart && !alreadyHandled) {
    recentDedent = null;   // line was edited after the correction; allow again
  }
  if (!alreadyHandled) {
    const m = typedPart.match(/^( {1,})(else|elif|except|finally)(?![A-Za-z_])/);
    if (m && m[1].length >= INDENT.length) {
      setTimeout(() => {
        if (t.selectionStart !== t.selectionEnd) return;
        const nl = t.value.indexOf('\n', lineStart);
        const lineEnd = nl === -1 ? t.value.length : nl;
        const lineText = t.value.slice(lineStart, lineEnd);
        // Re-verify against the current value (things may have changed meanwhile).
        const gm = lineText.match(/^((?:    )+)(else|elif|except|finally)(?![A-Za-z_])/);
        if (gm) {
          const cutFrom = lineStart + gm[1].length - INDENT.length;
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
            t.value = all.slice(0, cutFrom) + all.slice(cutFrom + INDENT.length);
            t.selectionStart = t.selectionEnd = caretAfter;
            if (!hadFocus) t.focus();
          }
          // Mark this line+keyword as corrected so follow-up keystrokes don't
          // trigger a second pop on the same line.
          recentDedent = {
            lineStart,
            expectPrefix: ' '.repeat(gm[1].length - INDENT.length) + gm[2],
          };
        }
        renderEditor();
        syncScroll();
      }, 0);
    }
  }
  renderEditor();
  syncScroll();
});

// Tab inserts 4 spaces; Shift+Tab outdents; Enter auto-indents smartly.
const INDENT = '    ';   // one indentation level
const DEDENT_LINE = /^\s*(return\b|pass\b|break\b|continue\b|raise\b)/;  // line closes one
let recentDedent = null;  // remembers the last auto-dedent: { lineStart, expectPrefix }

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
    } else {
      t.value = t.value.slice(0, start) + INDENT + t.value.slice(end);
      t.selectionStart = t.selectionEnd = start + INDENT.length;
      renderEditor();
      syncScroll();
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
    if (!content && indent.length > 0) {
      // Blank auto-indented line + Enter = exit the block: the caret moves to
      // column 0 of this line, no empty line is left behind.
      t.setSelectionRange(lineStart, pos);
      if (document.execCommand && document.execCommand('delete')) {
        // caret now sits at lineStart (column 0); nothing left to insert
        requestAnimationFrame(syncScroll);
        return;
      }
      spliceInsert(t, lineStart, pos, '');
      requestAnimationFrame(syncScroll);
      return;
    }
    if (content.endsWith(':')) {
      // Line opens a block (for/while/if/elif/else/def/class/try/except/finally/with)
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
    requestAnimationFrame(syncScroll);
  }
});

els.textarea.value = DEFAULT_CODE;

/* ---------- controls ---------- */

function render() {
  renderEditor();
  const total = steps.length;
  els.stepLabel.textContent = total ? `Step ${idx + 1} / ${total}` : 'Step 0 / 0';
  els.first.disabled = els.prev.disabled = (idx <= 0);
  els.next.disabled = els.last.disabled = (idx >= total - 1);
  els.slider.max = String(Math.max(0, total - 1));
  els.slider.value = String(idx);
  els.slider.disabled = !total;
  renderOutput();
  renderVars();
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
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') {
    const entries = Object.entries(v).map(([k, val]) => `"${k}": ${typeof val === 'string' ? '"' : ''}${val}${typeof val === 'string' ? '"' : ''}`);
    return '{' + entries.join(', ') + '}';
  }
  return String(v);
}

function setIdx(n) {
  if (!steps.length) return;
  idx = Math.max(0, Math.min(n, steps.length - 1));
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

function resetRun() {
  steps = [];
  programError = null;
  stoppedRun = false;
  idx = 0;
  programOutput = '';
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
    pyodide = await loadPyodide();
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
      programError = { text: result.error, line: result.errorLine };
      if (!result.errorLine || !steps.length) {
        // A syntax error before anything ran: no stepping is possible.
        steps = [];
      }
    }
    if (!steps.length) {
      render();
      scrollToLine(programError && programError.line);
      return;
    }
    // An error or a limit stop lands straight on the last executed line —
    // the buggy line for runtime errors — instead of the first step.
    if (programError || stoppedRun) {
      idx = steps.length - 1;
      render();
      scrollToLine(steps[idx].line);
      return;
    }
    idx = 0;
    render();
  } catch (err) {
    programError = { text: 'Internal error: ' + (err && err.message || err), line: null };
    steps = [];
    render();
  } finally {
    runInProgress = false;
    syncVisualizeEnabled();
    applyLock();
    els.status.textContent = 'Python ready ✓';
    els.status.classList.add('ready');
  }
});

els.edit.addEventListener('click', () => {
  locked = false;
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
