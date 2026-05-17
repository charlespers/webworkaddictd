// panels.js — drives the two sweep-in panels and their scroll-driven
// internal animations.
//
// Scroll layout (body min-height: 1400vh):
//   0..1     vh  hero (driven by app.js)
//   1..3     vh  panel 1 (instant payouts) — coins build
//   3..4.5   vh  panel 2 (highest RPMs)    — cash drops, flap closes
//   4.5..9   vh  panel 3 (geo payouts)     — globe parks on US → UK → BR → IN
//   9..11.5  vh  panel 4 (retention)       — curve → bars → gauges → metrics
//  11.5..13  vh  close CTA — a hairline expands into a full-screen neon frame
//
// Every panel ends on a dwell (the gap between `build` and `exit`) — a scroll
// stop where the panel's final state holds before its wipe-out.
//
// Each panel has kind / start / span / enter / build / exit (all in
// slot-normalised qn 0→1). enter→build drives the internal animation; the
// gap between `build` and `exit` is a dwell where the final state holds.
// (panel 3 sets build === exit, so its globe arc maps the whole window.)

(function () {
  const story = document.getElementById("story");
  const panels = [
    // Every panel: wipe-in (0→enter), internal animation (enter→build), then a
    // dwell (build→exit) where the final state holds while you keep scrolling
    // — the "scroll stop" between acts — then wipe-out (exit→1).
    { el: document.querySelector('.panel-1'), kind: 'coins', start: 1.0, span: 2.0,
      enter: 0.10, build: 0.50, exit: 0.82 },
    { el: document.querySelector('.panel-2'), kind: 'wallet', start: 3.0, span: 1.5,
      enter: 0.16, build: 0.60, exit: 0.84 },
    // panel 3 — geo globe — 4.5-viewport slot; the globe parks on each country
    // (see globe.js PHASES) and holds on the last one through the end dwell.
    { el: document.querySelector('.panel-3'), kind: 'globe', start: 4.5, span: 4.5,
      enter: 0.07, build: 0.86, exit: 0.95 },
    // panel 4 — retention predictor — 2.5-viewport slot; curve → bars → gauges
    // → metrics resolve by `build`, then hold through a generous end dwell.
    { el: document.querySelector('.panel-4'), kind: 'retention', start: 9.0, span: 2.5,
      enter: 0.10, build: 0.74, exit: 0.94 },
    // close CTA — the glowing hairline expands into a full-screen neon frame,
    // then the CTA content resolves and holds (build 0.80 → 0.99 dwell).
    { el: document.querySelector('.cta'), kind: 'cta', start: 11.5, span: 1.5,
      enter: 0.12, build: 0.80, exit: 0.99 },
  ];
  const fx = document.getElementById("fx");
  const ctaEl = document.querySelector(".cta");

  const STACK_SIZES = [26, 36];   // [left small, right large] — ~10 coins taller per stack
  const FALL_PX = 240;            // how far above each coin starts before falling
  const COIN_STEP_PX = 11;        // vertical spacing per coin in stack (matches .coin bottom step)
  const COIN_HEIGHT_PX = 28;

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // ============================================================
  // PANEL 1 — build coin stacks (static markup)
  // ============================================================
  const panel1State = (function buildCoinStacks() {
    const stage = document.getElementById("p1stage");
    if (!stage) return null;
    const stackEls = stage.querySelectorAll(".p1-stack");
    const stacks = [];

    stackEls.forEach((stackEl, sIdx) => {
      const N = STACK_SIZES[sIdx] || 12;
      // make the bigger stack visually more "important" — wider footprint pad
      if (N > 14) stackEl.classList.add("p1-stack--big");

      const coins = [];
      // base coins (will be hidden until scroll progress reveals them)
      for (let i = 0; i < N; i++) {
        const c = document.createElement("div");
        c.className = "coin";
        c.style.setProperty("--i", i);
        // subtle alternating rotation so the stack reads as a stack of disks
        const rot = (i % 2 === 0 ? 0.7 : -0.7);
        c.style.setProperty("--rot", rot + "deg");
        // initial state: hidden above
        c.style.setProperty("--y", `-${FALL_PX}px`);
        c.style.setProperty("--opacity", 0);
        stackEl.appendChild(c);
        coins.push(c);
      }

      // top spinning coin — upright (face-on), rotates around its vertical axis,
      // always spinning. Rises as the stack fills.
      const spin = document.createElement("div");
      spin.className = "coin-face";
      spin.innerHTML = `
        <div class="cf-side cf-front">
          <svg class="cf-mark" viewBox="0 0 24 40" aria-hidden="true">
            <path d="M14 2 L7 22 L12.5 22 L9 38 L17 18 L11.5 18 Z" />
          </svg>
          <div class="gleam"></div>
        </div>
        <div class="cf-side cf-back">
          <svg class="cf-mark" viewBox="0 0 24 40" aria-hidden="true">
            <path d="M14 2 L7 22 L12.5 22 L9 38 L17 18 L11.5 18 Z" />
          </svg>
          <div class="gleam"></div>
        </div>
      `;
      spin.style.setProperty("--spin-bottom", "0px");
      stackEl.appendChild(spin);

      stacks.push({ el: stackEl, coins, spin, N });
    });

    return { stacks };
  })();

  function updatePanel1(p) {
    // p in [0, 1] = progress through panel 1's hold phase
    if (!panel1State) return;
    panel1State.stacks.forEach((stack) => {
      const N = stack.N;
      // span of scroll covered by ALL coins of this stack (leave some space at start/end)
      const buildStart = 0.04;
      const buildEnd   = 0.92;
      const perCoinSpan = (buildEnd - buildStart) / N;
      let cumPhase = 0;
      stack.coins.forEach((coin, i) => {
        const startT = buildStart + i * perCoinSpan;
        const span   = perCoinSpan * 1.2;   // each coin's fall takes a bit longer than its slot
        const phase  = clamp01((p - startT) / span);
        // ease-in for the fall (gains speed) — cubic
        const e = phase * phase * phase;
        coin.style.setProperty("--y", `${(1 - e) * -FALL_PX}px`);
        coin.style.setProperty("--opacity", phase.toFixed(2));
        cumPhase += phase;
      });
      // spinning coin sits ON TOP of however many coins have piled up.
      // The upright coin's bottom rests at the top edge of the side-view stack.
      const spinBottom = cumPhase * COIN_STEP_PX + COIN_HEIGHT_PX * 0.45;
      stack.spin.style.setProperty("--spin-bottom", spinBottom.toFixed(1) + "px");
    });
  }

  // ============================================================
  // PANEL 2 — wallet: scroll-driven cash drop + flap close
  // ============================================================
  const panel2State = (function () {
    return {
      cash: document.querySelector(".wallet-cash"),
      flap: document.querySelector(".wallet-flap"),
    };
  })();

  function updatePanel2(p) {
    if (!panel2State.cash || !panel2State.flap) return;

    // Phase 1: 0.00 → 0.45  cash falls in (-320px → 0), opacity 0 → 1
    // Phase 2: 0.45 → 0.55  cash settles (sits still)
    // Phase 3: 0.55 → 0.95  flap closes (140° → 0°)
    // Phase 4: 0.95 → 1.00  fully closed, held

    // Cash fall
    const fallStart = 0.00;
    const fallEnd   = 0.42;
    const fallP = clamp01((p - fallStart) / (fallEnd - fallStart));
    // ease-in for gravity
    const fe = fallP * fallP * (3 - 2 * fallP);
    // tiny bounce at landing
    let yPx = (1 - fe) * -320;
    if (fallP > 0.85) {
      const bounceT = (fallP - 0.85) / 0.15;
      const bounce = Math.sin(bounceT * Math.PI) * 6 * (1 - bounceT);
      yPx -= bounce;
    }
    panel2State.cash.style.setProperty("--cash-y", yPx.toFixed(1) + "px");
    panel2State.cash.style.setProperty("--cash-opacity", Math.min(1, fallP * 2.5).toFixed(2));

    // Flap close (140° → 0°)
    const closeStart = 0.55;
    const closeEnd   = 0.92;
    const closeP = clamp01((p - closeStart) / (closeEnd - closeStart));
    // ease-out cubic for a satisfying drop
    const ce = 1 - Math.pow(1 - closeP, 3);
    const flapRot = 140 * (1 - ce);
    panel2State.flap.style.setProperty("--flap-rot", flapRot.toFixed(1) + "deg");
  }

  // ============================================================
  // CLOSE CTA — a hairline expands into a full-screen neon frame
  // ============================================================
  function updateCta(p) {
    if (!ctaEl) return;
    // p 0→1 across the CTA hold window: the hairline grows in width, then in
    // height into a full frame, then the CTA content resolves inside.
    const w = smoothstep(0.00, 0.42, p);
    const h = smoothstep(0.38, 0.74, p);
    const c = smoothstep(0.74, 1.00, p);
    ctaEl.style.setProperty("--frame-w", w.toFixed(3));
    ctaEl.style.setProperty("--frame-h", h.toFixed(3));
    ctaEl.style.setProperty("--content", c.toFixed(3));
    ctaEl.classList.toggle("cta-live", c > 0.6);
  }

  // ============================================================
  // Master scroll handler
  // ============================================================
  function update() {
    const vh = window.innerHeight;
    const s = window.scrollY / vh;

    const storyOn = smoothstep(0.55, 1.0, s);
    story.style.setProperty("--story-on", storyOn.toFixed(3));

    if (fx) {
      const fxOp = 1 - smoothstep(0.85, 1.15, s);
      fx.style.opacity = fxOp.toFixed(3);
    }

    for (const p of panels) {
      if (!p.el) continue;
      // normalise scroll into this panel's slot: qn 0→1 across [start, start+span]
      const qn = (s - p.start) / p.span;
      const enter = smoothstep(0.0, p.enter, qn);
      const exit  = smoothstep(p.exit, 1.0, qn);
      p.el.style.setProperty("--enter", enter.toFixed(3));
      p.el.style.setProperty("--exit", exit.toFixed(3));
      const visible = qn > -0.05 && qn < 1.05;
      p.el.style.visibility = visible ? "visible" : "hidden";

      // internal animation runs from `enter` to `build`; past `build` it
      // clamps at 1 so the final state holds (the dwell) until the wipe-out
      const hold = clamp01((qn - p.enter) / (p.build - p.enter));
      // coins / wallet / cta are pure DOM writes — skip them while off-screen.
      // globe + retention are always notified so they can stand their own
      // render work down when not visible.
      if (p.kind === 'coins') { if (visible) updatePanel1(hold); }
      else if (p.kind === 'wallet') { if (visible) updatePanel2(hold); }
      else if (p.kind === 'globe' && window.__globe) {
        window.__globe.setProgress(hold, visible ? 1 : 0);
      }
      else if (p.kind === 'retention' && window.__retention) {
        window.__retention.setProgress(hold, visible ? 1 : 0);
      }
      else if (p.kind === 'cta') { if (visible) updateCta(hold); }
    }
  }

  // rAF-throttle scroll: collapse a burst of scroll events into one update per frame
  let scrollScheduled = false;
  function onScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => { scrollScheduled = false; update(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", update);
  update();
})();
