# Visualisation upgrade - recursion tree + two-pointer panes (2026-11-24)

## Bug fixes

| Where | Bug | Fix |
|---|---|---|
|`container.js` | read `locals.max_area`; the template uses `maxArea`, so "max" was always 0 and the pulse fired on every step (`0 > -1`) | best is computed from the recorded heights + pointers; the codes's own best variable is found by name (`findBestLocal`) and shown alongside |
| `reverse.js` | window always anchored at `min(l, r) - 2` - hid the reversed head on arrays > 5 | shared `visibleWindow()`: whole array from 0 when it fits the cap (the 2026-11-17 fix, now in one place) |
| `palindrome.js` | badge hard-coded `s[left] vs s[right]` | uses the detected names (`string[left] vs string[right]`)|
| `container.js` | `console.log` on every render | removed |
| `recursion.js` | tree always scrolled to the bottom, losing the active call while unwinding | scrolls the active node into view (graph and text views) |
| `style.css` | container bar value labels used `var(--text)` (near-black) on the always-dark pane| fixed light ink |

## Two pointer-panes - shared kit

`panels/pointerLogic.js` (pure, Node-testable) + `panels/pointerKit.js` (DOM).

- **Persistent DOM.** Cells are reconciled by key (`syncCells`) instead of `innerHTML` rebuilds, so colour/opacity/height transitions actually run.
- **Sliding markers**. One `▲ name` marker per pointer below the array, moved with a transform transition. Two pointers on one cell stack.
- **Swap arc** (Reverse). The two swapped values fly along mirrored arcs - only on a single forward step of a non-frozen frame.
- **Animation length follows playback speed** (`state.playSpeed`, `animMs()`): 320 ms by hand, `0.6 x step delay` while playing, 0 for `prefers-reduced-motion`.
- **Captions** - ground truth only: the change between this frame and the previous detected frame **of the same call** (`prevFrame`).
- **Settled regions**: Reverse/Palindrome outside `[l, r]` = done; Two Sum / Container outside `[l, r]` = ruled out; Remove Duplicated `[0, i)` = kept, `[i, j)` = already read.
- **Pointer roles by name**: left/right (blue/red) vs slow/fast (amber/green) - `i/j` no longer read as "left vs right"/
- **Ghost slots** at `-1` and `len`: detection accepts pointers one past either end, so the moment a loop condition fails stays visible.
- **Detection**: `scanPointerHints(code)` records which names index which sequence (`arr[left]`, `s[l:r]`, `nums[i - 1]`). A pair now needs a reason - a pointer-ish name pair (+10) or real use as an index (+20 each); two arbitrary in-range int no longer qualify. Results are memoised per run.
- **Pin control**: choose the sequence and both pointers by hand; while pinned, only the pinned names are detected. A DSA mode change resets to auto.

### Per-mode view

- **Two Sum** - `a + b = S <|=|> target` badge; caption names which pointer moved and why ("sum 13 > target 12 → right moved 5 → 4"); found pair flashes.
- **Remove Duplicates** - writer/reader roles, kept prefix, comparison badge, write flash, captions for writes / skips / advances.
- **Container** - water and bars glide (no refill from 0), dashed best-so-far outline, move rule in the caption (equal walls called out).
- Two Sum / Remove Duplicates now open their tab on Visualize (tab labelled with the sub-mode name)l the generic parent mode still stays on Output.

## Recursion - graphical tree

`panels/treeLayout.js` (pure tidy layout)+ `panels/recursion.js`

- SVG tree (Tree | Text toggle; > `TREE_SVG_CAP` = 250 calls → text only).
- Nodes persist and glide to new layout positions; new calls grow out of their parent; edges follow (`d` transition).
- Active path highlighted (dashed amber = waiting on the stack, solid glow = running); returned values fly up the edge to the caller on a forward step.
- Waiting caller show partial results(`got 2, ...`).
- Repeated calls(same function + arguments) get a coloured `xk` badge; hovering one highlights every copy. Base cases are teal.
- Counters: calls · depth · max depth · repeated. Call-stack column (hidden under 460 px pane width). Clicking a node / frame / text row jumps to the call's first step(`vis:goto` event → `steps.js`).

## Decoupling events

- `viz:rerender` - kit → `output.js`(`render()`), e.g. after a pin change.
- `viz:goto` - recursion pane → `navigation/steps.js` (`setIdx`, pauses play).