# Data science library imports support — 2026-11-02

## Problem

The Python visualizer executes user code in an isolated environment where only `builtins` is available in the globals dict. This means imports like `import numpy as np` or `from pandas import DataFrame` fail immediately because the libraries are not exposed to the executed code.

The web frontend uses Pyodide to run Python in the browser, which could have these libraries pre-loaded, but the backend Python runner (`runner.py`) provides the primary execution path for the visualization system.

## Decisions (grilled Q1–Q4: framework)

1. **Q1** — expose data science libraries (numpy, pandas, matplotlib, scikit-learn/sklearn) in the Python runner's globals so imports work exactly like regular Python imports, using whatever version is available in the Python environment. Missing libraries should be handled gracefully (e.g., error message or silent failure) to preserve existing functionality.

2. **Q2** — this is a backend change; the web frontend and the visualization logic remain unchanged. The frontend's Pyodide environment could be separately configured for browsers where these libraries are available (e.g., via a CDN), but the runner remains the primary source for imports.

3. **Q3** — one-time configuration: add the libraries to the globals dict in `__viz_run`, preserving the existing `__name__` and `__builtins__` entries. The design doc records which libraries are exposed; individual libraries can be toggled on/off without breaking the system.

4. **Q4** — all existing features remain unaffected. Import errors for unavailable libraries should not crash the visualization and should be visible to the user as a runtime error (e.g., `ModuleNotFoundError` on the `import` line). The existing error reporting (error text and line number) already covers this.

## Implementation

In `runner.py`, the `__viz_run` function creates a globals dict `g`. Replace:

```python
g = {"__name__": "__main__", "__builtins__": builtins}
```

with a helper that builds a dict of available data science libraries:

```python
def _viz_data_science_globals():
    g = {"__name__": "__main__", "__builtins__": builtins}
    # expose what's available in the Python environment
    for lib_name in ["numpy", "pandas", "matplotlib", "sklearn", "scikit-learn"]:
        try:
            g[lib_name] = __import__(lib_name)
        except ImportError:
            # preserve "ImportError" for when users try to import it
            pass
    return g
```

The function is used as `g = _viz_data_science_globals()` in `__viz_run`. This keeps the globals static at module load, preserving the existing import behavior (a user can still do `from numpy import array` if numpy is available).

The web frontend (`main.js`) already defines `let pyodide = null;` and loads Pyodide dynamically. No changes are required there, but a future enhancement could preload these libraries into the Pyodide environment once it's available.

## Verification

- `node --check main.js` / runner syntax: must pass
- The Python environment must have at least `numpy` (or one data science library) to confirm the code works
- Python probe: run real `__viz_run` with a script that imports each available library and uses it (e.g., `import numpy as np; np.array([1,2,3])`). The import should succeed and the visualization should work exactly as before.
- If a library isn't available (e.g., pandas), the import should raise a `ModuleNotFoundError` which is captured by the existing error reporting.
- Full regression sweep: tree/unwind/stepvis/etc. tests must all pass (no regression)
- Browser test: paste code that imports an available library, run visualization, verify the library works (no import errors, execution flows as expected).

## Future extensibility

The list of libraries is in a single place (the `_viz_data_science_globals` helper). Adding a new library is as simple as adding its name to the list.

## Commit messages (per file, not committing — per your rule)

**`runner.py`**
```
Add data science library globals to the Python visualizer runner

- Expose numpy, pandas, matplotlib, scikit-learn/sklearn (if available)
  in the execution environment so imports work exactly like regular
  Python imports
```

**`docs/superpowers/specs/2026-11-02-data-science-imports-design.md`**
```
Document data science library imports support

- grilled decisions: expose available libraries, graceful handling of
  missing ones, backend-only change
```