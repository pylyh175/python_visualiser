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
import weakref

STEP_LIMIT = 20000        # max recorded steps
TIME_LIMIT = 10.0         # seconds of tracing before we stop (keeps UI responsive)
MAX_STR = 500             # max chars kept for any string value
MAX_ITEMS = 100           # max elements kept per container
MAX_VARS = 60             # max variables kept per snapshot
VIZ_FILENAME = "<visualiser_code>"
# Set by __viz_run: __qualname__ -> FunctionDef for every function declared
# in the run's source (see __viz_source_fn_map). Read by __viz_signature;
# None (or a lookup miss) means "not declared in the run's source".
_VIZ_SOURCE_FNS = None

try:
    # Pyodide host: the browser's own clock is the one honest wall-time source
    # here (2026-11-08 silent-empty-run bug, ground-truth probed: the WASM
    # build's time.monotonic() jumps ~14 s during the FIRST traced execution —
    # a steady-state-verified discontinuity, steady-state both clocks agree —
    # so t0-vs-event sampling via monotonic aborted the first run at its
    # very first line event with a silent empty result).
    from js import performance
    _VIZ_CLOCK = lambda: performance.now() / 1000.0
except ImportError:
    # Local CPython (simulators, tests): proven honest.
    _VIZ_CLOCK = time.monotonic


def _viz_unparse_ann(ann):
    """Annotation AST -> text exactly as the user wrote it. A stringized
    annotation (`from __future__ import annotations`) holds the text as a
    Constant string, so `x: Undefined` renders `Undefined` (as written), not
    `'Undefined'` — string literals the user wrote explicitly collapse the
    same way, which is harmless in this position."""
    if isinstance(ann, ast.Constant) and isinstance(ann.value, str):
        return ann.value
    try:
        return ast.unparse(ann)
    except Exception:
        return ""


def __viz_sig_from_ast(fdef, drop_first=False):
    """Render "(params) -> ret" from a FunctionDef, annotations and defaults
    exactly as written — syntactic only, never evaluated (PEP 649 safe).
    drop_first=True strips a leading literal `self`/`cls` parameter (used by
    the class-blueprint branch, grilled Q3)."""
    a = fdef.args
    parts = []

    def param_text(x):
        t = x.arg
        if x.annotation is not None:
            t = t + ": " + _viz_unparse_ann(x.annotation)
        return t

    def with_default(t, d):
        # Match inspect's style: `b=2` when unannotated, `b: int = 3` when not.
        sep = " = " if ":" in t else "="
        return t + sep + ast.unparse(d)

    pos = list(a.posonlyargs) + list(a.args)
    d0 = len(pos) - len(a.defaults)
    for i, x in enumerate(pos):
        t = param_text(x)
        if i >= d0:
            t = with_default(t, a.defaults[i - d0])
        parts.append(t)
    if a.posonlyargs:
        parts.insert(len(a.posonlyargs), "/")
    if a.vararg is not None:
        t = "*" + a.vararg.arg
        if a.vararg.annotation is not None:
            t = t + ": " + _viz_unparse_ann(a.vararg.annotation)
        parts.append(t)
    for i, x in enumerate(a.kwonlyargs):
        t = param_text(x)
        d = a.kw_defaults[i]
        if d is not None:
            t = with_default(t, d)
        parts.append(t)
    if a.kwarg is not None:
        t = "**" + a.kwarg.arg
        if a.kwarg.annotation is not None:
            t = t + ": " + _viz_unparse_ann(a.kwarg.annotation)
        parts.append(t)
    if drop_first and parts:
        head = parts[0].split(" = ")[0].split(":")[0].strip()
        if head in ("self", "cls"):
            parts = parts[1:]
            if parts and parts[0] == "/":
                parts = parts[1:]
    s = "(" + ", ".join(parts) + ")"
    if fdef.returns is not None:
        s = s + " -> " + _viz_unparse_ann(fdef.returns)
    return s


def __viz_source_fn_map(source):
    """__qualname__ -> FunctionDef for every function declared in the run's
    source text (module-level, nested and class-prefixed). The executed code
    is compiled from this same text, so qualnames match; closure scopes
    contribute `<locals>` segments exactly as inspect does."""
    try:
        tree = ast.parse(source, filename=VIZ_FILENAME)
    except Exception:
        return {}
    out = {}

    def walk(node, prefix):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                qn = prefix + child.name
                out[qn] = child
                walk(child, qn + ".<locals>.")
            elif isinstance(child, ast.ClassDef):
                walk(child, prefix + child.name + ".")
            else:
                walk(child, prefix)

    walk(tree, "")
    return out


def _viz_sig_drop_first(sig):
    """Drop a leading literal `self`/`cls` parameter from a rendered
    signature string — the class-blueprint variant of drop_first. Simple
    textual handling for the inspect fallback (annotations may contain
    commas, so split only at the param-list edges)."""
    s = sig.strip()
    if not s.startswith("("):
        return sig
    end = s.find(")")
    if end <= 1:
        return sig
    head, tail = s[1:end], s[end:]
    for kw in ("self", "cls"):
        if head == kw:
            return "()" + tail
        if head.startswith(kw + ","):
            h = head[len(kw) + 1:].strip()
            if h.startswith("/"):
                h = h[1:].strip()
            if h.startswith(","):
                h = h[1:].strip()
            return "(" + h + tail
    return sig


def __viz_signature(fn, drop_first=False):
    """Signature string for a function/method. Primary path: the run's own
    source (AST parse — annotations rendered exactly as written, never
    evaluated, so PEP 649 lazy annotations and unimported names cannot break
    it; this is the fix for the `(?)` reproduced on Pyodide). Fallback for
    functions not declared in the run's source (e.g. imported functions
    assigned to a variable): inspect with eval_str=False. None when no
    signature can be built at all. drop_first=True strips a leading literal
    `self`/`cls` parameter (class-blueprint branch, grilled Q3)."""
    q = getattr(fn, "__qualname__", None) or getattr(fn, "__name__", None)
    fdef = (_VIZ_SOURCE_FNS or {}).get(q) if q else None
    if fdef is not None:
        try:
            return __viz_sig_from_ast(fdef, drop_first=drop_first)
        except Exception:
            pass
    try:
        sig = str(inspect.signature(fn, eval_str=False))
    except TypeError:
        # very old Python without eval_str, or not introspectable — try plain
        try:
            sig = str(inspect.signature(fn))
        except Exception:
            return None
    except Exception:
        return None
    return _viz_sig_drop_first(sig) if drop_first else sig


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
                sig = __viz_signature(f, drop_first=True)
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


def __viz_locals(frame, sticky, record=None):
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

    `record(name, value)` (2026-11-15 memory-diagram design, grilled
    Q1–Q9), when given, is called for every name whose formatted value
    was stored — the caller uses it to build the step's parallel node
    graph (aliased objects draw one box with several arrows).
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
            else:
                if record is not None:
                    try:
                        record(name, value)
                    except Exception:
                        pass
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
    # Signatures are built from the run's own source (AST — annotations kept
    # as written, never evaluated), so make that source visible to the
    # signature builder before execution starts.
    global _VIZ_SOURCE_FNS
    _VIZ_SOURCE_FNS = __viz_source_fn_map(code)

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
    obj_oids = {}      # id(instance) -> [weakref, oid]: stable small identity
                       # per object, recorded on stack-frame entries as `oid`
                       # (2026-11-05 stack multi-instance design, grilled Q1)
    oid_count = 0      # instances seen so far

    def __viz_obj_oid(obj):
        # Stable small integer per object instance so two instances of the
        # SAME class can be told apart (their snapshots can be byte-equal).
        # The weakref guard frees the slot when the object dies, so a
        # recycled id() can never merge two different objects. Schemas
        # without __weakref__ (slots) fall back to the raw key: id reuse
        # then merges instances — a vanishing edge, recorded in the design.
        nonlocal oid_count
        key = id(obj)
        slot = obj_oids.get(key)
        if slot is not None:
            if slot[0] is None or slot[0]() is obj:
                return slot[1]
            del obj_oids[key]          # previous object died; id can be reused
        try:
            ref = weakref.ref(obj)
        except Exception:
            ref = None
        oid_count += 1
        obj_oids[key] = (ref, oid_count)
        return oid_count

    def __viz_oid_for_frame(fr):
        # `oid` only for genuine user-class instances bound as `self`
        # (builtins, modules and functions never qualify — their frames
        # stay free of instance identity).
        self_obj = fr.f_locals.get("self")
        if self_obj is None or type(self_obj) in (
                str, int, float, bool, complex, list, dict, tuple,
                set, frozenset, type, types.ModuleType, types.FunctionType,
                types.BuiltinFunctionType):
            return None
        return __viz_obj_oid(self_obj)

    # ── Memory-diagram graph (2026-11-15, grilled Q1–Q9) ──
    # Alongside the legacy formatted values, each step's displayed
    # container/instance values are emitted as a node graph keyed by the
    # same weakref-guarded object ids the stack panel consumes. Aliasing
    # (b = a) then draws ONE box with multiple inbound arrows, cycles
    # render as loop-back markers, and the panel never recurses forever.
    # The legacy formats stay untouched: looksLikeDefinition, stack.js
    # and twoPointers.js keep consuming them. Node shape:
    #   {"t": "list"|"tuple"|"dict"|"set", "items": [elem…]}
    #   {"t": "inst", "cls": Name, "items": [[attr, elem]…]}
    # where elem is a scalar, {"ref": oid} (already-seen object — the
    # panel draws an arrow or, on a back-edge, a loop-back marker) or
    # {"more": n} (the +N more sentinel). Dict keys and instance
    # attribute names lead their slots; values follow.
    MEM_MAX_ITEMS = 100  # per container; the flat grid is fully scrollable
    MEM_MAX_DEPTH = 4    # box levels; the panel renders 3 and shows "…" beyond

    def __viz_mem_classify(v):
        # Mirrors __viz_make_safe's branch order: containers and plain
        # instances become graph nodes; functions/classes/modules stay
        # text (definitions); everything else inlines as a scalar.
        if isinstance(v, (list, tuple, dict, set, frozenset)):
            return "container"
        if isinstance(v, (types.FunctionType, types.MethodType, type)) \
                or isinstance(v, types.ModuleType):
            return "text"
        if hasattr(v, "__dict__"):
            return "instance"
        return "scalar"

    def __viz_mem_node(value, depth, mem):
        # Returns {"ref": oid} for containers/instances (registering the
        # node — and marking it emitted — BEFORE walking its children, so
        # a cycle reaches the {"ref"} branch instead of recursing), a
        # scalar for inline values, "…" past the depth cap, or None when
        # the value carries no node at all (definitions stay text rows).
        kind = __viz_mem_classify(value)
        if kind == "text":
            return None
        if kind == "scalar":
            try:
                return __viz_make_safe(value, depth)
            except Exception:
                return "<?>"
        if depth > MEM_MAX_DEPTH:
            return "…"
        oid = __viz_obj_oid(value)
        if oid in mem["emitted"]:
            return {"ref": oid}
        if isinstance(value, dict):
            node = {"t": "dict", "items": []}
            n = len(value)
            for k, v in value.items():
                if len(node["items"]) >= MEM_MAX_ITEMS:
                    break
                key = k if isinstance(k, str) else str(k)
                node["items"].append([key[:60], __viz_mem_node(v, depth + 1, mem)])
        elif isinstance(value, (set, frozenset)):
            node = {"t": "set", "items": []}
            n = len(value)
            for v in list(value)[:MEM_MAX_ITEMS]:
                node["items"].append(__viz_mem_node(v, depth + 1, mem))
        elif isinstance(value, (list, tuple)):
            node = {"t": "list" if isinstance(value, list) else "tuple", "items": []}
            n = len(value)
            for v in value[:MEM_MAX_ITEMS]:
                node["items"].append(__viz_mem_node(v, depth + 1, mem))
        else:
            node = {"t": "inst", "cls": type(value).__name__, "items": []}
            attrs = [(k, v) for k, v in value.__dict__.items() if not k.startswith("__")]
            n = len(attrs)
            for k, v in attrs[:MEM_MAX_ITEMS]:
                node["items"].append([k, __viz_mem_node(v, depth + 1, mem)])
        if n > MEM_MAX_ITEMS:
            node["items"].append({"more": n - MEM_MAX_ITEMS})
        mem["nodes"][str(oid)] = node
        mem["emitted"].add(oid)
        return {"ref": oid}

    def __viz_mem_record(name, value, mem):
        # Root of the diagram for one variable slot; scalars and
        # definitions contribute nothing (the panel keeps their text).
        root = __viz_mem_node(value, 1, mem)
        if isinstance(root, dict) and "ref" in root:
            mem["roots"][name] = root
    pending_ret = []   # returns not yet resolved on a recorded step (normally ≤1: the next return step resolves them)
    unwinding = False  # an exception is propagating; frame exits are not returns

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
            if state["count"] > STEP_LIMIT or _VIZ_CLOCK() - t0 > TIME_LIMIT:
                raise VizStop()
            if frame.f_lineno in skip_lines:
                return tracer   # documentation line: nothing meaningful to show
            snap = {}
            mem = None
            try:
                mem = {"roots": {}, "nodes": {}, "emitted": set()}
                snap = __viz_locals(frame, sticky,
                                    lambda n, v: __viz_mem_record(n, v, mem))
            except Exception:
                mem = None
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
                entry = {"id": fid, "fn": info["fn"], "args": info["args"],
                         "sig": fr.f_code.co_firstlineno}
                oid = __viz_oid_for_frame(fr)
                if oid is not None:
                    entry["oid"] = oid
                chain.append(entry)
                fr = fr.f_back
            chain.reverse()
            step = {"line": frame.f_lineno, "locals": snap, "outLen": out.tell(),
                    "stack": chain}
            if mem and mem["roots"]:
                step["mem"] = {"roots": mem["roots"], "nodes": mem["nodes"]}
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
                if state["count"] > STEP_LIMIT or _VIZ_CLOCK() - t0 > TIME_LIMIT:
                    raise VizStop()
                snap = {}
                mem = None
                try:
                    mem = {"roots": {}, "nodes": {}, "emitted": set()}
                    snap = __viz_locals(frame, sticky,
                                        lambda n, v: __viz_mem_record(n, v, mem))
                except Exception:
                    mem = None
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
                    entry = {"id": chain_fid, "fn": info["fn"], "args": info["args"],
                             "sig": fr.f_code.co_firstlineno}
                    ret_oid = __viz_oid_for_frame(fr)
                    if ret_oid is not None:
                        entry["oid"] = ret_oid
                    chain.append(entry)
                    fr = fr.f_back
                chain.reverse()
                step = {"line": frame.f_lineno, "locals": snap, "outLen": out.tell(),
                        "stack": chain, "retStep": True}
                if mem and mem["roots"]:
                    step["mem"] = {"roots": mem["roots"], "nodes": mem["nodes"]}
                if pending_ret:
                    step["ret"] = pending_ret
                    pending_ret = []
                steps.append(step)
        return tracer

    def _viz_user_import_names(code):
        # Top-level module names the code itself imports (from `import X.Y`
        # and `from X import …`). Keys off the code, not a fixed list.
        names = set()
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return names
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    names.add(a.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                names.add(node.module.split(".")[0])
        return names

    def _viz_data_science_globals(code):
        glob = {"__name__": "__main__", "__builtins__": builtins}
        # LAZY pre-exposure: now only modules the code actually imports are
        # pre-exposed, so unused libraries cost nothing and each one's init
        # is paid exactly once which is on the first run that really uses it.
        for name in _viz_user_import_names(code):
            try:
                glob[name] = __import__(name)
            except ImportError:
                # preserve "ImportError" for when users try to import it
                pass
        return glob

    glob = _viz_data_science_globals(code)
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
            # Budget starts right here: data-science imports above are load
            # time, not tracing time.
            t0 = _VIZ_CLOCK()
            exec(code_obj, glob)
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
        # The final step carries diagrams too (2026-11-15 memory-diagram
        # round): a fresh mem graph recorded for exactly the names add_final
        # stores, in the same sticky-then-globals order.
        final_mem = {"roots": {}, "nodes": {}, "emitted": set()}

        def add_final(names):
            for name, value in names:
                if name.startswith("__") or isinstance(value, types.ModuleType):
                    continue
                if name in final_locals:
                    continue   # sticky and globals name the same variable once
                if len(final_locals) >= MAX_VARS:
                    final_locals["…"] = "more variables hidden"
                    return False
                try:
                    final_locals[name] = __viz_make_safe(value)
                except Exception:
                    final_locals[name] = "<?>"
                else:
                    try:
                        __viz_mem_record(name, value, final_mem)
                    except Exception:
                        pass
            return True

        # Keep the layout of the regular module snapshots: class-body names
        # (sticky) first, then module globals, capped at MAX_VARS exactly like
        # __viz_locals does. Class names leave the module namespace when the
        # body ends and survive only via sticky — without this merge the
        # synthetic final step would make them vanish right at the last step.
        add_final(list(sticky.items()))
        add_final(glob.items())
        steps.append({"line": final_line, "locals": final_locals,
                      "outLen": len(output), "finished": True,
                      "stack": steps[-1].get("stack", [])})
        if final_mem["roots"]:
            steps[-1]["mem"] = {"roots": final_mem["roots"],
                                "nodes": final_mem["nodes"]}
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
