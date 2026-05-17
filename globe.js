// globe.js — Panel 03 controller
// Orthographic globe rendered to a 2D canvas via d3-geo. Runs its own rAF
// loop so motion stays smooth regardless of scroll cadence; panels.js writes
// the target state through window.__globe.setProgress(hold, visible).
//
// Design — Tron blueprint:
//   sphere on solid black, hairline purple country outlines, faint 30°
//   graticule. As the panel scrolls, four target countries are brought
//   to face-center in sequence (US → UK → BR → IN). Each gets a brief
//   pulse beacon and a HUD-mono leader-label with its CPM.
//
// Smoothness:
//   1. Canvas, not SVG — one stroke pass per frame, zero DOM churn for paths.
//   2. The render loop runs on rAF, decoupled from scroll. Scroll only writes
//      target rotation/scale; rendering lerps current → target every frame.
//   3. Continuous slow Y-axis drift while idle, so even the "neutral" state
//      reads as alive.

(function () {
  'use strict';

  // 4 target countries — numeric ISO matches world-atlas topojson `id`.
  const COUNTRIES = [
    { iso: 'USA', id: '840', lng: -97, lat: 39,  rate: 5.00 },
    { iso: 'GBR', id: '826', lng:  -2, lat: 54,  rate: 3.20 },
    { iso: 'BRA', id: '076', lng: -53, lat: -10, rate: 1.10 },
    { iso: 'IND', id: '356', lng:  79, lat: 22,  rate: 0.50 },
  ];

  const NEUTRAL = { lng: -30, lat: 18 };

  // damping factors per frame (assume ~60fps; spring-ish exponential lerp).
  // Tighter values = faster catch-up to the scroll target, less perceived lag
  // when the user scrolls quickly. The smoothness now comes from the longer
  // scroll allocation (panel-3 length=3vh), not from a slow lerp.
  const ROT_LERP   = 0.18;
  const SCALE_LERP = 0.20;

  const state = {
    canvas: null,
    ctx: null,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    w: 0, h: 0,

    sphere: { type: 'Sphere' },
    graticule: null,
    countries: null,         // GeoJSON FeatureCollection.features
    byIso: {},               // iso3 → Feature for the 4 targets

    rotLng: NEUTRAL.lng, rotLat: NEUTRAL.lat,
    tgtLng: NEUTRAL.lng, tgtLat: NEUTRAL.lat,
    scale:  0.92, tgtScale: 0.92,

    accents: [0, 0, 0, 0],   // per-country brightness 0..1
    beats:   [0, 0, 0, 0],   // per-country pulse 0..1

    visible: 0,
    spin: 0,                  // continuous degrees of decorative drift
    spinAdd: 0,               // current applied spin (so labels read same projection)

    readouts: [],
    booted: false,

    // Cached projection + path generator — mutated each frame via .rotate()
    // and .scale() rather than re-allocated. Saves GC pressure on the rAF loop.
    _proj: null,
    _path: null,
  };

  // ─── boot ────────────────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('p3globe');
    const stage  = document.getElementById('p3stage');
    if (!canvas || !stage) return;

    state.canvas = canvas;
    state.ctx = canvas.getContext('2d');

    // pre-bind readout elements
    state.readouts = COUNTRIES.map((c) => ({
      def: c,
      el: document.querySelector(`.p3-readout[data-iso="${c.iso}"]`),
    }));

    fetchTopo();
    resize();
    window.addEventListener('resize', resize);

    state.booted = true;
    requestAnimationFrame(tick);
  }

  async function fetchTopo() {
    // 50m is the right detail for a panel-sized globe; 110m looks coarse.
    const url = 'https://unpkg.com/world-atlas@2.0.2/countries-50m.json';
    try {
      const res = await fetch(url);
      const topo = await res.json();
      const fc = topojson.feature(topo, topo.objects.countries);
      state.countries = fc.features;
      // graticule: 30° meridians + parallels — faint structural lines
      state.graticule = d3.geoGraticule().step([30, 30])();
      // index targets
      for (const f of state.countries) {
        const def = COUNTRIES.find((c) => c.id === f.id);
        if (def) state.byIso[def.iso] = f;
      }
    } catch (e) {
      // silent — globe stays empty; still draws sphere + graticule? no, we'll
      // log once for the operator. No user-visible error chrome (Tron has no
      // dialog boxes).
      console.warn('[globe] topojson fetch failed', e);
    }
  }

  function resize() {
    const stage = document.getElementById('p3stage');
    if (!stage || !state.canvas) return;
    const r = stage.getBoundingClientRect();
    state.w = Math.max(320, r.width);
    state.h = Math.max(320, r.height);
    state.canvas.width  = Math.floor(state.w * state.dpr);
    state.canvas.height = Math.floor(state.h * state.dpr);
    state.canvas.style.width  = state.w + 'px';
    state.canvas.style.height = state.h + 'px';
  }

  // ─── math ────────────────────────────────────────────────────────────
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp    = (a, b, t) => a + (b - a) * t;
  const remap   = (x, a, b) => clamp01((x - a) / (b - a));
  // shortest-path angle lerp (handles ±180 wrap)
  function lerpAng(a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * t;
  }

  // ─── target writer (called by panels.js every scroll tick) ───────────
  // hold ∈ [0..1] across the panel's hold window.
  function setProgress(hold, visible) {
    state.visible = visible;

    // Four dwells spread through hold, separated by short interstitials.
    // [start, dwellEnd] is the country's "scroll block" — a wide window where
    // the globe stays parked on it so scrolling reads as a clear stopping
    // point; the brief gaps between are the inter-country rotation sweeps.
    const PHASES = [
      { start: 0.04, arrive: 0.12, dwellEnd: 0.28 }, // US
      { start: 0.34, arrive: 0.42, dwellEnd: 0.54 }, // UK
      { start: 0.60, arrive: 0.68, dwellEnd: 0.80 }, // BR
      { start: 0.86, arrive: 0.93, dwellEnd: 1.00 }, // IN — parks and holds to the end
    ];

    // Build a piecewise rotation target over the hold timeline.
    //   [0, P0.start)    : neutral
    //   [P0.start, P0.dwellEnd] : ease to US
    //   (P0.dwellEnd, P1.start) : interp US → UK
    //   ...
    //   (P3.dwellEnd, 1] : ease back to neutral
    let tgtLng = NEUTRAL.lng;
    let tgtLat = NEUTRAL.lat;
    let tgtScale = 0.92;

    if (hold < PHASES[0].start) {
      tgtLng = NEUTRAL.lng;
      tgtLat = NEUTRAL.lat;
      tgtScale = 0.92;
    } else if (hold > PHASES[3].dwellEnd) {
      const t = remap(hold, PHASES[3].dwellEnd, 0.98);
      tgtLng = lerpAng(COUNTRIES[3].lng, NEUTRAL.lng, t);
      tgtLat = lerp(COUNTRIES[3].lat, NEUTRAL.lat, t);
      tgtScale = lerp(1.05, 0.90, t);
    } else {
      for (let i = 0; i < 4; i++) {
        const ph = PHASES[i];
        if (hold >= ph.start && hold <= ph.dwellEnd) {
          // approaching or dwelling on country i
          tgtLng = COUNTRIES[i].lng;
          tgtLat = COUNTRIES[i].lat;
          tgtScale = 1.05;
          break;
        }
        if (i < 3) {
          const next = PHASES[i + 1];
          if (hold > ph.dwellEnd && hold < next.start) {
            const t = (hold - ph.dwellEnd) / (next.start - ph.dwellEnd);
            // ease-in-out for the inter-country sweep
            const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
            tgtLng = lerpAng(COUNTRIES[i].lng, COUNTRIES[i+1].lng, e);
            tgtLat = lerp(COUNTRIES[i].lat, COUNTRIES[i+1].lat, e);
            // gentle pull-back during the sweep so we see more of the globe
            tgtScale = 1.05 - Math.sin(e * Math.PI) * 0.10;
            break;
          }
        }
      }
    }

    state.tgtLng = tgtLng;
    state.tgtLat = tgtLat;
    state.tgtScale = tgtScale;

    // Per-country accent & beat — one bright country at a time.
    for (let i = 0; i < 4; i++) {
      const ph = PHASES[i];
      const inT  = remap(hold, ph.arrive - 0.04, ph.arrive + 0.01);
      const outT = remap(hold, ph.dwellEnd, ph.dwellEnd + 0.05);
      state.accents[i] = clamp01(inT) * (1 - clamp01(outT));

      // beat: gaussian centered ~40% through the dwell
      const mid  = ph.arrive + (ph.dwellEnd - ph.arrive) * 0.4;
      const half = (ph.dwellEnd - ph.arrive) * 0.55;
      const x = (hold - mid) / half;
      state.beats[i] = Math.exp(-x * x * 2.2);
    }
  }

  // ─── render loop ─────────────────────────────────────────────────────
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // continuous drift (deg/sec) — only applied while we are at neutral.
    state.spin += dt * 4;

    // exponential lerp toward target (frame-rate-aware-ish)
    const k = 1 - Math.pow(1 - ROT_LERP, dt * 60);
    const ks = 1 - Math.pow(1 - SCALE_LERP, dt * 60);
    let lngDelta = ((state.tgtLng - state.rotLng + 540) % 360) - 180;
    state.rotLng += lngDelta * k;
    state.rotLat += (state.tgtLat - state.rotLat) * k;
    state.scale  += (state.tgtScale - state.scale) * ks;

    // engage continuous drift only when we're not actively targeting a country
    const targetIsNeutral =
      Math.abs(state.tgtLng - NEUTRAL.lng) < 1 &&
      Math.abs(state.tgtLat - NEUTRAL.lat) < 1;
    state.spinAdd = targetIsNeutral ? state.spin : 0;

    render();
    updateReadouts();

    requestAnimationFrame(tick);
  }

  function projectionFor() {
    const radius = Math.min(state.w, state.h) * 0.42 * state.scale;
    if (!state._proj) {
      state._proj = d3.geoOrthographic().clipAngle(90);
      // path generator binds to the projection; pass context per render call.
    }
    state._proj
      .scale(radius)
      .translate([state.w / 2, state.h / 2])
      .rotate([-(state.rotLng + state.spinAdd), -state.rotLat, 0]);
    return state._proj;
  }

  function render() {
    const { ctx, w, h, dpr } = state;
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (state.visible < 0.01 || !state.countries) {
      ctx.restore();
      return;
    }

    const projection = projectionFor();
    if (!state._path) state._path = d3.geoPath(projection, ctx);
    else state._path.context(ctx); // ensure bound to this frame's canvas ctx
    const path = state._path;

    // ── black & white palette ──────────────────────────────────────────
    // 1. Sphere fill — barely a shade above pure black, so the limb reads.
    ctx.beginPath();
    path(state.sphere);
    ctx.fillStyle = 'rgba(14, 14, 16, 1)';
    ctx.fill();

    // 2. Graticule — hairline, faint
    ctx.beginPath();
    path(state.graticule);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // 3. All country outlines — hairline, dim
    ctx.beginPath();
    for (const f of state.countries) path(f);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
    ctx.lineWidth = 0.7;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 4. Active country fills + bright outlines
    for (let i = 0; i < COUNTRIES.length; i++) {
      const a = state.accents[i];
      if (a < 0.02) continue;
      const f = state.byIso[COUNTRIES[i].iso];
      if (!f) continue;
      ctx.beginPath();
      path(f);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.16 * a})`;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
      ctx.stroke();
    }

    // 5. Sphere limb on top — sharp hairline + soft white halo (edge glow)
    ctx.beginPath();
    path(state.sphere);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    path(state.sphere);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 6. Per-country beacon at centroid + expanding beat ring + leader line
    //    Leader runs from the country point radially outward to the readout.
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < COUNTRIES.length; i++) {
      const a = state.accents[i];
      if (a < 0.05) continue;
      const def = COUNTRIES[i];
      const viewCenter = [state.rotLng + state.spinAdd, state.rotLat];
      const angDist = d3.geoDistance(viewCenter, [def.lng, def.lat]);
      if (angDist > Math.PI / 2 - 0.02) continue; // back side
      const xy = projection([def.lng, def.lat]);
      if (!xy) continue;
      const beat = state.beats[i];

      // leader line outward
      const dx = xy[0] - cx, dy = xy[1] - cy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len, uy = dy / len;
      const r0 = 9;                              // starts past the dot
      const r1 = 64 + a * 6;                     // ends just before readout text
      ctx.beginPath();
      ctx.moveTo(xy[0] + ux * r0, xy[1] + uy * r0);
      ctx.lineTo(xy[0] + ux * r1, xy[1] + uy * r1);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * a})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // expanding beat ring
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 4 + beat * 40, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - beat) * a * 0.65})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // soft core glow under the dot
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.22})`;
      ctx.fill();

      // the dot itself
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 2.6 + beat * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.fill();
    }

    ctx.restore();
  }

  function updateReadouts() {
    if (!state.canvas) return;
    const projection = projectionFor();
    const cx = state.w / 2, cy = state.h / 2;

    for (let i = 0; i < state.readouts.length; i++) {
      const { def, el } = state.readouts[i];
      if (!el) continue;

      const viewCenter = [state.rotLng + state.spinAdd, state.rotLat];
      const angDist = d3.geoDistance(viewCenter, [def.lng, def.lat]);
      const a = state.accents[i];

      // hide far-side, also hide outside of any accent window (panel restraint:
      // only one rate visible at a time)
      if (angDist > Math.PI / 2 - 0.05 || a < 0.06) {
        el.style.opacity = '0';
        continue;
      }

      const xy = projection([def.lng, def.lat]);
      if (!xy) { el.style.opacity = '0'; continue; }

      // place the label past the leader endpoint, radially outward
      const dx = xy[0] - cx, dy = xy[1] - cy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len, uy = dy / len;
      const lx = xy[0] + ux * (76 + a * 8);
      const ly = xy[1] + uy * (76 + a * 8);

      el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = a.toFixed(3);
      el.classList.toggle('is-active', a > 0.55);
    }
  }

  // ─── expose ──────────────────────────────────────────────────────────
  window.__globe = {
    setProgress,
    // also expose for debugging / inspection
    _state: state,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
