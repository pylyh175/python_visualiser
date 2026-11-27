/* ═══════════════ Hash Table (Linear Probing) pane (2026-11-27 design) ═══════════════
   Draws the view model of panels/hashtableFacts.js, one figure per table
   instance (R2 Q2):
   - a row of slots (index on top, `key / value` inside, empty = dashed) that
     wraps on wide tables, with a load gauge (count / size, ½ marker);
   - the active table's probe: home slot, probe cursor, colour-coded trail
     (collision red · match green · free amber), "probe n of N", and a wrap
     arrow from the last slot back to slot 0;
   - the hash strip (characters, running value / a, → slot);
   - delete: gap, cluster-scan cursor, the lifted key, move chips + a flight
     from the old slot to the new one;
   - rehash: the old table dimmed above the new one, re-inserted keys
     crossed out, each landing flown in from its old slot.
   Cells are reconciled by key (pointerKit.syncCells) so CSS transitions run
   between steps; flights only play on a single step forward. */

import { state } from '../state.js';
import { els } from '../dom.js';
import { escapeHtml } from '../utils.js';
import { syncCells, setCaption, setLegend, showMessage, flash, animMs } from './pointerKit.js';
import { hideOutTabsAll } from './shared.js';
import { analyse, frameAt, tableFound, py, bare } from './hashtableFacts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_CLS = { collision: 'ht-col', match: 'ht-match', empty: 'ht-free', hidden: '' };

let cache = { steps: null, facts: null };
function facts() {
  if (cache.steps !== state.steps) cache = { steps: state.steps, facts: analyse(state.steps) };
  return cache.facts;
}

export function htableFound() {
  return state.steps.length > 0 && tableFound(facts());
}

function ensureView(body) {
  const old = body._htView;
  if (old && body.contains(old.figs)) return old;
  body.innerHTML = `
    <div class="tp-strip ht-strip"></div>
    <div class="tp-caption" aria-live="polite"></div>
    <div class="ht-hash" hidden></div>
    <div class="ht-banner" hidden></div>
    <div class="ht-figs"></div>
    <div class="tp-legend"></div>`;
  const q = (sel) => body.querySelector(sel);
  const v = {
    body, strip: q('.ht-strip'), caption: q('.tp-caption'), hash: q('.ht-hash'),
    banner: q('.ht-banner'), figs: q('.ht-figs'), legend: q('.tp-legend'),
    figEls: new Map(), lastStep: -1, stepsRef: null, legendHtml: null, flights: [],
  };
  body._htView = v;
  return v;
}

function figureEl(v, oid) {
  let f = v.figEls.get(oid);
  if (f && v.figs.contains(f.root)) return f;
  const root = document.createElement('div');
  root.className = 'ht-fig';
  root.innerHTML = `
    <div class="ht-fig-head"></div>
    <div class="ht-old" hidden><div class="ht-old-label"></div><div class="tp-array ht-row ht-old-row"></div></div>
    <div class="ht-track"><div class="tp-array ht-row ht-new-row"></div></div>
    <div class="ht-moves"></div>`;
  v.figs.appendChild(root);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ht-wrap-svg');
  root.querySelector('.ht-track').appendChild(svg);
  f = {
    root, head: root.querySelector('.ht-fig-head'), old: root.querySelector('.ht-old'),
    oldLabel: root.querySelector('.ht-old-label'), oldRow: root.querySelector('.ht-old-row'),
    track: root.querySelector('.ht-track'), row: root.querySelector('.ht-new-row'),
    moves: root.querySelector('.ht-moves'), svg,
  };
  v.figEls.set(oid, f);
  return f;
}

const slotHtml = (s) => (s ? `<span class="ht-k">${escapeHtml(bare(s.key))}</span><span class="ht-v">${escapeHtml(bare(s.value, 8))}</span>` : '');
const tag = (cls, text) => `<span class="ht-tag ${cls}">${escapeHtml(text)}</span>`;

function cellSpecs(fig, t, withOverlays) {
  const specs = t.slots.map((s, k) => {
    const cls = ['tp-cell', 'ht-slot', s ? 'ht-filled' : 'ht-empty'];
    const tags = [];
    let html = slotHtml(s);
    if (withOverlays) {
      const mark = fig.marks.get(k);
      if (mark && MARK_CLS[mark]) cls.push(MARK_CLS[mark]);
      if (fig.home === k) { cls.push('ht-home'); tags.push(tag('ht-tag-home', 'home')); }
      if (fig.cursor === k) { cls.push('ht-cursor'); tags.push(tag('ht-tag-probe', 'probe')); }
      if (fig.scan === k) { cls.push('ht-scan'); tags.push(tag('ht-tag-scan', 'scan')); }
      if (fig.gap === k) { cls.push('ht-gap'); tags.push(tag('ht-tag-gap', 'gap')); }
      if (fig.ghost && fig.ghost.slot === k && !s) {
        cls.push('ht-lifted');
        html = `<span class="ht-k">${escapeHtml(bare(fig.ghost.key))}</span><span class="ht-v">↑ lifted</span>`;
      }
    }
    return {
      key: `s${k}`, idx: k, cls: cls.join(' '),
      html: html + (tags.length ? `<span class="ht-tags">${tags.join('')}</span>` : ''),
      title: s ? `slot ${k}: (${py(s.key)}, ${py(s.value)})` : `slot ${k}: empty (None)`,
    };
  });
  if (t.more) specs.push({ key: 'more', idx: null, cls: 'tp-cell ht-more', text: `+${t.more} more`, title: `${t.more} more slots not recorded — the tracer keeps the first 100` });
  return specs;
}

function headHtml(fig, t, out) {
  const over = t.count > t.size / 2;
  const pct = Math.min(100, Math.round((t.count / t.size) * 100));
  let badge = '';
  if (fig.active && out.badge) badge = `<span class="tp-badge ${out.badge.kind === 'err' ? 'ht-badge-err' : 'tp-badge-good'}">${escapeHtml(out.badge.text)}</span>`;
  else if (fig.active && out.scanInfo && !out.scanInfo.finished && out.scanInfo.result !== undefined) badge = `<span class="tp-badge">result so far ${escapeHtml(py(out.scanInfo.result, 48))}</span>`;
  return `
    <span class="ht-name">${escapeHtml(fig.name)}</span>
    <span class="ht-meta">${t.size} slots</span>
    <span class="ht-meta ht-count${fig.active && out.scope && (out.scope.kind === 'len' || out.scope.kind === 'empty') ? ' ht-pulse' : ''}">${escapeHtml(t.countName || 'filled')} ${t.count}</span>
    <span class="ht-load${over ? ' ht-over' : ''}" title="load factor ${t.count}/${t.size} — rehash once it passes ½">
      <span class="ht-load-bar"><i style="width:${pct}%"></i><b></b></span>${t.count}/${t.size}${over ? ' &gt; ½' : ''}
    </span>
    ${badge}`;
}

// Curved arrow under the row: last slot → slot 0, while a probe wrapped.
function drawWrap(f, fig, t) {
  const svg = f.svg;
  const a = f.row.querySelector(`[data-idx="${t.slots.length - 1}"]`);
  const b = f.row.querySelector('[data-idx="0"]');
  if (b) delete b.dataset.wrapFrom;
  if (!fig.wrapped || !fig.active) { if (svg._d) { svg.innerHTML = ''; svg._d = ''; } return; }
  const base = f.track.getBoundingClientRect();
  if (!a || !b || !base.width) return;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  if (Math.abs(ra.top - rb.top) > 4) {   // rows wrapped: no arc, a ↪ note on slot 0 instead
    b.dataset.wrapFrom = String(t.slots.length - 1);
    svg.innerHTML = ''; svg._d = '';
    return;
  }
  const x1 = ra.left + ra.width / 2 - base.left, x2 = rb.left + rb.width / 2 - base.left;
  const y = ra.bottom - base.top + 30, low = y + 20;
  const d = `M${x1} ${y} C${x1} ${low} ${x2} ${low} ${x2} ${y}`;
  svg.setAttribute('width', f.track.scrollWidth);
  svg.setAttribute('height', f.track.scrollHeight + 30);
  const html = `<defs><marker id="htWrapHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ht-wrap-head"/></marker></defs>
    <path d="${d}" class="ht-wrap${fig.wrapNow ? ' ht-wrap-now' : ''}" marker-end="url(#htWrapHead)"/>
    <text x="${(x1 + x2) / 2}" y="${low + 2}" class="ht-wrap-label">wrap ↩ ${t.slots.length - 1} → 0</text>`;
  if (svg._d !== html) { svg.innerHTML = html; svg._d = html; }
}

// A copy of `text` flies from one cell to another (lifted key → new slot,
// old table → new table).
function fly(v, fromEl, toEl, text, ms) {
  if (!ms || !fromEl || !toEl || typeof Element.prototype.animate !== 'function') return;
  const base = v.body.getBoundingClientRect();
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const ghost = document.createElement('div');
  ghost.className = 'tp-fly ht-fly';
  ghost.textContent = text;
  ghost.style.left = `${a.left - base.left + v.body.scrollLeft}px`;
  ghost.style.top = `${a.top - base.top + v.body.scrollTop}px`;
  ghost.style.width = `${a.width}px`;
  ghost.style.height = `${a.height}px`;
  v.body.appendChild(ghost);
  toEl.classList.add('tp-landing');
  const dx = b.left - a.left, dy = b.top - a.top;
  const anim = ghost.animate([
    { transform: 'translate(0, 0)' },
    { transform: `translate(${dx / 2}px, ${dy / 2 - 26}px)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px)` },
  ], { duration: Math.round(ms * 1.6), easing: 'ease-in-out' });
  const done = () => { ghost.remove(); toEl.classList.remove('tp-landing'); };
  anim.onfinish = done;
  anim.oncancel = done;
  v.flights.push(anim);
}

function hashHtml(hs, size) {
  if (!hs) return '';
  const title = `hash(${escapeHtml(py(hs.key, 24))})`;
  if (hs.done || !hs.live || !hs.chars) {
    const res = hs.result !== undefined ? hs.result : hs.lastValue;
    return `<span class="ht-hash-title">${title}</span> = <b class="ht-hash-res">${escapeHtml(py(res))}</b> <span class="tp-cap-muted">→ home slot</span>`;
  }
  const chars = hs.chars.slice(0, 24).map((c, k) => {
    const doneRow = k < hs.current ? hs.rows[k] : null;
    const cls = k === hs.current ? 'ht-ch ht-ch-cur' : k < hs.current ? 'ht-ch ht-ch-done' : 'ht-ch';
    const sub = doneRow && doneRow.value !== null ? escapeHtml(py(doneRow.value)) : '&nbsp;';
    return `<span class="${cls}"><span>${escapeHtml(c)}</span><small>${k === hs.current ? 'ord ' + c.charCodeAt(0) : sub}</small></span>`;
  }).join('');
  const vals = [];
  if (hs.value !== null && hs.value !== undefined) vals.push(`value = <b>${escapeHtml(py(hs.value))}</b>`);
  if (hs.a !== null && hs.a !== undefined) vals.push(`a = ${escapeHtml(py(hs.a))}`);
  return `<span class="ht-hash-title">${title}</span><span class="ht-chars">${chars}${hs.chars.length > 24 ? '<span class="ht-ch">…</span>' : ''}</span>
    <span class="ht-hash-vals">${vals.join(' · ')} <span class="tp-cap-muted">(mod ${size})</span></span>`;
}

export function renderHTablePanel() {
  if (!state.steps.length) { hideOutTabsAll(state.dsaMode); return; }
  const F = facts();
  const first = F.tables.length ? F.tables[0].first : -1;
  els.outTabs.hidden = false;
  els.outTitle.hidden = true;
  els.tabHTable.hidden = false;
  if (!state.userTab && !state.htableAnnounced && first >= 0 && state.idx >= first) {
    state.htableAnnounced = true;
    state.outTab = 'htable';
  }
  els.tabOut.classList.toggle('active', state.outTab === 'out');
  els.tabHTable.classList.toggle('active', state.outTab === 'htable');
  els.output.hidden = state.outTab !== 'out';
  els.htableBody.hidden = state.outTab !== 'htable';
  if (state.outTab !== 'htable') return;

  const body = els.htableBody;
  if (first < 0 || state.idx < first) {
    if (body._htView) body._htView = null;
    showMessage(body, first < 0
      ? 'No Hash Table found — needs a class whose array (array / table / slots) holds None or (key, value) pairs.'
      : 'The table has not been created yet.', 'Use Prev/Next to navigate.');
    return;
  }
  const v = ensureView(body);
  const sameRun = v.stepsRef === state.steps;
  const forward = sameRun && state.idx === v.lastStep + 1;
  const newStep = !sameRun || state.idx !== v.lastStep;
  v.stepsRef = state.steps;
  v.lastStep = state.idx;
  for (const a of v.flights) { try { a.cancel(); } catch (err) { /* done */ } }
  v.flights = [];
  const ms = animMs();
  body.style.setProperty('--tp-anim', `${ms}ms`);

  const out = frameAt(F, state.idx);
  const act = out.figures.find((f) => f.active);
  const sc = out.scope;

  // Header strip: class · operation · probe counter.
  const cls = (act && act.table && act.table.cls) || (out.figures[0] && out.figures[0].table && out.figures[0].table.cls) || 'table';
  const opArgs = sc ? Object.entries(sc.args).filter(([k]) => k !== 'self').map(([, x]) => py(x, 14)).join(', ') : '';
  const probeTxt = out.probe && out.probe.trail.length ? `probe ${out.probe.trail.length} of ${out.probe.size}${out.probe.done ? ' · done' : ''}` : '';
  v.strip.innerHTML = `
    <span class="tp-arr">${escapeHtml(cls)}</span>
    ${sc ? `<span class="tp-ptr">${out.live ? '' : '<span class="tp-cap-muted">last: </span>'}${escapeHtml(act ? act.name : '')}.${escapeHtml(sc.fn)}(${escapeHtml(opArgs)})</span>` : ''}
    ${probeTxt ? `<span class="tp-badge tp-badge-warn">${escapeHtml(probeTxt)}</span>` : ''}
    ${out.rehash && out.rehash.started ? `<span class="tp-badge">rehash ${out.rehash.from} → ${out.rehash.to}</span>` : ''}`;
  setCaption(v, out.caption);

  v.hash.hidden = !out.hash;
  const hh = hashHtml(out.hash, act && act.table ? act.table.size : 0);
  if (v.hash._html !== hh) { v.hash.innerHTML = hh; v.hash._html = hh; }
  v.banner.hidden = !out.banner;
  if (out.banner) v.banner.textContent = `✗ ${out.banner}`;

  // Figures, in first-appearance order; tables not created yet are absent.
  const keep = new Set(out.figures.map((f) => f.oid));
  for (const [oid, f] of v.figEls) if (!keep.has(oid)) { f.root.remove(); v.figEls.delete(oid); }
  for (const fig of out.figures) {
    const t = fig.table;
    const f = figureEl(v, fig.oid);
    v.figs.appendChild(f.root);
    if (!t) continue;
    f.root.className = `ht-fig${fig.active ? ' ht-active' : ''}${fig.old ? ' ht-rehashing' : ''}${fig.active && fig.wrapped ? ' ht-wrapping' : ''}`;
    const hh2 = headHtml(fig, t, out);
    if (f.head._html !== hh2) { f.head.innerHTML = hh2; f.head._html = hh2; }
    if (newStep && fig.active && sc && (sc.kind === 'len' || sc.kind === 'empty')) flash(f.head.querySelector('.ht-count'), 'ht-pulse');

    // Old table during a rehash: dimmed, re-inserted keys crossed out.
    f.old.hidden = !fig.old;
    if (fig.old) {
      f.oldLabel.textContent = `old ${fig.old.table.size}-slot table — each key is re-inserted below with a new hash`;
      syncCells(f.oldRow, fig.old.table.slots.map((s, k) => ({
        key: `o${k}`, idx: k, html: slotHtml(s),
        cls: `tp-cell ht-slot ${s ? 'ht-filled' : 'ht-empty'}${fig.old.crossed.has(k) ? ' ht-crossed' : ''}`,
        title: s ? `old slot ${k}: (${py(s.key)}, ${py(s.value)})` : `old slot ${k}: empty`,
      })));
    } else if (f.oldRow.firstChild) f.oldRow.innerHTML = '';

    const cells = syncCells(f.row, cellSpecs(fig, t, fig.active));
    if (newStep) {
      for (const [k, c] of fig.flash) flash(cells[k], c);
      if (fig.active && fig.cursor !== null && cells[fig.cursor]) flash(cells[fig.cursor], 'ht-arrive');
    }

    // Move chips (delete) and the flight of a key landing in its new slot.
    const movesHtml = fig.active && fig.moves.length
      ? `<span class="tp-cap-muted">re-placed:</span> ${fig.moves.map((m) => `<span class="ht-move">${escapeHtml(bare(m.key))} ${m.from === m.to ? `stays ${m.to}` : `${m.from} → ${m.to}`}</span>`).join('')}`
      : '';
    if (f.moves._html !== movesHtml) { f.moves.innerHTML = movesHtml; f.moves._html = movesHtml; }
    if (forward && ms && fig.active) {
      for (const [k, c] of fig.flash) {
        if (c !== 'ht-write' || !t.slots[k]) continue;
        const key = t.slots[k].key;
        const m = fig.moves.find((x) => x.to === k && x.from !== k);
        if (m) fly(v, cells[m.from], cells[k], bare(key), ms);
        else if (fig.old) {
          const ok = fig.old.table.slots.findIndex((s) => s && JSON.stringify(s.key) === JSON.stringify(key));
          if (ok >= 0) fly(v, f.oldRow.children[ok], cells[k], bare(key), ms);
        }
      }
    }
    drawWrap(f, fig, t);
  }

  setLegend(v, [
    ['ht-sw-home', 'home = hash(key)'],
    ['ht-sw-probe', 'probe cursor'],
    ['ht-sw-col', 'collision — another key'],
    ['ht-sw-match', 'key found'],
    ['ht-sw-free', 'empty slot reached'],
    ['ht-sw-scan', 'scan / cluster scan'],
    ['ht-sw-lifted', 'lifted out (delete)'],
  ]);

  // Keep the probe / scan cursor in view on wide tables.
  if (act && newStep) {
    const f = v.figEls.get(act.oid);
    const k = act.cursor ?? act.scan ?? act.gap;
    const el = f && k !== null && k !== undefined ? f.row.querySelector(`[data-idx="${k}"]`) : null;
    if (el && body.scrollWidth > body.clientWidth) {
      const b = body.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.left < b.left + 20 || r.right > b.right - 20) body.scrollLeft += r.left - b.left - b.width / 2 + r.width / 2;
    }
  }
}
