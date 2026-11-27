# Binary Search Tree visualiser — design

Mode id `binary-search-tree` (DSA folder). Grilled 2026-11-29 in two rounds (Q1–Q14); every recommendation was accepted.

- **Default code:** `DSA_DEFAULT_CODE['binary-search-tree']` in `src/config.js`. Its demo runs insert (including a duplicate), search (hits and a miss), `in`, min, max, successor, all three delete cases (leaf, one child, two children), a delete miss, `height` and `in_order`.
- **Look:** the Recursion tab's look (SVG nodes, gliding, grow-from-parent, values travelling up edges), applied to the *data* tree.

## Decisions

| # | Decision |
|---|----------|
| Q1 | Tabs `Output \| Binary Search Tree`. The new tab draws the BSTNode tree, with a call-stack column of the live recursive frames beside it, e.g. `insert_aux(current=40, key=35)`. There is no Recursion tab in this mode. |
| Q2 | In-order layout: x is the node's rank in sorted order and y is its depth. A left child is always left of its parent, and reading left to right gives `in_order()`. Nodes glide when the tree changes. The tree zooms to fit (like the Recursion tree) and scrolls sideways when wide. |
| Q3 | A node is a pill showing the key large and the item small. Edges run parent → child, and a `root` tag marks the root. Empty child links are drawn only while code is at them (Q4). |
| Q4 | Going down: a gliding `current` tag; the path (one node per live frame) and the edges along it are highlighted; the caption shows the comparison (`35 < 50 → go left`). When `current` is `None`, a dashed ghost slot appears where the missing child would be. It turns red for a search or delete miss (`KeyError`), and the new node grows out of it on insert. A duplicate insert flashes the equal node red (`ValueError`). |
| Q5 | Coming back up: every return travels up its edge as a chip. The caption says whether the parent's link stays the same (muted wording) or changes (highlighted), e.g. `returns 65 → 70.left becomes 65`. Links that changed in a step glow. |
| Q6 | Delete cases get a badge once the key is found. **Case 1 (leaf):** the node drops and fades. **Case 2 (one child):** the child subtree glides up into its place. **Case 3 (two children):** the successor walk (right once, then left) is shown; the successor's key flies into the node; a sub-badge reads "now delete … from the right subtree", and that delete plays out as case 1 or case 2. |
| Q7 | `get_minimal` / `get_maximal` / `get_successor`: walk path, `current` tag, and a green ring on the answer. `height`: a badge fills in each node's computed height as its call returns. `in_order`: visit numbers on the nodes, a `result` strip under the tree, and a `left → node → right` caption. |
| Q8 | The header shows the operation (`insert(35, 'H')`) and the counters `size`, `height` (of the live tree) and `visited` (nodes the operation has visited so far). |
| Q9 | Shape-based detection. The tree is an instance with a `root` attribute that is `None` or a node. A node is an instance with `left` / `right` attributes plus a key (`key`, `k`, `val`, `value`, `data`) and an item (`item`, `value`, `data`, `val`). When there are several trees, the one the current method runs on is shown, else the first. The no-tree note reads: "No Binary Search Tree found — needs a class with root and nodes with left/right." Method kinds come from name lists. `shortcut:` comment. |
| Q10 | Spec → pure facts module (`panels/bstFacts.js`) + renderer (`panels/bst.js`) → `tests/bst.sim.mjs` → headless screenshots → mark `ready`. Commits only after the user's OK. |
| Q11 | Between operations (steps in `__main__`), the tree stays without path, tags or ghost. The last operation's badge is dimmed (`last: …`) and the caption shows its result. |
| Q12 | `visited` counts recursive calls on a real node within the operation; for delete case 3 that includes the successor walk and the second delete. |
| Q13 | Nodes are not clickable. |
| Q14 | Narrow pane: the call stack moves below the tree. The tree zooms to fit down to a readable minimum, then scrolls. Reduced motion means no gliding (`animMs()` = 0). |

## Ground truth used

- `step.mem`: the tree instance and every node. `left` / `right` are same-class links, so they cost no tracer depth and the whole tree is recorded, up to `MEM_MAX_LINKED` (100).
- **`step.stack`, `step.ret`, `step.exc`:** calls on the tree (`oid` = the tree instance).
  - **A frame's node:** the node-valued argument (`current`), read from `mem.roots` while that frame is innermost. This gives each frame on the stack its node, which is the path, and survives the case-3 key copy because identity is by object id.
  - **Return values:** a returned node is resolved by its key, preferring the frame's own node, then its children.
- **Which side a `None` child is on:** the key argument compared with the parent frame's key; `get_minimal` → left and `get_maximal` → right; otherwise sibling order (left call first).
- **A node held by a local but not in the tree** is the node being inserted. It is drawn in the ghost slot.
- **Changed links:** diffs of `left` / `right` / `root` against the previous step.
- **The case-3 copy:** a node whose key changed to the key of another live node.

## Known limits

- Detection uses attribute, method and local names (the `shortcut:` above).
- Trees over 100 nodes are cut by the tracer.
- Return-value nodes are matched by key, so keys must be unique, which a BST guarantees.
