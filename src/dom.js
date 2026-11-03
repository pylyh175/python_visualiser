/* ═══════════════ DOM element references ═══════════════ */

// Every element the app touches, resolved once. ES modules execute after the
// document is parsed (type="module" is deferred), so these all exist.
export const els = {
  status: document.getElementById('status'),
  mirror: document.getElementById('mirror'),
  textarea: document.getElementById('codeInput'),
  visualize: document.getElementById('btnVisualize'),
  edit: document.getElementById('btnEdit'),
  hint: document.querySelector('.hint'),
  main: document.querySelector('main'),
  divider: document.getElementById('divider'),
  vdivider: document.getElementById('vdivider'),
  right: document.getElementById('right'),
  first: document.getElementById('btnFirst'),
  prev: document.getElementById('btnPrev'),
  next: document.getElementById('btnNext'),
  last: document.getElementById('btnLast'),
  slider: document.getElementById('stepSlider'),
  stepLabel: document.getElementById('stepLabel'),
  output: document.getElementById('outputBody'),
  vars: document.getElementById('varsBody'),
  varsPanel: document.getElementById('varsPanel'),
  outTitle: document.getElementById('outTitle'),
  outTabs: document.getElementById('outTabs'),
  tabOut: document.getElementById('tabOut'),
  tabTree: document.getElementById('tabTree'),
  tabStack: document.getElementById('tabStack'),
  treeBody: document.getElementById('treeBody'),
  stackBody: document.getElementById('stackBody'),
  dsaMode: document.getElementById('dsaMode'),
};
