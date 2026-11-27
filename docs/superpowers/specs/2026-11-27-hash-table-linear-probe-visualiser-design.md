# Hash Table (Linear Probing) visualiser — design

Mode id `hash-table-linear-probe` (DSA folder). Grilled 2026-11-27, two rounds,
every recommendation accepted. Default code: `DSA_DEFAULT_CODE['hash-table-linear-probe']`
in `src/config.js` — its demo runs every line of `LinearProbeTable`.

## Decisions

| # | Decision |
|---|----------|
| R1 Q1 | Linear probing only. The slot-row figure is kept reusable for Separate Chaining later. |
| R1 Q2 | One horizontal row of slots: index on top, `key: value` inside, empty slots dashed, rows wrap on big tables. A curved wrap arrow from the last slot back to slot 0 whenever a probe wraps. |
| R1 Q3 | Probing follows the real trace, one update per `linear_probe` iteration: **home** marker on `hash(key)` for the whole call, **probe** cursor on `position`, a colour-coded **trail** (collision red · match green · empty amber), and a "probe n of N" counter. |
| R1 Q4 | Hash strip: the key's characters with the current one highlighted, running `value` / `a` after each character, then "→ slot k". Collapses to "hash('k') = n" once `hash` returns. |
| R1 Q5 | Insert outcomes: new key (drops in, count +1) · update (value flips, "updated" tag, count unchanged) · full (all slots probed, red "Table is full!" banner). |
| R1 Q6 | Delete phases: find (probe visuals) → the slot empties and shows a gap → a cluster-scan cursor walks right → each key is lifted out, re-probed from its own home, and settles with a move arrow ("banana 8 → 6") or a "stays" tag → the scan stops at the first empty slot ("cluster ends"). |
| R1 Q7 | Rehash: the old table stays visible, dimmed, above the new one. Each re-insert crosses out its old slot and probes into the new table. The old table goes away when `rehash` returns. |
| R1 Q8 | Load-factor gauge `count / table_size` with a ½ marker; it turns red when an insert pushes past ½ (just before the rehash). |
| R1 Q9 | Plain-English caption on every step, using the shared caption style. |
| R1 Q10 | `__getitem__` / `__contains__`: probe visuals, then a result badge (value · True / False · KeyError); `__contains__` shows its inner `__getitem__`. `get_all_keys` / `get_all_values` / `__str__`: a scan cursor walks every slot while the result builds up. `is_empty` / `__len__`: the count badge pulses and the answer shows. |
| R2 Q1 | Detection by shape in `step.mem` (like Linked List): an instance with a list attribute (`array`, `table`, `slots`, `buckets`, `data`) whose filled items are all 2-tuples; count from `count` / `size` / `length` / `n`. Methods matched by name lists on frames whose `oid` is the table. A missing method simply never shows its visuals. `shortcut:` comment in the code. |
| R2 Q2 | One figure per instance, in first-appearance order, labelled with its variable name. The instance being operated on gets the overlays (hash strip, probe trail, caption); the others stay static. |
| R2 Q3 | The trail and home marker last until the operation returns, and clear when the next one starts. During a delete's re-inserts, each re-insert starts a fresh trail for its own key. |
| R2 Q4 | The hash strip reads `value` / `a` / `char` from `locals`, with fallbacks (`h` / `hash_value` / `total`, `c` / `ch`). With none of them, it shows the result only (from `hash`'s return value). |
| R2 Q5 | Keep the runner's 100-item cap: past slot 99 the row ends with a "+N more slots not recorded" cell, and a probe beyond it reads "slot n (not shown)". |
| R2 Q6 | A pure facts module (no DOM) plus a renderer. `tests/hashtable.sim.mjs` runs `runner.py` on the default code and asserts the key facts. Final check: a manual pass in the browser through `start.bat`. |
| R2 Q7 | This spec first; commits follow the Linked List sequence (spec → pane + CSS → tab wiring → mark `ready`), and only after the user's OK. |

## Ground truth used

- `step.mem` — the table instance, its slot list, and each `(key, value)` tuple (depth 4 ≤ `MEM_MAX_DEPTH`).
- `step.stack` — frames with `fn`, `args`, `oid` (the instance `self` belongs to).
- `step.locals` — the merged dict, innermost frame wins: `position` while the probe is the top frame, `value` / `a` / `char` while `hash` is.
- `step.ret` / `step.exc` — results and raised exceptions per frame id.

How each visual is derived:
- **Operation scope**: the innermost table frame whose method is an operation (insert, lookup, delete, contains, rehash, scan, len, empty). With none on the stack, the last scope that ended stays (R2 Q3). A bare `hash` / probe call from module code is its own scope.
- **Probe**: the latest probe call that started inside the scope. Its trail lists each distinct `position` in visit order, classified against the slot contents at that step.
- **Gap and moves**: slot diffs against the previous step. A delete's first probe finds the key; each later probe is a re-insert (from = the scan position, to = the probe's return value).
- **Old table during rehash**: the slots at the rehash call's first step. An old slot is crossed out once its key is in the new array.
- **Scan cursor / hash character**: the loop iteration index, counted as hits on the loop body's first line inside the call.

## Known limits

- Detection uses attribute and method names (the `shortcut:` above).
- Tables over 100 slots are cut by the tracer (R2 Q5).
- Exception messages are not traced, only their type: "Table is full!" is inferred from a `ValueError` after a full probe of an insert.
