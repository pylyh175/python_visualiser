# Recursion tree visualization — design

Date: 2026-10-30
Status: approved for implementation

## Intent and why

When traced code makes recursive calls, the user should *see* the recursion:
a tree that grows as calls are made, then unwinds with returns shown one by
one so the "combining results" phase is visible. The animation must stay
synced with the existing step playback (slider, arrows, variables) because
everything is recorded first and replayed — scrubbing and rewinding are free.

## Goals

- Tree of calls: each call is a node under the frame that called it.
- Grows while the stack deepens; when calls return, nodes resolve bottom-up
  in return order, showing each call's return value as its caller absorbs
  the results.
- Works for any user recursion — value-returning (`fib`) and
  mutation-only (`dfs`) alike; nothing is special-cased.
- Synced with steps: every tree transition happens at a recorded step;
  stepping back rewinds the tree.

## Non-goals (this version)

- Free-form node-and-edge graph (rejected: layout math, panning).
- Class methods, generators, or recursion across imported modules
  (user editor code only, matching the tracer).
- Editing code inside the tree.

## Decisions (owner)

- **Tree shape**: tree of call nodes (chosen over stack-of-frames view).
- **Rendering**: indented outline tree (DOM rows + guide lines), chosen
  over an SVG node/edge graph.
- **Location**: inside the output panel, via tabs ("Output / Recursion"),
  auto-switching to the tree when recursive activity is first recorded;
  plain runs never show tabs and behave exactly as today.
- Commit messages stay short and bullet-style; user commits themselves.

## Recorder changes (runner.py)

- Walkable frame chain already exists: at every recorded **line** event,
  snapshot the user-code frame chain (deepest ~10 frames) as
  `stack: [{id, fn, args}]`, `id` from a WeakMap (each call gets a unique
  id; args captured at the `call` event so labels are call-time arguments).
- **`return`** events for user frames capture `{id, value}` as a pending
  return attached to the next recorded step (`ret: [{id, value}]`) — that
  step is the moment the caller resumes, i.e. the resolve moment.
- Existing step fields (`line`, `locals`, `outLen`) unchanged; older
  consumers ignore the new keys.

## Viewer changes (main.js + index.html + style.css)

- Replay `steps[0..idx]` into a node map: parent = caller in the stack,
  children in call order; `ret` events mark nodes resolved with values.
- Render as nested rows: active (deepest) node highlighted like the
  current line; resolved nodes show `fn(args) → value`; a failed run
  marks the error node red; a node cap (~80) collapses overflow into a
  "+N more calls" summary row.
- Tabs in the output panel: `#outputBody` and a new `#treeBody`; the
  Recursion tab appears only when a step has a stack deeper than one
  user frame. `resetRun()` tears the tree down with everything else.

## What's left to the builder

- Exact guide-line/fade styling (keep it minimal);
  smooth appearance via short CSS transitions, no keyframe choreography.
- Lazy-scroll the tree: keep the active node visible as it deepens.

## Verification

As per project practice: `node --check main.js` + `python` probe scripts
against `runner.__viz_run` (fib, factorial, numIslands-style dfs, error
mid-recursion, non-recursive run), then the owner's browser test.
