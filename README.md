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

Implemented so far (v1):
- stepper UI, arrows, output and variables visualisation for single-file scripts

Possible next steps:
- function call stack visualization (nested frames)
- memory diagram-style object visualisation (Python Tutor style)
- `input()` support, sharing/loading code from URLs, dark mode
