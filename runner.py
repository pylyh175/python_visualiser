import ast
import builtins
import inspect
import io
import json
import sys
import time
import tokenize
import traceback
import types

STEP_LIMIT = 20000        # max recorded steps
TIME_LIMIT = 10.0         # seconds of tracing before we stop (keeps UI responsive)
MAX_STR = 500             # max chars kept for any string value
MAX_ITEMS = 100           # max elements kept per container
MAX_VARS = 60             # max variables kept per snapshot
VIZ_FILENAME = "<visualiser_code>"


def __viz_signature(fn):
    """Signature string for a function/method, with annotations kept as
    written (eval_str=False). Under PEP 649 (Python 3.14) annotations are
    lazy and may reference names undefined at runtime (e.g. a missing
    `from typing import List`) — evaluating them on introspection would
    raise, so they must be rendered without evaluation. Returns None when
    no signature can be built at all."""
    try:
        return str(inspect.signature(fn, eval_str=False))
    except TypeError:
        # very old Python without eval_str, or not introspectable — try plain
        try:
            return str(inspect.signature(fn))
        except Exception:
            return None
    except Exception:
        return None


def __viz_make_safe(value, depth=0):
    """Convert a Python value into something JSON-representable (truncated)."""
    if depth > 5:
        return "…"
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value if abs(value) < 10 ** 15 else str(value)
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return repr(value)
        return value
    if isinstance(value, str):
        if len(value) <= MAX_STR:
            return value
        return value[:MAX_STR] + " … (truncated)"
    if isinstance(value, (list, tuple)):
        items = list(value)[:MAX_ITEMS]
        head = [__viz_make_safe(v, depth + 1) for v in items]
        if len(value) > MAX_ITEMS:
            head.append("… +" + str(len(value) - MAX_ITEMS) + " more")
        return head if isinstance(value, list) else ["(tuple)"] + head
    if isinstance(value, dict):
        out = {}
        for i, (k, v) in enumerate(value.items()):
            if i >= MAX_ITEMS:
                out["…"] = "+" + str(len(value) - MAX_ITEMS) + " more"
                break
            key = k if isinstance(k, str) else str(k)
            out[key[:60]] = __viz_make_safe(v, depth + 1)
        return out
    if isinstance(value, (set, frozenset)):
        items = [__viz_make_safe(v, depth + 1) for v in list(value)[:MAX_ITEMS]]
        return dict(enumerate(items))
    if isinstance(value, (types.FunctionType, types.MethodType)):
        # A bare function object's repr (<function Stack.push at 0x…>) tells
        # the user nothing; "qualname(signature)" shows the name, parameters,
        # and any type annotations (kept as written, never evaluated).
        name = getattr(value, "__qualname__", None) or getattr(value, "__name__", "?")
        sig = __viz_signature(value)
        return (name + (sig if sig is not None else "(?)"))[:MAX_STR]
    if isinstance(value, type):
        # A class: its name plus the methods of its own body as
        # name(parameters) — the blueprint's callable surface, sorted
        # alphabetically (dunder methods sort first). Inherited members are
        # deliberately left out.
        parts = []
        for n in sorted(vars(value)):
            f = getattr(vars(value)[n], "__func__", vars(value)[n])   # unwrap @staticmethod/@classmethod
            if not isinstance(f, types.FunctionType):
                continue
            try:
                sig = __viz_signature(f)
                parts.append(n + (sig if sig is not None else "(?)"))
            except Exception:
                parts.append(n + "(?)")
        text = value.__name__ + " { " + ", ".join(parts) + " }"
        if len(text) > MAX_STR:
            text = text[:MAX_STR] + " … (truncated)"
        return text
    if isinstance(value, types.ModuleType):
        return repr(value)[:MAX_STR]   # modules already have a readable repr
    if hasattr(value, "__dict__"):
        # An instance: class name + its live attribute values, so the user
        # sees the object's current state instead of an address. Attributes
        # are rendered exactly like variables elsewhere (same recursion,
        # same caps); instances without a plain __dict__ (e.g. __slots__)
        # fall through to the repr below.
        attrs = [(k, v) for k, v in value.__dict__.items() if not k.startswith("__")]
        parts = []
        for i, (k, v) in enumerate(attrs):
            if i >= MAX_ITEMS:
                parts.append("… +" + str(len(attrs) - MAX_ITEMS) + " more")
                break
            try:
                safe = __viz_make_safe(v, depth + 1)
                rendered = "None" if safe is None else json.dumps(safe)
            except Exception:
                rendered = "<?>"
            parts.append(k + ": " + rendered)
        text = type(value).__name__ + " instance { " + ", ".join(parts) + " }"
        if len(text) > MAX_STR:
            text = text[:MAX_STR] + " … (truncated)"
        return text
    if callable(value) or hasattr(value, "__module__"):
        try:
            return repr(value)[:MAX_STR]
        except Exception:
            return "<object>"
    return str(value)


def __viz_locals(frame, sticky):
    """Snapshot everything *visible* at this point, skipping dunders.

    Walks the call chain from the innermost frame out to the module:
    a name stays visible as long as its scope is live, so variables
    defined at module level remain shown while stepping inside a
    function, and a function's locals disappear again once it returns.
    Innermost scope wins on name conflicts (Python's own shadowing
    rule), and MAX_VARS caps the list with the innermost frames first.

    Names defined inside a class body (methods, class attributes) are
    additionally remembered in `sticky`: once the body finishes they
    live on only as class attributes, but their individual entries
    stay visible for the rest of the run (last-known value).
    """
    out = {}

    def add(items):
        # Returns False once the MAX_VARS cap was hit ("…" marker added).
        for name, value in items:
            if name.startswith("__") or isinstance(value, types.ModuleType):
                continue   # dunders never shown; imported modules are noise
            if name in out:
                continue
            if len(out) >= MAX_VARS:
                out["…"] = "more variables hidden"
                return False
            try:
                out[name] = __viz_make_safe(value)
            except Exception:
                out[name] = "<?>"
        return True

    # Innermost user-code frame; the executing frame is always the chain's
    # head, so this is the frame whose line was just recorded.
    f = frame
    while f is not None and f.f_code.co_filename != VIZ_FILENAME:
        f = f.f_back
    if f is None:
        return out
    try:
        items = list(f.f_locals.items())
    except Exception:
        items = []

    if f.f_code.co_name == "<module>":
        # Module level: retained class-body functions come first (so a class
        # entry sits below its methods), then globals in binding order.
        if not add(list(sticky.items())):
            return out
        if not add(items):
            return out
    else:
        if not add(items):
            return out
        # A class body executing now: remember its names so their individual
        # entries survive the frame (last-known value).
        if any(k == "__qualname__" for k, _ in items):
            for name, value in items:
                if not name.startswith("__") and not isinstance(value, types.ModuleType):
                    try:
                        sticky[name] = __viz_make_safe(value)
                    except Exception:
                        sticky[name] = "<?>"
        # Then the remembered class-body names, ahead of the outer scopes:
        # functions above their class, locals above globals.
        if not add(list(sticky.items())):
            return out

    # Remaining outer user frames (typically the module frame).
    f = f.f_back
    while f is not None:
        if f.f_code.co_filename == VIZ_FILENAME:
            try:
                items = list(f.f_locals.items())
            except Exception:
                items = []
            if not add(items):
                return out
        f = f.f_back
    return out


def __viz_run(code):
    """Execute user code with a line tracer, return JSON with every step."""
    filename = VIZ_FILENAME
    steps = []
    out = io.StringIO()
    state = {"count": 0}
    sticky = {}    # class-body names (methods etc.) kept visible after the body ends
    # Recursion tree data: each user-frame call gets a unique id (kept alive
    # in `frames` until it returns, so a recycled address can never be
    # confused with an earlier call at the same address).
    frames = {}        # live user frame object -> call id
    call_info = {}     # call id -> {"fn": ..., "args": {...}} captured at the call event
    call_count = 0     # user-code calls seen so far
    MAX_CALLS = 5000   # safety stop: ids/labels stop being recorded past this
    pending_ret = []   # returns not yet resolved on a recorded step (normally ≤1: the next return step resolves them)
    unwinding = False  # an exception is propagating; frame exits are not returns
    t0 = time.monotonic()

    class VizStop(Exception):
        pass

    def tracer(frame, event, arg):
        nonlocal call_count, pending_ret, unwinding
        if frame.f_code.co_filename != filename:
            return None
        if event == "call":
            # Snapshot the call-time arguments now, before the body runs.
            call_count += 1
            if call_count > MAX_CALLS:
                return tracer
            fid = call_count
            frames[frame] = fid
            args = {}
            try:
                for k, v in frame.f_locals.items():
                    if not k.startswith("__"):
                        try:
                            args[k] = __viz_make_safe(v)
                        except Exception:
                            args[k] = "<?>"
            except Exception:
                pass
            call_info[fid] = {"fn": frame.f_code.co_name, "args": args}
            return tracer
        if event == "line":
            unwinding = False   # execution resumed (e.g. an except handler caught it)
            state["count"] += 1
            if state["count"] > STEP_LIMIT or time.monotonic() - t0 > TIME_LIMIT:
                raise VizStop()
            if frame.f_lineno in skip_lines:
                return tracer   # documentation line: nothing meaningful to show
            snap = {}
            try:
                snap = __viz_locals(frame, sticky)
            except Exception:
                pass
            # Call stack: chain of user-code frames, outermost (module) first.
            # Stops short when calls went past the id cap — the tree then
            # shows a "+N more calls" summary instead of exact structure.
            chain = []
            fr = frame
            while fr is not None and fr.f_code.co_filename == filename:
                fid = frames.get(fr)
                if fid is None:
                    if fr.f_code.co_name == "<module>":
                        fid = 0
                        frames[fr] = 0
                    else:
                        break
                info = call_info.get(fid) or {"fn": fr.f_code.co_name, "args": {}}
                chain.append({"id": fid, "fn": info["fn"], "args": info["args"]})
                fr = fr.f_back
            chain.reverse()
            step = {"line": frame.f_lineno, "locals": snap, "outLen": out.tell(),
                    "stack": chain}
            if pending_ret:
                step["ret"] = pending_ret
                pending_ret = []
            steps.append(step)
        elif event == "exception":
            # The propagating exception will unwind frames, each exiting with
            # a 'return' event and no value — those returns must not resolve
            # tree nodes ("→ None" would lie) nor produce steps.
            unwinding = True
        elif event == "return":
            loc = frame.f_locals
            # A class body just finished: capture its complete namespace —
            # the last def line never gets a later line event to do it.
            # (Regular function returns have no __qualname__ and are ignored.)
            if "__qualname__" in loc:
                for name, value in loc.items():
                    if not name.startswith("__") and not isinstance(value, types.ModuleType):
                        try:
                            sticky[name] = __viz_make_safe(value)
                        except Exception:
                            sticky[name] = "<?>"
            # Record the call's return value, and make the return itself a
            # recorded step: after a nested call returns, the caller resumes
            # on the *same* line (no line event fires there), so single-chain
            # recursion would otherwise freeze on its descent and resolve the
            # entire tree on the final step. On a return step the returning
            # frame is still the stack top; its own and any other pending
            # returns resolve right here, so the tree flips the callee to its
            # value while the consuming caller stays active — the combine
            # moment, level by level, for every recursion shape.
            fid = frames.pop(frame, None)
            # The module frame has rets recorded (its id ≠ 0 — the call event
            # numbered it) but the renderer ignores <module> nodes; unwound
            # frames (exception exit) record nothing at all.
            if fid is not None and fid != 0 and not unwinding:
                try:
                    value = __viz_make_safe(arg)
                except Exception:
                    value = "<?>"
                pending_ret.append({"id": fid, "value": value})
                state["count"] += 1
                if state["count"] > STEP_LIMIT or time.monotonic() - t0 > TIME_LIMIT:
                    raise VizStop()
                snap = {}
                try:
                    snap = __viz_locals(frame, sticky)
                except Exception:
                    pass
                # Call stack active at this instant (chain of user frames,
                # outermost first). fid was popped above, so re-insert the
                # returning frame's own id while walking its chain.
                chain = []
                fr = frame
                while fr is not None and fr.f_code.co_filename == filename:
                    if fr is frame:
                        chain_fid = fid          # the frame that just resolved
                    else:
                        chain_fid = frames.get(fr)
                    if chain_fid is None:
                        if fr.f_code.co_name == "<module>":
                            chain_fid = 0
                        else:
                            break
                    info = call_info.get(chain_fid) or {"fn": fr.f_code.co_name, "args": {}}
                    chain.append({"id": chain_fid, "fn": info["fn"], "args": info["args"]})
                    fr = fr.f_back
                chain.reverse()
                step = {"line": frame.f_lineno, "locals": snap, "outLen": out.tell(),
                        "stack": chain, "retStep": True}
                if pending_ret:
                    step["ret"] = pending_ret
                    pending_ret = []
                steps.append(step)
        return tracer

    g = {"__name__": "__main__", "__builtins__": builtins}
    old_stdout = sys.stdout
    sys.stdout = out
    stopped = False
    error_text = None
    error_line = None

    code_obj = None
    try:
        code_obj = compile(code, filename, "exec")
    except SyntaxError as e:
        error_text = "SyntaxError: " + str(e.msg)
        error_line = e.lineno

    # Lines that are documentation rather than executable code:
    #   - comment-only lines (tokenize finds them; they never run anyway)
    #   - bare string-expression statements — any `"""…"""` (or plain string)
    #     statement, wherever it appears. Python only calls the first one a
    #     "docstring", but every bare string constant evaluates to itself and
    #     binds nothing: it carries no behaviour, so steps are not recorded
    #     there — the arrows jump straight to the next executable line.
    skip_lines = set()
    if code_obj is not None:
        try:
            for tk in tokenize.generate_tokens(io.StringIO(code).readline):
                if tk.type == tokenize.COMMENT:
                    skip_lines.add(tk.start[0])
        except (tokenize.TokenError, SyntaxError, IndentationError):
            pass
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
                        and isinstance(node.value.value, str)):
                    end = getattr(node, "end_lineno", None) or node.lineno
                    skip_lines.update(range(node.lineno, end + 1))
        except SyntaxError:
            pass

    if code_obj is not None:
        try:
            sys.settrace(tracer)
            exec(code_obj, g)
        except VizStop:
            stopped = True
        except BaseException as e:
            tb = traceback.extract_tb(sys.exc_info()[2])
            error_line = tb[-1].lineno if tb else None
            # Prefer the deepest frame inside the user's own code: an error
            # surfacing from an imported module or a callback would otherwise
            # highlight a line number from a file the editor does not show.
            for fr in reversed(tb):
                if fr.filename == filename:
                    error_line = fr.lineno
                    break
            error_text = type(e).__name__ + ": " + str(e)
        finally:
            sys.settrace(None)
            sys.stdout = old_stdout
    else:
        sys.stdout = old_stdout

    output = out.getvalue()

    # Final step: shows the state after the whole program ran (or at the error).
    if steps:
        last_line = steps[-1]["line"]
        final_line = error_line if (error_line and error_line > 0) else last_line
        final_locals = {}
        for name, value in g.items():
            if not name.startswith("__") and not isinstance(value, types.ModuleType):
                try:
                    final_locals[name] = __viz_make_safe(value)
                except Exception:
                    pass
        steps.append({"line": final_line, "locals": final_locals,
                      "outLen": len(output), "finished": True,
                      "stack": steps[-1].get("stack", [])})
        # Returns still pending at the end (e.g. the outermost call of a
        # recursion — no line event follows them) resolve on this step.
        if pending_ret:
            steps[-1]["ret"] = pending_ret
            pending_ret = []

    result = {
        "steps": steps,
        "output": output,
        "error": error_text,
        "errorLine": error_line,
        "stopped": stopped,
    }
    return json.dumps(result)
