/* ═══════════════ Two-pointer pane kit (shared DOM layer) ═══════════════
   2026-11-24 visualisation-upgrade design. Every two-pointers pane (generic,
   Two Sum, Remove Duplicates, Reverse, Palindrome, Container) draws through
   this one layer:
   - a PERSISTENT view: cells are reconciled in place by key instead of
     rebuilt with innerHTML, so CSS transitions (colour, opacity, bar height)
     actually run between steps;
   - pointer MARKERS (▲ + name) drawn once per pointer and slid between
     cells with a transform transition — pointers glide instead of jumping;
   - a swap ARC: the two swapped values fly to each other's slots;
   - caption / legend / pin rows shared by every pane.
   Animation length follows the playback speed (state.playSpeed).          */

import { state } from "../state.js";
import { PLAY_SPEEDS, PLAY_DEFAULT_SPEED } from "../config.js";
import { escapeHtml } from "../utils.js";

// Animation length for one step's movement (ms): calm when stepping by hand,
// shorter than the step delay during playback so motion never overlaps the
// next step. 0 = reduced motion requested.
export function animMs() {
  try {
    if (
      window.matchMedia &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return 0;
  } catch (err) {
    /* no matchMedia: animate */
  }
  if (!state.playing) return 320;
  const per = PLAY_SPEEDS[state.playSpeed] ?? PLAY_SPEEDS[PLAY_DEFAULT_SPEED];
  return Math.max(90, Math.min(420, Math.round(per * 0.6)));
}

// Ask the app to re-render (pin changes). An event instead of an import keeps
// the kit free of a cycle through panels/output.js, which listens for it.
export function requestRender() {
  document.dispatchEvent(new CustomEvent("viz:rerender"));
}

// Build (once) or reuse the persistent skeleton inside a pane body.
// variant: 'cells' (boxes) | 'bars' (container heights).
export function ensureView(body, variant = "cells") {
  const old = body._tpView;
  if (old && old.variant === variant && body.contains(old.track)) return old;
  if (old && old.ro) old.ro.disconnect();
  body.innerHTML = `
    <div class="tp-head">
      <div class="tp-strip"></div>
      <div class="tp-pin"></div>
    </div>
    <div class="tp-caption" aria-live="polite"></div>
    <div class="tp-track${variant === "bars" ? " tp-track-bars" : ""}">
      <div class="tp-array"${variant === "bars" ? " data-container" : ""}></div>
      <div class="tp-markers"></div>
    </div>
    <div class="tp-legend"></div>`;
  const q = (sel) => body.querySelector(sel);
  const v = {
    variant,
    body,
    strip: q(".tp-strip"),
    pin: q(".tp-pin"),
    caption: q(".tp-caption"),
    track: q(".tp-track"),
    array: q(".tp-array"),
    markers: q(".tp-markers"),
    legend: q(".tp-legend"),
    markerEls: new Map(),
    pointers: [],
    placed: false,
    flights: [],
    lastStep: -1,
    stepsRef: null,
    pinSig: "",
    pinOpen: false,
    legendHtml: null
  };
  wirePin(v);
  // Re-place markers whenever the track changes size — including the moment
  // a hidden pane becomes visible (hidden panes have no geometry).
  if (typeof ResizeObserver !== "undefined") {
    v.ro = new ResizeObserver(() => placeMarkers(v, v.pointers, false));
    v.ro.observe(v.track);
  }
  body._tpView = v;
  return v;
}

// Plain message state (no detection anywhere in the trace).
export function showMessage(body, title, sub) {
  if (body._tpView && body._tpView.ro) body._tpView.ro.disconnect();
  body._tpView = null;
  body.innerHTML = `
    <div class="tp-strip">${escapeHtml(title)}</div>
    <div class="tp-empty">${escapeHtml(sub)}</div>`;
}

// Is this render a single step FORWARD from the last one drawn in this view?
// Travel animations (swap arcs, value flights) only make sense then; jumps
// (slider, First/Last, stepping back) just re-draw.
export function beginFrame(v) {
  const sameRun = v.stepsRef === state.steps;
  const forward = sameRun && state.idx === v.lastStep + 1;
  const newStep = !sameRun || state.idx !== v.lastStep;
  v.stepsRef = state.steps;
  v.lastStep = state.idx;
  // Cancel flights still in the air from the previous step.
  for (const a of v.flights) {
    try {
      a.cancel();
    } catch (err) {
      /* already done */
    }
  }
  v.flights = [];
  const ms = animMs();
  v.body.style.setProperty("--tp-anim", `${ms}ms`);
  return { forward, newStep, ms };
}

// Reconcile the array's cells with `specs` by key: existing elements are
// kept (so transitions run), new keys are created, stale keys removed.
// spec: { key, idx?, text? | html?, cls, style?, title? }
export function syncCells(arrayEl, specs) {
  const existing = [...arrayEl.children].filter(
    (e) => e.dataset && e.dataset.key != null
  );
  const same =
    existing.length === specs.length &&
    specs.every((s, i) => existing[i].dataset.key === s.key);
  let els = existing;
  if (!same) {
    const byKey = new Map(existing.map((e) => [e.dataset.key, e]));
    els = specs.map((s) => {
      let el = byKey.get(s.key);
      if (el) byKey.delete(s.key);
      else {
        el = document.createElement("div");
        el.dataset.key = s.key;
      }
      return el;
    });
    byKey.forEach((el) => el.remove());
    // appendChild moves kept nodes into order (non-cell children such as the
    // container's water stay where they are — they are absolutely placed).
    for (const el of els) arrayEl.appendChild(el);
  }
  specs.forEach((s, i) => {
    const el = els[i];
    if (el.className !== s.cls) el.className = s.cls;
    const idx = s.idx == null ? "" : String(s.idx);
    if (el.dataset.idx !== idx) {
      if (idx === "") delete el.dataset.idx;
      else el.dataset.idx = idx;
    }
    if (s.html != null) {
      if (el._html !== s.html) {
        el.innerHTML = s.html;
        el._html = s.html;
      }
    } else if (el.textContent !== (s.text ?? "")) {
      el.textContent = s.text ?? "";
    }
    const style = s.style || "";
    if (el._style !== style) {
      el.style.cssText = style;
      el._style = style;
    }
    if ((s.title || "") !== (el.title || "")) el.title = s.title || "";
  });
  return els;
}

// The cell element drawn for array index `idx` (ghost slots use -1 / len).
export function cellAt(v, idx) {
  return v.array.querySelector(`:scope > [data-idx="${idx}"]`);
}

// Restart a one-shot CSS animation class on a persistent element.
export function flash(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow: lets the same animation play again
  el.classList.add(cls);
}

// Slide each pointer's marker under its cell. pointers: [{ name, idx, role }].
// Two pointers on one cell stack vertically. animate=false (resize, first
// placement, hidden → shown) jumps without a transition.
export function placeMarkers(v, pointers, animate = true) {
  v.pointers = pointers || [];
  const base = v.markers.getBoundingClientRect();
  if (!base.width && !base.height) return; // hidden: the ResizeObserver re-places on show
  const seen = new Set();
  const rows = new Map();
  for (const p of v.pointers) {
    let el = v.markerEls.get(p.name);
    const isNew = !el;
    if (isNew) {
      el = document.createElement("div");
      el.innerHTML =
        '<span class="tp-marker-arrow">▲</span><span class="tp-marker-name"></span>';
      v.markers.appendChild(el);
      v.markerEls.set(p.name, el);
    }
    seen.add(p.name);
    const nameEl = el.querySelector(".tp-marker-name");
    const label = p.label || p.name;
    if (nameEl.textContent !== label) nameEl.textContent = label;
    const cell = cellAt(v, p.idx);
    if (!cell) {
      el.hidden = true;
      continue;
    }
    const c = cell.getBoundingClientRect();
    const x = c.left + c.width / 2 - base.left;
    const row = rows.get(p.idx) || 0;
    rows.set(p.idx, row + 1);
    // A second pointer on the same cell drops its arrow and sits under the
    // first one's name (arrow 12px + name 12px per marker).
    const cls = `tp-marker tp-role-${p.role}${row ? " tp-marker-stacked" : ""}`;
    if (el.className !== cls) el.className = cls;
    const jump = !animate || isNew || !v.placed || el.hidden;
    el.hidden = false;
    if (jump) el.style.transition = "none";
    el.style.transform = `translate(${x}px, ${row ? 12 + row * 12 : 0}px) translateX(-50%)`;
    if (jump) {
      void el.offsetWidth;
      el.style.transition = "";
    }
  }
  for (const [name, el] of v.markerEls) {
    if (!seen.has(name)) {
      el.remove();
      v.markerEls.delete(name);
    }
  }
  v.placed = true;
}

// Swap arc: the value now in cell b came from a (and vice versa) — fly two
// copies along mirrored arcs while the real cells hide their text.
export function playSwap(v, a, b, ms) {
  if (!ms || a === b || typeof Element.prototype.animate !== "function") return;
  const ca = cellAt(v, a),
    cb = cellAt(v, b);
  if (!ca || !cb) return;
  const base = v.track.getBoundingClientRect();
  const ra = ca.getBoundingClientRect(),
    rb = cb.getBoundingClientRect();
  if (!base.width) return;
  const fly = (fromRect, toEl, toRect, lift) => {
    const ghost = document.createElement("div");
    ghost.className = "tp-fly";
    ghost.textContent = toEl.textContent;
    ghost.style.left = `${fromRect.left - base.left}px`;
    ghost.style.top = `${fromRect.top - base.top}px`;
    ghost.style.width = `${fromRect.width}px`;
    ghost.style.height = `${fromRect.height}px`;
    v.track.appendChild(ghost);
    toEl.classList.add("tp-landing");
    const dx = toRect.left - fromRect.left;
    const anim = ghost.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: `translate(${dx / 2}px, ${lift}px)`, offset: 0.5 },
        { transform: `translate(${dx}px, 0)` }
      ],
      { duration: Math.round(ms * 1.5), easing: "ease-in-out" }
    );
    const done = () => {
      ghost.remove();
      toEl.classList.remove("tp-landing");
    };
    anim.onfinish = done;
    anim.oncancel = done;
    v.flights.push(anim);
  };
  fly(ra, cb, rb, -30);
  fly(rb, ca, ra, 30);
}

// Header strip helpers.
export function ptrChip(name, idx, valHtml, role) {
  // "(val x)" rather than "→ x": captions use → for movement (left 0 → 1).
  return `<span class="tp-ptr tp-role-text-${role}">${escapeHtml(name)}=${idx} <span class="tp-ptr-val">(val ${valHtml})</span></span>`;
}

export function setCaption(v, html) {
  const h = html || "&nbsp;";
  if (v.caption._html !== h) {
    v.caption.innerHTML = h;
    v.caption._html = h;
  }
}

export function setLegend(v, items) {
  const html = items
    .map(
      ([cls, text]) =>
        `<span class="tp-legend-item"><span class="tp-swatch ${cls}"></span>${escapeHtml(text)}</span>`
    )
    .join("");
  if (v.legendHtml !== html) {
    v.legend.innerHTML = html;
    v.legendHtml = html;
  }
}

/* ---------- pin control: choose the array + two pointers by hand ---------- */

// options: { seqs: [name], ints: [name] } from the frame's locals; the
// current pin (if any) is merged in so a pinned name never vanishes from
// its own select on a step where it is out of scope.
export function renderPin(v, locals, kind) {
  const loc = locals || {};
  const isSeq =
    kind === "string"
      ? (x) => typeof x === "string" && x.length > 0
      : (x) => !!x && typeof x === "object" && typeof x.length === "number";
  const pin = state.pointerPin;
  const seqs = Object.keys(loc).filter((n) => isSeq(loc[n]));
  const ints = Object.keys(loc).filter(
    (n) => typeof loc[n] === "number" && Number.isInteger(loc[n])
  );
  if (pin) {
    if (!seqs.includes(pin.arr)) seqs.push(pin.arr);
    for (const n of [pin.left, pin.right]) if (!ints.includes(n)) ints.push(n);
  }
  const sig = JSON.stringify([seqs, ints, pin, kind]);
  if (v.pinSig === sig) return;
  v.pinSig = sig;
  const opt = (names, sel) =>
    names
      .map(
        (n) =>
          `<option value="${escapeHtml(n)}"${n === sel ? " selected" : ""}>${escapeHtml(n)}</option>`
      )
      .join("");
  const blank = '<option value="">—</option>';
  v.pin.innerHTML = `
    <details class="tp-pin-box"${v.pinOpen ? " open" : ""}>
      <summary title="Choose which variables are the pointers">${pin ? "📌 pinned" : "⚙ auto"}</summary>
      <div class="tp-pin-form">
        <label>${kind === "string" ? "string" : "array"} <select data-pin="arr">${blank}${opt(seqs, pin && pin.arr)}</select></label>
        <label>ptr 1 <select data-pin="left">${blank}${opt(ints, pin && pin.left)}</select></label>
        <label>ptr 2 <select data-pin="right">${blank}${opt(ints, pin && pin.right)}</select></label>
        <button type="button" data-pin-reset${pin ? "" : " disabled"}>Auto-detect</button>
      </div>
    </details>`;
}

function wirePin(v) {
  v.pin.addEventListener(
    "toggle",
    (e) => {
      if (e.target.matches("details")) v.pinOpen = e.target.open;
    },
    true
  );
  v.pin.addEventListener("change", () => {
    const get = (k) =>
      v.pin.querySelector(`select[data-pin="${k}"]`)?.value || "";
    const arr = get("arr"),
      left = get("left"),
      right = get("right");
    if (arr && left && right && left !== right) {
      state.pointerPin = { arr, left, right };
      onPinChanged();
    }
  });
  v.pin.addEventListener("click", (e) => {
    if (e.target.closest("[data-pin-reset]")) {
      state.pointerPin = null;
      onPinChanged();
    }
  });
}

// Pin listeners registered by twoPointers.js (cache invalidation) — kept as
// a hook so the kit never imports the detector module.
const pinListeners = [];
export function onPin(fn) {
  pinListeners.push(fn);
}
function onPinChanged() {
  for (const fn of pinListeners) fn();
  requestRender();
}
