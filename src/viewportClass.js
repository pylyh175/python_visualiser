/* ═══════════════ Viewport classification (pure — no DOM) ═══════════════
   2026-11-24 viewport design. One place decides what kind of screen the app
   is on; CSS and the visualisers key off the result (html[data-*]).

   device  — 'phone' | 'tablet' | 'laptop' | 'monitor'
   layout  — 'split' (editor | visualiser side by side) | 'stacked' (one column)
   short   — the window is too short for roomy chrome (laptops at 768px, …)
   touch   — the primary pointer is coarse (finger)                         */

export const BREAKPOINTS = {
    phone: 720,     // < 720 CSS px wide
    tablet: 1100,   // < 1100
    laptop: 1600,   // < 1600; anything wider is a monitor
};
export const SHORT_HEIGHT = 720;
// A touch screen whose SHORT side is below this is a phone even in
// landscape (an 850 × 390 phone is not a tablet).
export const PHONE_SHORT_SIDE = 500;

export function classifyViewport({ width, height, coarse = false }) {
    const shortSide = Math.min(width, height);
    let device;
    if (width < BREAKPOINTS.phone || (coarse && shortSide < PHONE_SHORT_SIDE)) device = 'phone';
    else if (width < BREAKPOINTS.tablet) device = 'tablet';
    else if (width < BREAKPOINTS.laptop) device = 'laptop';
    else device = 'monitor';
    const orientation = width >= height ? 'landscape' : 'portrait';
    // Side by side needs room for two usable columns: phones always stack,
    // tablets stack when upright (or narrow), laptops and monitors split.
    const layout = device === 'phone' || (device === 'tablet' && (orientation === 'portrait' || width < 900))
        ? 'stacked' : 'split';
    return { device, layout, orientation, short: height < SHORT_HEIGHT, touch: !!coarse };
}

// Visual scale for drawn visualisations (recursion tree, cells): a little
// larger on big monitors, unchanged elsewhere (phones FIT instead — see
// recursion.js — rather than shrinking everything up front).
export function vizScale(device) {
    return device === 'monitor' ? 1.15 : 1;
}
