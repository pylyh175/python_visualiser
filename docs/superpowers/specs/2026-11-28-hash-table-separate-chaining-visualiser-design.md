# Hash Table (Separate Chaining) visualiser — design

Mode id `hash-table-separate-chaining` (DSA folder). Grilled 2026-11-28, one round
(Q1–Q11), every recommendation accepted. Default code:
`DSA_DEFAULT_CODE['hash-table-separate-chaining']` in `src/config.js`. Its demo runs
every method and both sides of every branch.

## Decisions

| # | Decision |
|---|----------|
| Q1 | Textbook layout: a vertical column of slots (index + slot box), each with its chain drawn to the right. Long chains scroll sideways. |
| Q2 | Nodes reuse the Linked List box `[ key: value \| next ● ]`, with arrows between nodes and `⏚` for `None`. The slot box shows `●` with an arrow to the first node, or `None`. |
| Q3 | Shared with linear probing: the hash strip (ending at the home bucket, which is highlighted), the caption style, result badges, the legend, and one figure per instance. The shared parts live in `panels/hashShared.js`. |
| Q4 | Chain walk: gliding `current` / `previous` tags; visited nodes grey (passed, key ≠) or green (match); an amber "end of chain" marker when `current` reaches `None`; a "node n of L" counter. A miss on an empty slot flashes the slot box amber. |
| Q5 | Insert: while `Node(...)` is being built, the new node floats above the chain in green with the tag "new". On the link step, the slot's arrow swings to it, its `next` points at the old first node, and the chain shifts right. The caption explains "insert at the FRONT". Update: the value flips with an "updated" flash, and the count is unchanged. |
| Q6 | Delete: the matched node turns red and drops below the chain. Middle node → a bypass arc (`previous.next = current.next`). First node → the slot's arrow jumps to the next node. Only node → the slot reads `None`. The node fades once `__delitem__` returns. |
| Q7 | The header shows the load factor `count / table_size` as a number plus a bar that can pass 100%, with a marker at 1.0 and no red threshold. Each row ends with "len n"; the longest chain is highlighted. |
| Q8 | Scans (`get_all_keys`, `get_all_values`, `__str__`): a bucket cursor moves down the slots, an inner `current` tag walks each chain, and the result builds up. |
| Q9 | Shape-based detection in `step.mem`: an instance with a list attribute (`array`, `table`, `slots`, `buckets`, `data`) whose items are `None` or nodes with next (`next`, `link`), key (`key`, `k`) and value (`value`, `val`, `data`) attributes. Methods come from name lists. Node chains only — buckets held as Python lists are not supported. `shortcut:` comment. |
| Q10 | Tab label "Hash Table (Chaining)". |
| Q11 | Spec → shared extraction → pure facts module (`panels/chainingFacts.js`) + renderer (`panels/chaining.js`) → `tests/chaining.sim.mjs` → headless screenshots → mark `ready`. Commits only after the user's OK. |

## Ground truth used

- `step.mem` — the table instance, its slot list, and each chain of `Node` instances. Same-class `next` links cost no tracer depth, up to `MEM_MAX_LINKED` (100).
- `mem.roots` — method locals pointing at nodes (`current`, `previous`, `head`, and `self` inside `Node.__init__`). These give the pointer tags, the new node and the removed node.
- `step.stack`, `step.ret`, `step.exc` — the operation scope, the hash call and its result, return values and exceptions (same bookkeeping as linear probing).

How each visual is derived:
- **A node not in any chain but held by a local** is drawn detached. Inside an insert it is the new node (floats above); inside a delete it is the removed node (drops below). It is placed before the node its `next` points to.
- **Changed links** come from `next` and slot-head diffs against the previous step: green for a new link, amber when the link skips a node.
- **The walk** comes from the `current` root in the operation's own frame, after its hash call returned: each distinct node visited, classified against the key. `current` being `None` in that frame means the end of the chain.

## Known limits

- Detection uses attribute, method and local names (the `shortcut:` above).
- Tables over 100 slots and chains over 100 nodes are cut by the tracer.
- Python lists used as buckets are not drawn (Q9).
