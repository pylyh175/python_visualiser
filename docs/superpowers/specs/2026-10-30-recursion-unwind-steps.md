# Recursion unwind steps (return-event steps) — 2026-10-30

## Problem

Single-chain recursion (factorial, power) shows only the descent: the trace
records no steps while values combine on the way back, because a caller
resumes *on the same line* after a nested call returns — the settrace line
event does not re-fire there, and the caller's own return event records no
step. All unwind returns therefore pile onto the final step (verified:
`factorial(4)` = 11 steps, `ret[#5→1, #4→2, #3→6, #2→24]` all on step 10).
Branching recursion (fib) only looked right because further child calls
generate steps between returns.

## Design (grilled, all confirmed)

1. **runner.py — a return is a step.** On every user-frame `return` event
   (ids past the MAX_CALLS cap excluded), record a step immediately: line =
   the frame's return line, stack = the frame chain active at that instant
   (the returning frame still on top), locals snapshot as usual, and all
   pending return values resolve on this step (`pending_ret` cleared). This
   includes the module frame's own return in simple programs, whose pending
   ret previously collapsed onto the final step — its completion step now
   also makes the final green arrow land on the module's last executed
   line. The step is flagged `retStep: true`. STEP_LIMIT/TIME_LIMIT are
   checked here too.
2. **main.js renderEditor — green-only on return steps.** Nothing is about
   to run next (the caller resumes silently on its own line), so a return
   step shows the green just-finished arrow on its own line and no orange
   arrow. Errors keep the red marker; final step unchanged.
3. **main.js renderTree — done beats active.** `retSet` now takes
   precedence over `activeId`, and the active node is the innermost stack
   frame *without* a return value at this step: during a return step the
   just-returned callee renders green `fn(args) → value` while its parent
   (the frame beneath) shows active — the combine moment, exactly when the
   parent is about to consume the value.
4. **Scope & cost.** Uniform for every call (non-recursive calls also gain
   one extra completion step); deep recursion roughly doubles the step
   count; acceptance accepted, no new caps.

Tree replay (`treeData`) is untouched by design: `ret` entries attached to
steps are already replayed bottom-up; the fixes are arrow/class precedence
only.
