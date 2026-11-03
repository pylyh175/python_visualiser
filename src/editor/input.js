/* ═══════════════ Editor input: Python-aware Tab / Backspace / Enter ═══════════════ */

import { state } from '../state.js';
import { els } from '../dom.js';
import { DEFAULT_CODE, INDENT, DEDENT_LINE, COMPOUND_KW } from '../config.js';
import { renderEditor, syncScroll, scheduleCaretFollow } from './render.js';
import { syncVisualizeEnabled, applyLock } from '../lock.js';
import { resetRun } from '../runner.js';

/* ---------- lightweight Python lexical scanner ---------- */
// The block heuristics must never react to colons, keywords, or brackets
// inside strings (incl. triple-quoted), comments, or bracketed
// continuations — that whole bug class misindents nested if/else after a
// dict literal, a multi-line header, or a docstring. pyScanLine walks one
// line, carrying bracket depth / string state across lines, and reports
// facts about the statement at its outer level only. It is a heuristic
// scanner, not a full tokenizer; it covers what this editor realistically
// holds.
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

els.textarea.addEventListener('input', () => {
  const t = els.textarea;
  // First real modification while unlocked (after a failed run): back to the
  // initial state — error display and highlights go. Locked editors never
  // reach this, so a successful run's trace is safe to inspect.
  if (!state.locked && (state.programError || state.stoppedRun || state.steps.length)) resetRun();
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

// Tab inserts 4 spaces; Shift+Tab outdents; Backspace deletes one indent
// level at content start; Enter auto-indents smartly.
els.textarea.addEventListener('keydown', (e) => {
  const t = els.textarea;
  if (state.locked) return;   // readOnly blocks typing; these handlers must not splice values either

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
    } else if (start !== end) {
      // Indent: add one indentation level to each line the selection touches,
      // mirroring the Shift+Tab block bookkeeping exactly (design doc
      // 2026-11-02-tab-indent-design.md, grilled Q1–Q4).
      const lineStart = t.value.lastIndexOf('\n', start - 1) + 1;
      const blockEnd = t.value.indexOf('\n', end) === -1
        ? t.value.length
        : t.value.indexOf('\n', end);
      const lines = t.value.slice(lineStart, blockEnd).split('\n');
      let offset = 0;   // growth of the block tail: one INDENT per selected line
      const indented = lines.map((line) => {
        offset += INDENT.length;
        return INDENT + line;
      }).join('\n');
      spliceInsert(t, lineStart, blockEnd, indented);
      // First line's indent shifts the selection head; every selected line's
      // indent accumulates on the tail — the original text stays selected.
      t.selectionStart = start + INDENT.length;
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

// ✎ Edit: back to the pre-run state (the trace is regenerated by Visualize).
els.edit.addEventListener('click', () => {
  state.locked = false;
  resetRun();
  applyLock();
});

els.textarea.value = DEFAULT_CODE;
