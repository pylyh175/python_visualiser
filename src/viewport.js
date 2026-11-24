/* ═══════════════ Viewport detection: phone · tablet · laptop · monitor ═══════════════
   2026-11-24 viewport design. Classifies the screen (viewportClass.js) and
   publishes it as html[data-viewport|data-layout|data-orientation|data-short|
   data-touch] for CSS, plus state.viewport for the visualisers. On a change
   it re-renders (event 'viz:viewport' → output.js) so JS-measured visuals —
   cell windows, bar scale, tree fit — recompute for the new size.

   Stacked layouts (phones, upright tablets) also get:
   - a bottom DOCK: the Execution-steps panel moves to a fixed bar at the
     bottom of the screen so Prev/Next stay reachable while scrolling;
   - SWIPE stepping on touch screens: swipe the visualisation left/right
     for Next/Prev (ignored where the pane itself scrolls sideways).       */

import { state } from './state.js';
import { els } from './dom.js';
import { classifyViewport } from './viewportClass.js';

const root = document.documentElement;
const coarseMq = window.matchMedia ? matchMedia('(pointer: coarse)') : null;
let dockRO = null;

function measure() {
    // visualViewport tracks the visible area on mobile (URL bar, keyboard).
    const vv = window.visualViewport;
    return {
        width: window.innerWidth,
        height: vv ? Math.round(vv.height) : window.innerHeight,
        coarse: !!(coarseMq && coarseMq.matches),
    };
}

function apply(info) {
    const prev = state.viewport;
    state.viewport = info;
    root.dataset.viewport = info.device;
    root.dataset.layout = info.layout;
    root.dataset.orientation = info.orientation;
    if (info.short) root.dataset.short = ''; else delete root.dataset.short;
    if (info.touch) root.dataset.touch = ''; else delete root.dataset.touch;
    placeControls(info.layout === 'stacked');
    // The editor's font size can change with the class (16px on touch phones
    // so iOS doesn't zoom on focus): drop the cached caret cell width.
    if (!prev || prev.device !== info.device || prev.touch !== info.touch) state.caretCellW = null;
    return !prev || prev.device !== info.device || prev.layout !== info.layout
        || prev.short !== info.short || prev.touch !== info.touch;
}

// Stacked: the controls panel becomes a fixed bottom dock (moved to <body>
// so position:fixed isn't trapped by #left); split: back to the end of #left.
function placeControls(dock) {
    const panel = document.getElementById('controlsPanel');
    const left = document.getElementById('left');
    if (!panel || !left) return;
    const docked = panel.parentElement === document.body;
    if (dock && !docked) {
        document.body.appendChild(panel);
        panel.classList.add('dock');
        if (typeof ResizeObserver !== 'undefined') {
            dockRO = dockRO || new ResizeObserver(() => {
                root.style.setProperty('--dock-h', `${panel.offsetHeight}px`);
            });
            dockRO.observe(panel);
        }
    } else if (!dock && docked) {
        left.appendChild(panel);
        panel.classList.remove('dock');
        if (dockRO) dockRO.unobserve(panel);
        root.style.removeProperty('--dock-h');
    }
}

// Debounced re-classification; a class change re-lays the page out, and any
// meaningful size change re-renders so measured visuals refit.
let timer = null;
let lastSize = '';
function onResize() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        const m = measure();
        const changed = apply(classifyViewport(m));
        const size = `${m.width}x${m.height}`;
        if (changed || size !== lastSize) {
            lastSize = size;
            document.dispatchEvent(new CustomEvent('viz:viewport', { detail: { classChanged: changed } }));
        }
    }, 120);
}

// Swipe the visualisation left/right to step (touch screens only).
function initSwipe() {
    const panel = document.getElementById('outputPanel');
    if (!panel) return;
    let start = null;
    const scrollsSideways = (el) => {
        for (let n = el; n && n !== panel; n = n.parentElement) {
            if (n.scrollWidth > n.clientWidth + 2) {
                const ox = getComputedStyle(n).overflowX;
                if (ox === 'auto' || ox === 'scroll') return true;
            }
        }
        return false;
    };
    panel.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || !state.steps.length) { start = null; return; }
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, at: Date.now(), blocked: scrollsSideways(e.target) || !!e.target.closest('select, button, details, input') };
    }, { passive: true });
    panel.addEventListener('touchend', (e) => {
        const s = start;
        start = null;
        if (!s || s.blocked || Date.now() - s.at > 700) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
        const btn = dx < 0 ? els.next : els.prev;
        if (btn && !btn.disabled) btn.click();
    }, { passive: true });
}

export function initViewport() {
    const m = measure();
    lastSize = `${m.width}x${m.height}`;
    apply(classifyViewport(m));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    if (coarseMq && coarseMq.addEventListener) coarseMq.addEventListener('change', onResize);
    initSwipe();
}
