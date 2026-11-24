/* ═══════════════ Recursion tree layout (pure — no DOM) ═══════════════
   Compact tidy layout for the graphical recursion tree (2026-11-24 design).
   Children are laid out left → right in call order, each parent centred
   over its first and last child; a per-depth "next free x" contour stops
   subtrees from overlapping (a subtree that would collide is shifted right
   as a whole). Node widths vary with their labels. O(n²) worst case for
   the shifts — fine for the graph view's node cap. */

// nodes: [{ id, parent, w }] in call order (a parent always precedes its
// children). Returns { pos: Map(id → { x, y, depth }), width, height }
// with x = node centre and y = top of the node's row.
export function layoutTree(nodes, { gapX = 12, levelH = 60 } = {}) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = new Map();
    const roots = [];
    for (const n of nodes) {
        if (n.parent == null || !byId.has(n.parent)) { roots.push(n); continue; }
        const list = kids.get(n.parent);
        if (list) list.push(n); else kids.set(n.parent, [n]);
    }
    const pos = new Map();
    const nextX = [];
    const free = (d) => nextX[d] ?? 0;

    const shift = (n, dx) => {
        for (const c of kids.get(n.id) || []) {
            pos.get(c.id).x += dx;
            shift(c, dx);
        }
    };

    // Returns the deepest depth reached inside n's subtree.
    const place = (n, depth) => {
        const ch = kids.get(n.id) || [];
        let maxD = depth;
        for (const c of ch) maxD = Math.max(maxD, place(c, depth + 1));
        let x = ch.length
            ? (pos.get(ch[0].id).x + pos.get(ch[ch.length - 1].id).x) / 2
            : free(depth) + n.w / 2;
        const need = free(depth) - (x - n.w / 2);
        if (need > 0) {
            shift(n, need);
            x += need;
            for (let d = depth + 1; d <= maxD; d++) nextX[d] = free(d) + need;
        }
        pos.set(n.id, { x, y: depth * levelH, depth });
        nextX[depth] = x + n.w / 2 + gapX;
        return maxD;
    };

    let maxDepth = 0;
    for (const r of roots) {
        // Each extra root (a forest only happens when the call cap cut a chain)
        // starts right of everything drawn so far.
        const startX = Math.max(0, ...nextX.filter((x) => x != null));
        for (let d = 0; d < nextX.length; d++) nextX[d] = Math.max(free(d), startX);
        maxDepth = Math.max(maxDepth, place(r, 0));
    }
    let width = 0;
    for (const n of nodes) {
        const p = pos.get(n.id);
        if (p) width = Math.max(width, p.x + n.w / 2);
    }
    return { pos, width, height: (maxDepth + 1) * levelH };
}