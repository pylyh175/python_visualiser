/* ═══════════════ Hash Table (Separate Chaining) pane (2026-11-28 design) ═══════════════
   Draws the view model of panels/chainingFacts.js, one figure per table:
   - a vertical column of buckets (index · slot box ● / None), each with its
     chain drawn to the right as Linked List boxes [ key: value | ● ] (Q1–Q2),
     "len n" at the row end, the longest chain highlighted (Q7);
   - SVG arrows slot → first node → … recomputed from live geometry; links
     changed this step glow (green new, amber bypass);
   - the new node floats above its chain, an unlinked node drops below (Q5–Q6);
   - gliding pointer tags for the method locals (current / previous / head /
     next / new) and `current = None` at the chain's end (Q4);
   - the shared hash strip, load-factor bar (passes 100%, marker at 1.0),
     caption, badges and legend (Q3, Q7).
   Nodes are reconciled by key (pointerKit.syncCells) so the raise / drop /
   shift transitions run between steps. */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { syncCells, setCaption, setLegend, showMessage, flash, animMs } from './pointerKit.js';
import { hideOutTabsAll } from './shared.js';
import { analyse, frameAt, tableFound, py, bare } from './chainingFacts.js';
import { hashHtml } from './hashShared.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

let cache = { steps: null, facts: null };
function facts() {
  if (cache.steps !== state.steps) cache = { steps: state.steps, facts: analyse(state.steps) };
  return cache.facts;
}

export function hchainFound() {
  return state.steps.length > 0 && tableFound(facts());
}

function ensureView(body) {
  const old = body._hcView;
  if (old && body.contains(old.figs)) return old;
  body.innerHTML = `
    <div class="tp-strip ht-strip"></div>
    <div class="tp-caption" aria-live="polite"></div>
    <div class="ht-hash" hidden></div>
    <div class="ht-figs"></div>
    <div class="tp-legend"></div>`;
  const q = (sel) => body.querySelector(sel);
  const v = {
    body, strip: q('.ht-strip'), caption: q('.tp-caption'), hash: q('.ht-hash'),
    figs: q('.ht-figs'), legend: q('.tp-legend'), figEls: new Map(),
    lastStep: -1, stepsRef: null, legendHtml: null, raf: 0,
  };
  body._hcView = v;
  return v;
}

function figureEl(v, oid) {
  let f = v.figEls.get(oid);
  if (f && v.figs.contains(f.root)) return f;
  const root = document.createElement('div');
  root.className = 'ht-fig hc-fig';
  root.innerHTML = '<div class="ht-fig-head"></div><div class="hc-stage"><div class="hc-grid"></div><div class="hc-tags"></div></div>';
  v.figs.appendChild(root);
  const stage = root.querySelector('.hc-stage');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'hc-arrows');
  stage.insertBefore(svg, stage.firstChild);
  f = {
    root, head: root.querySelector('.ht-fig-head'), stage, grid: root.querySelector('.hc-grid'),
    tags: root.querySelector('.hc-tags'), svg, rows: new Map(), tagEls: new Map(), links: [],
  };
  if (typeof ResizeObserver !== 'undefined') {
    f.ro = new ResizeObserver(() => { drawArrows(f); placeTags(f, f.lastTags || [], false); });
    f.ro.observe(stage);
  }
  v.figEls.set(oid, f);
  return f;
}

function rowEl(f, k) {
  let r = f.rows.get(k);
  if (r && f.grid.contains(r.root)) return r;
  const root = document.createElement('div');
  root.className = 'hc-row';
  root.innerHTML = `<span class="hc-idx">${k}</span><div class="hc-slot" data-key="s${k}"></div><div class="hc-chain"></div><span class="hc-len"></span>`;
  r = { root, slot: root.querySelector('.hc-slot'), chain: root.querySelector('.hc-chain'), len: root.querySelector('.hc-len') };
  f.rows.set(k, r);
  return r;
}

function headHtml(fig, t, out) {
  const lf = t.count / t.size;
  const scale = Math.max(2, lf);
  const pct = Math.round((lf / scale) * 100);
  const one = Math.round((1 / scale) * 100);
  let badge = '';
  if (fig.active && out.badge) badge = `<span class="tp-badge ${out.badge.kind === 'err' ? 'ht-badge-err' : 'tp-badge-good'}">${escapeHtml(out.badge.text)}</span>`;
  else if (fig.active && out.scanInfo && !out.scanInfo.finished && out.scanInfo.result !== undefined) badge = `<span class="tp-badge">result so far ${escapeHtml(py(out.scanInfo.result, 48))}</span>`;
  const pulse = fig.active && out.scope && ['len', 'empty', 'load'].includes(out.scope.kind);
  return `
    <span class="ht-name">${escapeHtml(fig.name)}</span>
    <span class="ht-meta">${t.size} buckets</span>
    <span class="ht-meta ht-count${pulse ? ' ht-pulse' : ''}">${escapeHtml(t.countName || 'keys')} ${t.count}</span>
    <span class="ht-load hc-load${lf > 1 ? ' hc-over-one' : ''}" title="load factor = keys / buckets — chaining lets it pass 1">
      <span class="ht-load-bar hc-load-bar"><i style="width:${pct}%"></i><b style="left:${one}%"></b></span>load ${t.count}/${t.size} = ${lf.toFixed(2)}
    </span>
    ${badge}`;
}

// Arrows between drawn boxes, from live geometry (also mid-transition).
function drawArrows(f) {
  const svg = f.svg;
  const base = f.stage.getBoundingClientRect();
  if (!base.width) return;
  svg.setAttribute('width', f.stage.scrollWidth);
  svg.setAttribute('height', f.stage.scrollHeight);
  let html = '';
  for (const lk of f.links) {
    const from = f.stage.querySelector(`[data-key="${lk.from}"]`);
    const to = f.stage.querySelector(`[data-key="${lk.to}"]`);
    if (!from || !to) continue;
    const dot = from.querySelector('.ll-next') || from;
    const a = dot.getBoundingClientRect(), b = to.getBoundingClientRect();
    const x1 = lk.from[0] === 's' ? a.right - base.left - 4 : a.left + a.width / 2 - base.left;
    const y1 = a.top + a.height / 2 - base.top;
    const x2 = b.left - base.left - 1, y2 = b.top + b.height / 2 - base.top;
    let d;
    if (lk.skip) {
      const top = Math.min(a.top, b.top) - base.top - 18;
      d = `M${x1} ${y1} C${x1 + 10} ${top} ${x2 - 16} ${top} ${x2} ${y2}`;
    } else d = `M${x1} ${y1} L${x2} ${y2}`;
    const cls = lk.cls ? ` ${lk.cls}` : '';
    html += `<path class="ll-arrow${cls}" d="${d}" marker-end="url(#hcHead${lk.cls ? '-' + lk.cls : ''})"/>`;
  }
  const defs = ['', 'll-arrow-new', 'll-arrow-bypass', 'hc-arrow-gone'].map((c) => `<marker id="hcHead${c ? '-' + c : ''}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ll-head${c ? ' ' + c : ''}" d="M0 0L10 5L0 10z"/></marker>`).join('');
  const full = `<defs>${defs}</defs>${html}`;
  if (svg._html !== full) { svg.innerHTML = full; svg._html = full; }
}

// Gliding tags under their target box; several on one box stack downward.
function placeTags(f, tags, animate) {
  f.lastTags = tags;
  const base = f.stage.getBoundingClientRect();
  if (!base.width) return;
  const seen = new Set();
  const per = new Map();
  for (const t of tags) {
    let el = f.tagEls.get(t.name);
    const isNew = !el;
    if (isNew) {
      el = document.createElement('div');
      el.className = 'hc-tag';
      el.innerHTML = '<span class="hc-tag-arrow">▲</span><span class="hc-tag-name"></span>';
      f.tags.appendChild(el);
      f.tagEls.set(t.name, el);
    }
    seen.add(t.name);
    el.querySelector('.hc-tag-name').textContent = t.name;
    el.dataset.role = t.name.startsWith('current') ? 'current' : t.name === 'previous' || t.name === 'prev' ? 'previous' : t.name === 'new' ? 'new' : 'other';
    const target = f.stage.querySelector(`[data-key="${t.target}"]`);
    if (!target) { el.hidden = true; continue; }
    const r = target.getBoundingClientRect();
    const row = per.get(t.target) || 0;
    per.set(t.target, row + 1);
    const x = r.left + r.width / 2 - base.left;
    const y = r.bottom - base.top + 1 + row * 12;
    const jump = !animate || isNew || el.hidden;
    el.hidden = false;
    el.classList.toggle('hc-tag-stacked', row > 0);
    if (jump) el.style.transition = 'none';
    el.style.transform = `translate(${x}px, ${y}px) translateX(-50%)`;
    if (jump) { void el.offsetWidth; el.style.transition = ''; }
  }
  for (const [name, el] of f.tagEls) if (!seen.has(name)) { el.remove(); f.tagEls.delete(name); }
}

const nodeHtml = (n) => {
  const key = n.hasKey === false ? '…' : escapeHtml(bare(n.key, 8));
  const val = n.hasValue === false ? '…' : escapeHtml(bare(n.value, 6));
  const nx = n.hasNext === false ? '…' : n.next === null ? '⏚' : '●';
  return `<span class="ll-data"><span class="hc-k">${key}</span><span class="hc-v">${val}</span></span><span class="ll-next">${nx}</span>`;
};

export function renderHChainPanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const F = facts();
  const first = F.tables.length ? F.tables[0].first : -1;
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabHChain.hidden = false;
  if (!state.userTab && !state.hchainAnnounced && first >= 0 && state.idx >= first) {
    state.hchainAnnounced = true;
    state.outTab = 'hchain';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabHChain.classList.toggle('active', state.outTab === 'hchain');
  els.output.hidden = state.outTab !== 'out';
  els.hchainBody.hidden = state.outTab !== 'hchain';
  if (state.outTab !== 'hchain') return;

  const body = els.hchainBody;
  if (first < 0 || state.idx < first) {
    if (body._hcView) { for (const f of body._hcView.figEls.values()) if (f.ro) f.ro.disconnect(); body._hcView = null; }
    showMessage(body, first < 0
      ? 'No chained Hash Table found — needs a class whose array holds None or the first Node (key, value, next) of a chain.'
      : 'The table has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const v = ensureView(body);
  const sameRun = v.stepsRef === state.steps;
  const newStep = !sameRun || state.idx !== v.lastStep;
  v.stepsRef = state.steps;
  v.lastStep = state.idx;
  const ms = animMs();
  body.style.setProperty('--tp-anim', `${ms}ms`);

  const out = frameAt(F, state.idx);
  const act = out.figures.find((f) => f.active);
  const sc = out.scope;

  const cls = (act && act.table && act.table.cls) || (out.figures[0] && out.figures[0].table && out.figures[0].table.cls) || 'table';
  const opArgs = sc ? Object.entries(sc.args).filter(([k]) => k !== 'self').map(([, x]) => py(x, 14)).join(', ') : '';
  const wk = out.walk;
  const L = wk ? wk.len : 0;
  const walkTxt = wk && wk.live && wk.visited.length && !wk.end ? `node ${wk.visited.length} of ${Math.max(L, wk.visited.length)}` : wk && wk.live && wk.end ? 'end of chain' : '';
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(cls)}</span>
    ${sc ? `<span class="tp-ptr">${out.live ? '' : '<span class="tp-cap-muted">last: </span>'}${escapeHtml(act ? act.name : '')}.${escapeHtml(sc.fn)}(${escapeHtml(opArgs)})</span>` : ''}
    ${wk && wk.home !== null && out.live ? `<span class="tp-badge">bucket ${wk.home}</span>` : ''}
    ${walkTxt ? `<span class="tp-badge tp-badge-warn">${escapeHtml(walkTxt)}</span>` : ''}`;
  setCaption(v, out.caption);
  v.hash.hidden = !out.hash;
  const hh = hashHtml(out.hash, act && act.table ? act.table.size : 0, 'bucket');
  if (v.hash._html !== hh) { v.hash.innerHTML = hh; v.hash._html = hh; }

  const keep = new Set(out.figures.map((f) => f.oid));
  for (const [oid, f] of v.figEls) if (!keep.has(oid)) { if (f.ro) f.ro.disconnect(); f.root.remove(); v.figEls.delete(oid); }
  const drawn = [];
  for (const fig of out.figures) {
    const t = fig.table;
    const f = figureEl(v, fig.oid);
    v.figs.appendChild(f.root);
    if (!t) continue;
    f.root.className = `ht-fig hc-fig${fig.active ? ' ht-active' : ''}`;
    const hh2 = headHtml(fig, t, out);
    if (f.head._html !== hh2) { f.head.innerHTML = hh2; f.head._html = hh2; }

    // Rows: chain nodes plus detached nodes placed before the node they link to.
    const links = [];
    for (const [k, r] of f.rows) if (k >= t.buckets.length) { r.root.remove(); f.rows.delete(k); }
    t.buckets.forEach((b, k) => {
      const r = rowEl(f, k);
      f.grid.appendChild(r.root);
      const items = b.nodes.map((n) => ({ ...n, role: null }));
      for (const d of fig.detached.filter((x) => x.bucket === k)) {
        const at = d.next !== null ? items.findIndex((x) => x.oid === d.next) : (d.role === 'new' ? 0 : -1);
        items.splice(at < 0 ? items.length : at, 0, d);
      }
      const lift = fig.detached.some((d) => d.bucket === k && d.role === 'new');
      const drop = fig.detached.some((d) => d.bucket === k && d.role === 'removed');
      r.root.className = `hc-row${fig.active && fig.home === k ? ' hc-home' : ''}${fig.active && fig.scanBucket === k ? ' hc-scan' : ''}${lift ? ' hc-lift' : ''}${drop ? ' hc-drop' : ''}`;
      const slotTxt = b.head === null ? 'None' : '●';
      if (r.slot.textContent !== slotTxt) r.slot.textContent = slotTxt;
      r.slot.classList.toggle('hc-slot-empty', b.head === null);
      const specs = items.map((n) => {
        const c = ['tp-cell', 'll-node', 'hc-node'];
        if (n.role === 'new') c.push('ll-new');
        else if (n.role === 'removed') c.push('ll-removed');
        else if (fig.active && fig.marks.has(n.oid)) c.push(fig.marks.get(n.oid) === 'match' ? 'hc-match' : 'hc-passed');
        return {
          key: `n${n.oid}`, idx: null, cls: c.join(' '), html: nodeHtml(n),
          title: `${t.shape ? t.shape.cls : 'Node'}(${py(n.key)}, ${py(n.value)}) · next → ${n.next === null ? 'None' : 'node'}`,
        };
      });
      const nilOn = fig.active && fig.tags.some((tg) => tg.target === `nil${k}`);
      specs.push({ key: `nil${k}`, idx: null, cls: `hc-nil${nilOn ? ' hc-nil-on' : ''}`, text: 'None' });
      if (b.cut) specs.push({ key: `more${k}`, idx: null, cls: 'hc-more', text: `+${b.cut} more` });
      const cells = syncCells(r.chain, specs);
      const lenTxt = `len ${b.nodes.length}`;
      if (r.len.textContent !== lenTxt) r.len.textContent = lenTxt;
      r.len.classList.toggle('hc-longest', fig.longest > 1 && b.nodes.length === fig.longest);
      if (newStep) {
        const fs = fig.flashSlot.get(k);
        if (fs) flash(r.slot, fs);
        items.forEach((n, j) => { const fn = fig.flashNode.get(n.oid); if (fn) flash(cells[j], fn); });
      }
      // Links: slot → first chain node; every drawn node → its next.
      const pos = new Map(items.map((n, j) => [n.oid, j]));
      const linkCls = (key, removedFrom) => {
        const c = fig.active ? fig.links.get(key) : null;
        return c === 'new' ? 'll-arrow-new' : c === 'bypass' ? 'll-arrow-bypass' : removedFrom ? 'hc-arrow-gone' : '';
      };
      if (b.head !== null && pos.has(b.head)) links.push({ from: `s${k}`, to: `n${b.head}`, skip: pos.get(b.head) > 0, cls: linkCls(`s${k}`) });
      for (const n of items) {
        if (n.next === null || !pos.has(n.next)) continue;
        links.push({ from: `n${n.oid}`, to: `n${n.next}`, skip: pos.get(n.next) > pos.get(n.oid) + 1, cls: linkCls(`n${n.oid}`, n.role === 'removed') });
      }
    });
    f.links = links;
    drawn.push({ f, tags: fig.active ? fig.tags : [] });
  }

  // Arrows and tags follow the boxes while they settle.
  const end = performance.now() + (newStep ? ms : 0) + 60;
  const tick = () => {
    for (const { f } of drawn) drawArrows(f);
    if (performance.now() < end) v.raf = requestAnimationFrame(tick);
  };
  if (v.raf) cancelAnimationFrame(v.raf);
  for (const { f, tags } of drawn) placeTags(f, tags, newStep);
  tick();
  if (newStep && ms) setTimeout(() => { for (const { f, tags } of drawn) placeTags(f, tags, false); }, ms + 30);

  setLegend(v, [
    ['hc-sw-home', 'home bucket = hash(key)'],
    ['hc-sw-passed', 'walked past (key ≠)'],
    ['hc-sw-match', 'key found'],
    ['ll-sw-new', 'new node (insert at front)'],
    ['ll-sw-removed', 'unlinked (delete)'],
    ['ll-sw-arrow', 'link changed this step'],
    ['hc-sw-scan', 'scan bucket'],
  ]);

  // Keep the active row / node in view.
  if (act && newStep) {
    const f = v.figEls.get(act.oid);
    const k = act.scanBucket ?? act.home;
    const row = f && k !== null && k !== undefined ? f.rows.get(k) : null;
    if (row) {
      const b = body.getBoundingClientRect(), r = row.root.getBoundingClientRect();
      if (r.top < b.top + 10 || r.bottom > b.bottom - 10) body.scrollTop += r.top - b.top - b.height / 3;
    }
  }
}
