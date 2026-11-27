# 🐍 Python Code Visualiser

A web-based Python code visualiser — type or paste Python code, visualise its execution
step by step, and inspect the output at each point.

## How to run

Double-click **`start.bat`** — it starts a tiny local web server and opens the
browser. An internet connection is required to load the Pyodide (Python 3.14)
runtime from the CDN.

Browsers refuse to let a `file://` page read sibling files, so `runner.py` can
only be fetched over http — opening `index.html` directly (without the server)
shows a friendly message reminding you to use `start.bat`.

To stop the server, close its minimized console window.

## Project structure

- `index.html` — page layout only
- `runner.py` — the Python tracer that runs inside Pyodide
- `style.css` — all styling
- `main.js` — application logic (editor rendering, step controls, Pyodide integration)
- `start.bat` — starts the local web server and opens the browser

## Features

- **Code editor** with line numbers and a *Visualize* button
- **Automatic indentation** while you type:
  - pressing Enter after a line ending in `:` (for / while / if / elif / else / def /
    class / try / except / finally / with) indents the next line automatically
  - typing `else`, `elif`, `except` or `finally` at the start of an indented line
    pops the line back out one level by itself
  - `return`, `pass`, `break`, `continue` also back out one level afterwards
  - pressing Enter on a blank auto-indented line exits the block
  - Backspace at the start of an indented line removes one indent level;
    Tab inserts 4 spaces and Shift+Tab outdents the current line
- **Step controls** once visualised:
  - `First` — jump to the first step
  - `Prev` — previous step
  - `Next` — next step
  - `Last` — jump straight to the final step
  - (arrow keys `←` / `→` also work)
- **Two arrows in the gutter**:
  - 🟢 green `▶` — the line that just executed
  - 🟠 orange `▶` — the next line to be executed
- **Smart stepping**: comment lines and docstrings (module, class or function
  doc blocks, including multi-line ones) are treated as documentation and are
  never marked as the current or next line — the arrows jump straight to the
  next executable line.
- **Variables panel** on the right showing the state of variables at the current step
- **Output panel** showing exactly what has been printed so far at the current step
- Works with `for` loops, `while` loops, `if/else`, `print`, nested functions, lists,
  dicts, and strings — i.e. anything the real Python interpreter can run

### DSA visualisers (auto-detected from your code)

- **Recursion tree** — animated call tree for recursive functions; grows with
  depth, switches to text view beyond 250 nodes; click a node to jump to its step.
- **Stack** — capacity-driven figure: the user's `max_capacity` (or `capacity`,
  `limit`, etc.) decides whether **one** dashed "room left" box appears above
  content; full stack draws none, unknown capacity draws one; strip shows
  `size: N / C` or plain `size: N`; multiple `Stack` instances each get their
  own figure with their own capacity.
- **Queue** — linear array queue on the two-pointer kit: queued items solid,
  freed slots at front hatched (served, never reused), room at rear dashed;
  front/rear glide markers; strip shows `size: N / C` and `front`/`rear` values;
  badges for `empty` / `full` / `full — N freed slots wasted`.
- **Hash Table (Linear Probing)** — one slot row per table with a load gauge
  (½ marker); the hash strip walks the key's characters, then the probe shows
  its home slot, cursor and colour-coded trail (collision / match / empty), with
  a wrap arrow past the last slot; delete shows the gap, the cluster scan and
  each re-placed key; rehash keeps the old table dimmed above the new one;
  a full table gets a "Table is full!" banner.
- **Hash Table (Separate Chaining)** — a column of buckets, each with its chain
  of Linked List boxes and "len n"; the hash strip picks the home bucket, then
  `current` / `previous` tags walk the chain (passed nodes grey, match green,
  `None` amber at the end); a new node floats above and links in at the front;
  delete drops the node below with a bypass arc; load factor can pass 1.
- **Binary Search Tree** — the data tree in in-order layout (left to right =
  sorted); a `current` tag walks the path of recursive frames with the
  comparison in the caption, a dashed ghost slot marks the `None` child reached
  (the new node grows there, red on a miss); returns travel up each edge and
  name the relink; delete shows case 1 / 2 / 3 with the successor key flying
  into place; `height` and `in_order` fill in badges and a result strip; a
  call-stack column and size / height / visited counters sit alongside.
- **Two Pointers** — generic two-pointer animation (e.g. two-sum, remove
  duplicates); cell windowing keeps both pointers in view on narrow screens;
  reverse array and palindrome sub-modes.
- **Container With Most Water** — proportional bars with water level; three
  bar-width presets per viewport class (phone/tablet/laptop/monitor).

## How it works

- The page loads [Pyodide](https://pyodide.org) — the real CPython interpreter compiled
  to WebAssembly (currently Python 3.14).
- When you click **Visualize**, your code is executed inside Pyodide with a
  `sys.settrace` hook. At every executed line, the tracer records:
  - the line number,
  - the current variables (as JSON-safe snapshots),
  - how much output has been printed so far.
- The browser then plays back those recorded snapshots when you step with
  First / Prev / Next / Last — nothing is re-executed while stepping.
- Safety limits: runs are capped at 20,000 steps / 10 seconds so infinite loops
  can't hang the browser.

## Project status / roadmap

Implemented (v1 + DSA visualisers):
- stepper UI, arrows, output and variables visualisation for single-file scripts
- recursion tree, stack, queue, two pointers, container visualisers
- hash table (linear probing, separate chaining) visualisers
- binary search tree visualiser
- responsive layouts: stacked (phone/tablet) with bottom dock + swipe step,
  split (laptop/monitor) side-by-side; CSS device tokens
- class cards in Variables panel with call facts (×N calls, last return, exceptions)

Possible next steps:
- function call stack visualization (nested frames)
- memory diagram-style object visualisation (Python Tutor style)
- `input()` support, sharing/loading code from URLs
- circular queue, linked list visualisers
