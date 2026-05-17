// retention.js — Panel 04 controller
//
// In-house retention predictor showcase, driven by scroll. Same external
// contract as globe.js: panels.js calls window.__retention.setProgress(hold,
// visible) every scroll tick.
//
// Phases (hold ∈ [0,1]):
//   A. 0.00 – 0.18  Upload: video tile fades in; scanline sweeps top→bottom
//   B. 0.15 – 0.40  Embeddings extract: video latent cells + audio bars
//                    fill left→right (one column per scroll-tick worth)
//   C. 0.35 – 0.55  Custom model: 3-layer net activates layer by layer;
//                    pulses travel along the connections
//   D. 0.50 – 0.78  Curve draws: retention path reveals left→right via
//                    stroke-dashoffset; head dot rides the tip
//   E. 0.70 – 0.92  Timeline bars rise from baseline; score rings fill;
//                    warning glyphs pop on cliff seconds
//   F. 0.85 – 1.00  Explanatory metric rows fade in
//
// All in single-hue purple (style-contract §2): "tier" is encoded by
// luminosity in --ink / --ink-hot. No green/yellow/red.

(function () {
  'use strict';

  // ─── DATA ────────────────────────────────────────────────────────────
  // 21 seconds of predicted retention, tagged HOLD(0) / DECLINE(1) / CLIFF(2)
  const RETENTION = [
    [ 0, 100, 0], [ 1,  92, 0], [ 2,  78, 1], [ 3,  73, 2], [ 4,  70, 1],
    [ 5,  67, 1], [ 6,  65, 1], [ 7,  62, 1], [ 8,  60, 0], [ 9,  57, 1],
    [10,  54, 1], [11,  49, 2], [12,  45, 2], [13,  42, 1], [14,  40, 0],
    [15,  38, 0], [16,  36, 0], [17,  33, 1], [18,  30, 2], [19,  27, 2],
    [20,  25, 2],
  ];
  // Corpus baseline (typical retention for comparable videos)
  const CORPUS = [
    100, 88, 80, 74, 70, 66, 63, 60, 58, 55, 53, 51, 49, 47, 46, 44, 42, 40, 38, 36, 34,
  ];

  // Cliff second indices that get warning glyphs
  const WARN_SECONDS = [3, 11, 12, 18, 19, 20];

  const SCORES = [
    { key: 'HOOK',    value: 8 },
    { key: 'PACING',  value: 4 },
    { key: 'EDITING', value: 5 },
    { key: 'STORY',   value: 6 },
    { key: 'AUDIO',   value: 5 },
    { key: 'ENDING',  value: 2 },
  ];

  const METRICS = [
    { key: 'HOOK',    tier: 0, text: 'Strong visual hook — face at 0.3s, payoff promise lands by 0.8s with clear stakes.' },
    { key: 'PACING',  tier: 2, text: '3s dead zone at s11–13 and a 4s overstay at end. Two craters drag the whole curve.' },
    { key: 'EDITING', tier: 1, text: 'Four techniques present (cuts, zooms, text, sfx). No overlay arrows or word-emphasis.' },
    { key: 'STORY',   tier: 1, text: 'Problem → solution arc holds committed viewers. Payoff at s19 lands but is buried.' },
    { key: 'AUDIO',   tier: 1, text: 'SFX at hook + transitions only. 4s music gap at s10–13 reads as empty middle.' },
    { key: 'ENDING',  tier: 2, text: '4s past payoff. CTA fine at s21; everything after is dead content — −40% remaining.' },
  ];

  // Latent cell luminosity (32 values, sampled to look like a real embedding vector)
  const VIDEO_LATENT = [
    0.18, 0.42, 0.71, 0.55, 0.30, 0.62, 0.88, 0.40,
    0.22, 0.50, 0.78, 0.65, 0.34, 0.18, 0.46, 0.72,
    0.58, 0.28, 0.51, 0.82, 0.40, 0.66, 0.30, 0.55,
    0.74, 0.42, 0.20, 0.60, 0.85, 0.38, 0.52, 0.28,
  ];
  // Audio mel-spec heights (32 values)
  const AUDIO_LATENT = [
    0.28, 0.50, 0.72, 0.45, 0.85, 0.62, 0.30, 0.78,
    0.55, 0.40, 0.92, 0.68, 0.35, 0.20, 0.55, 0.78,
    0.42, 0.65, 0.85, 0.50, 0.28, 0.60, 0.88, 0.45,
    0.35, 0.70, 0.55, 0.30, 0.75, 0.62, 0.40, 0.22,
  ];

  // ─── helpers ─────────────────────────────────────────────────────────
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const remap = (x, a, b) => clamp01((x - a) / (b - a));
  const smooth = (t) => t * t * (3 - 2 * t);

  // tier → grayscale token (luminosity encodes tier: bright = holding, dim = cliff)
  function tierColor(t, a = 1) {
    if (t === 0) return `rgba(255, 255, 255, ${a})`;         // holding — bright
    if (t === 1) return `rgba(255, 255, 255, ${a * 0.62})`;  // decline — mid
    return `rgba(255, 255, 255, ${a * 0.34})`;               // cliff — dim
  }

  // Smooth path through points via Catmull-Rom-to-Bezier
  function smoothPath(points) {
    if (points.length < 2) return '';
    const d = [`M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const t = 0.5; // tension
      const c1x = p1[0] + (p2[0] - p0[0]) / 6 * t;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6 * t;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6 * t;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6 * t;
      d.push(`C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
    }
    return d.join(' ');
  }

  // ─── boot ────────────────────────────────────────────────────────────
  const state = {
    booted: false,
    panel: null,
    // refs
    video: null,
    scanline: null,
    spine: [],
    cells: [],
    waves: [],
    model: null,
    modelNodes: [],
    modelConns: [],
    modelPulse: null,
    curveSvg: null,
    curveLine: null,
    curveGlow: null,
    curveHead: null,
    curveLength: 0,
    curveReadout: null,
    flowSteps: [],
    bars: [],
    gauges: [],
    metrics: [],
    embedsWrap: null,
    modelWrap: null,
  };

  function init() {
    const panel = document.querySelector('.panel-4');
    if (!panel) return;
    state.panel = panel;

    buildStage(panel);
    state.booted = true;
    // panel 4 is fully scroll-driven — no rAF loop needed.
  }

  function buildStage(panel) {
    const inner = panel.querySelector('.panel-inner');
    if (!inner) return;
    inner.innerHTML = ''; // we own the inside

    const stage = document.createElement('div');
    stage.className = 'p4-stage';
    inner.appendChild(stage);

    // ── output column (the only one) ─────────────────
    const output = document.createElement('div');
    output.className = 'p4-output';
    stage.appendChild(output);

    // Retention curve
    const curve = document.createElement('div');
    curve.className = 'p4-curve';
    curve.innerHTML = `
      <svg class="p4-curve-svg" viewBox="0 0 720 220" preserveAspectRatio="none"></svg>
    `;
    output.appendChild(curve);
    buildCurveSvg(curve.querySelector('.p4-curve-svg'));

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'p4-timeline';
    timeline.innerHTML = `
      <div class="p4-timeline-head">
        <span class="p4-mono">TIMELINE · ONE BAR = ONE SECOND</span>
        <div class="p4-timeline-legend">
          <span class="l-hold"><i></i>HOLD</span>
          <span class="l-decl"><i></i>DECLINE</span>
          <span class="l-cliff"><i></i>CLIFF</span>
        </div>
      </div>
      <div class="p4-bars"></div>
    `;
    output.appendChild(timeline);
    const barsEl = timeline.querySelector('.p4-bars');
    RETENTION.forEach(([sec, val, tier]) => {
      const b = document.createElement('div');
      b.className = 'p4-bar tier-' + tier;
      if (WARN_SECONDS.includes(sec)) b.classList.add('is-warn');
      barsEl.appendChild(b);
      state.bars.push(b);
    });

    // Score gauges
    const scoresEl = document.createElement('div');
    scoresEl.className = 'p4-scores';
    SCORES.forEach((s) => {
      const g = document.createElement('div');
      g.className = 'p4-gauge';
      g.innerHTML = `
        <div class="p4-gauge-ring">
          <div class="p4-gauge-val">0</div>
        </div>
        <span class="p4-gauge-label">${s.key}</span>
      `;
      // tone the gauge by score band — grayscale (luminosity, not hue)
      const c = s.value >= 7 ? 'rgba(255, 255, 255, 1)'
              : s.value >= 4 ? 'rgba(255, 255, 255, 0.72)'
              : 'rgba(255, 255, 255, 0.44)';
      g.style.setProperty('--gauge-c', c);
      scoresEl.appendChild(g);
      state.gauges.push({
        el: g,
        ring: g.querySelector('.p4-gauge-ring'),
        val: g.querySelector('.p4-gauge-val'),
        target: s.value,
      });
    });
    output.appendChild(scoresEl);

    // Explanatory metrics
    const metricsEl = document.createElement('div');
    metricsEl.className = 'p4-metrics';
    METRICS.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'p4-metric tier-' + m.tier;
      row.innerHTML = `
        <span class="m-dot"></span>
        <span class="m-label">${m.key}</span>
        <span class="m-text">${m.text}</span>
      `;
      metricsEl.appendChild(row);
      state.metrics.push(row);
    });
    output.appendChild(metricsEl);
  }

  // ─── model network SVG ───────────────────────────────────────────────
  function buildModelSvg(svg) {
    const W = 320, H = 84;
    // 3 columns: input (2 nodes — video+audio), hidden (4 nodes), output (1 node)
    const layers = [
      { x: 4,            ys: [22, 62],                     kind: 'in' },
      { x: W * 0.42,     ys: [10, 32, 54, 76],             kind: 'hid' },
      { x: W * 0.78,     ys: [22, 62],                     kind: 'hid2' },
      { x: W - 6,        ys: [42],                          kind: 'out' },
    ];

    const ns = 'http://www.w3.org/2000/svg';

    // connectors (all-to-all between adjacent layers)
    const allConns = [];
    for (let li = 0; li < layers.length - 1; li++) {
      const A = layers[li], B = layers[li + 1];
      for (let i = 0; i < A.ys.length; i++) {
        for (let j = 0; j < B.ys.length; j++) {
          const p = document.createElementNS(ns, 'line');
          p.setAttribute('x1', A.x);
          p.setAttribute('y1', A.ys[i]);
          p.setAttribute('x2', B.x);
          p.setAttribute('y2', B.ys[j]);
          p.setAttribute('class', 'conn');
          p.dataset.layer = li; // origin layer index
          svg.appendChild(p);
          allConns.push({ el: p, layer: li, x1: A.x, y1: A.ys[i], x2: B.x, y2: B.ys[j] });
        }
      }
    }

    // nodes
    const allNodes = [];
    layers.forEach((L, li) => {
      L.ys.forEach((y) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', L.x);
        c.setAttribute('cy', y);
        c.setAttribute('r', li === 0 || li === layers.length - 1 ? 3 : 2.2);
        c.setAttribute('class', 'node');
        c.dataset.layer = li;
        svg.appendChild(c);
        allNodes.push({ el: c, layer: li });
      });
    });

    // pulse — a tiny dot we move along connections during phase C
    const pulse = document.createElementNS(ns, 'circle');
    pulse.setAttribute('class', 'pulse');
    pulse.setAttribute('r', 1.6);
    pulse.setAttribute('cx', -10);
    pulse.setAttribute('cy', -10);
    pulse.setAttribute('opacity', 0);
    svg.appendChild(pulse);

    state.modelNodes = allNodes;
    state.modelConns = allConns;
    state.modelPulse = pulse;
    state.modelLayers = layers.length;
  }

  // ─── retention curve SVG ─────────────────────────────────────────────
  function buildCurveSvg(svg) {
    const W = 720, H = 220;
    const PADL = 36, PADR = 12, PADT = 12, PADB = 22;
    const xOf = (sec) => PADL + (sec / 20) * (W - PADL - PADR);
    const yOf = (pct) => PADT + (1 - pct / 100) * (H - PADT - PADB);
    const ns = 'http://www.w3.org/2000/svg';

    // gridlines
    [0, 25, 50, 75, 100].forEach((p) => {
      const y = yOf(p);
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', PADL); l.setAttribute('x2', W - PADR);
      l.setAttribute('y1', y);    l.setAttribute('y2', y);
      l.setAttribute('class', 'grid');
      svg.appendChild(l);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', PADL - 6); t.setAttribute('y', y + 3);
      t.setAttribute('text-anchor', 'end');
      t.setAttribute('class', 'axis-tick');
      t.textContent = p + '%';
      svg.appendChild(t);
    });

    // x ticks
    [0, 5, 10, 15, 20].forEach((s) => {
      const x = xOf(s);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x); t.setAttribute('y', H - 4);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'axis-tick');
      t.textContent = s + 's';
      svg.appendChild(t);
    });

    // axis line
    const ax = document.createElementNS(ns, 'line');
    ax.setAttribute('x1', PADL); ax.setAttribute('x2', PADL);
    ax.setAttribute('y1', PADT); ax.setAttribute('y2', H - PADB);
    ax.setAttribute('class', 'axis');
    svg.appendChild(ax);
    const ay = document.createElementNS(ns, 'line');
    ay.setAttribute('x1', PADL); ay.setAttribute('x2', W - PADR);
    ay.setAttribute('y1', H - PADB); ay.setAttribute('y2', H - PADB);
    ay.setAttribute('class', 'axis');
    svg.appendChild(ay);

    // corpus band (faint dashed envelope for "typical")
    const corpusPts = CORPUS.map((v, i) => [xOf(i), yOf(v)]);
    const corpusLine = document.createElementNS(ns, 'path');
    corpusLine.setAttribute('d', smoothPath(corpusPts));
    corpusLine.setAttribute('class', 'corpus-line');
    svg.appendChild(corpusLine);

    // main curve — single smooth path (we drive reveal with stroke-dashoffset)
    const pts = RETENTION.map(([s, v]) => [xOf(s), yOf(v)]);
    const d = smoothPath(pts);
    const glow = document.createElementNS(ns, 'path');
    glow.setAttribute('d', d);
    glow.setAttribute('class', 'curve-glow');
    svg.appendChild(glow);

    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'curve-line');
    svg.appendChild(line);

    // head dot
    const head = document.createElementNS(ns, 'circle');
    head.setAttribute('r', 4);
    head.setAttribute('cx', pts[0][0]);
    head.setAttribute('cy', pts[0][1]);
    head.setAttribute('class', 'head-dot');
    head.setAttribute('opacity', 0);
    svg.appendChild(head);

    // measure path length for dashoffset reveal
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    glow.style.strokeDasharray = len;
    glow.style.strokeDashoffset = len;

    state.curveSvg = svg;
    state.curveLine = line;
    state.curveGlow = glow;
    state.curveHead = head;
    state.curveLength = len;
    state.curvePts = pts;
  }

  // ─── set target state from scroll ────────────────────────────────────
  let lastHold = 0;
  let lastVis = 0;
  function setProgress(hold, visible) {
    lastHold = hold;
    lastVis = visible;
    apply();
  }

  function apply() {
    // fully scroll-driven — skip the DOM writes entirely while off-screen
    if (!state.booted || lastVis < 0.5) return;
    const h = lastHold;

    // ── (D) Retention curve — reveal by stroke-dashoffset
    const dP = smooth(remap(h, 0.00, 0.50));
    const off = state.curveLength * (1 - dP);
    state.curveLine.style.strokeDashoffset = off.toFixed(2);
    state.curveGlow.style.strokeDashoffset = off.toFixed(2);

    // head dot rides the curve tip
    if (dP > 0 && state.curveLine) {
      const pt = state.curveLine.getPointAtLength(state.curveLength * dP);
      state.curveHead.setAttribute('cx', pt.x.toFixed(2));
      state.curveHead.setAttribute('cy', pt.y.toFixed(2));
      state.curveHead.setAttribute('opacity', dP > 0.02 && dP < 0.999 ? 1 : 0);
    } else {
      state.curveHead.setAttribute('opacity', 0);
    }

    // ── (E) Timeline bars rise + score gauges fill
    const eP = remap(h, 0.40, 0.78);
    state.bars.forEach((bar, i) => {
      const [, val] = RETENTION[i];
      const start = (i / state.bars.length) * 0.55;
      const localP = clamp01((eP - start) * 4);
      const e = smooth(localP);
      // container is 110px tall (94px usable above the 16px warning-glyph gutter)
      const px = Math.max(1, (val / 100) * 94 * e);
      bar.style.height = px.toFixed(1) + 'px';
      bar.style.opacity = (0.4 + 0.6 * e).toFixed(2);
      if (bar.classList.contains('is-warn')) {
        // warning glyph pops in slightly after the bar lands
        const warnP = clamp01((localP - 0.7) * 4);
        bar.style.setProperty('--warn', warnP.toFixed(2));
      }
    });

    state.gauges.forEach((g, i) => {
      const start = 0.05 + (i / state.gauges.length) * 0.45;
      const localP = clamp01((eP - start) * 4);
      const e = smooth(localP);
      g.el.style.setProperty('--g-op', e.toFixed(2));
      const p = (g.target / 10) * e;
      g.ring.style.setProperty('--p', p.toFixed(3));
      g.val.textContent = Math.round(g.target * e);
    });

    // ── (F) Metrics fade in row-by-row
    const fP = remap(h, 0.70, 1.00);
    state.metrics.forEach((row, i) => {
      const start = (i / state.metrics.length) * 0.85;
      const localP = clamp01((fP - start) * 5);
      row.classList.toggle('show', localP > 0.4);
    });
  }

  // ─── expose ──────────────────────────────────────────────────────────
  window.__retention = {
    setProgress,
    _state: state,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
