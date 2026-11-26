# Linked List visualiser (DSA > Linked List)

Date: 2026-11-26 (grilled Q1–Q12)

## Decisions

| Q | Decision |
|---|----------|
| Q1 | Each node is a box `[ data \| next ● ]` with an SVG arrow to the node it links to; a `None` next reads `⏚`. |
| Q2 | Layout follows `next` from `head`. A node held by a local but not in the chain floats ABOVE (green, "new — not linked yet") if it was never in the chain, or drops BELOW (red, "unlinked") if it was. Detached nodes sit just before the node their `next` points to, else at the end. |
| Q3 | `head` / `tail` are gliding tags (pointer kit); an empty list shows a dashed `None` cell they point at. |
| Q4 | Method locals pointing at nodes (`current`, `previous`, `new_node`, `removed`, a constructor's `self`) are tags too, so `get_node_at_index` visibly walks. |
| Q5 | Insert: arrows changed on this step glow green, one per step (`new_node.next = …`, then `previous.next = new_node`). |
| Q6 | Delete: the changed arrow that jumps over a node is the amber bypass arc; the red node keeps its slot below until its local is gone. |
| Q7 | Captions in code terms: `previous.next = new_node (node(10) → node(15))`, `head = …`, `tail = …`, `length 5 → 6`, `current = current.next → node(20)`, `new Node(15) → self`, returns (a returned node reads `node(10)`), exceptions. |
| Q8 | Runner: a link to an instance of the SAME class costs no depth, so whole chains are recorded; `MEM_MAX_LINKED = 100` nodes per step, beyond that the link is `{"more": n}` (a `+n` cell). |
| Q9 | Index labels `0, 1, 2…` from chain position. |
| Q10 | One row, horizontally scrolled; the pane scrolls to the active node. |
| Q11 | Detection by names: list = instance whose `head\|first\|front` points at a node; node = instance with `next\|link` to its own class and `data\|item\|value\|val`. `tail\|rear\|last` and `length\|size\|count\|n` optional. One list per run. |
| Q12 | Singly linked only. |

## Runner fixes shipped with this

- `__viz_mem_node` marks a node emitted BEFORE walking its children (the
  comment already said so); without the depth cost a cyclic chain would
  otherwise recurse forever.
- Trailing comments no longer hide a code line's step: only comment-only
  lines are skipped (`x = 1  # why` used to record no step at all — the
  insert's two rewiring lines and the queues' `% len` lines were invisible).

## Wiring

`#tabLList` / `#llistBody`, `state.llistAnnounced`, output.js family
`linked-list`, mode `status: 'ready'`, Output-tab note when no list is found.
