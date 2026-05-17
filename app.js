// addictd.ai — initial concept
// Ink-reveal shader: black logo base, purple version revealed where the mouse trails,
// with curl-noise displacement for a smoky / fluid feel.
//
// Pipeline per frame:
//   1) Ink pass    — advect + decay a single-channel "ink" texture; inject ink at
//                    the mouse position when it overlaps the logo footprint
//   2) Composite   — sample logo-black and logo-purple textures, blend by ink mask
//                    (with curl-noise warp on the purple sample for fluid distortion)

import * as THREE from "three";

const fx = document.getElementById("fx");
const stage = document.getElementById("stage");
const logoWrap = document.getElementById("logoWrap");
const progressEl = document.getElementById("progress");
const cursor = document.getElementById("cursor");

const dpr = Math.min(window.devicePixelRatio || 1, 2);

const renderer = new THREE.WebGLRenderer({
  canvas: fx,
  alpha: true,
  premultipliedAlpha: false,
  antialias: false,
});
renderer.setPixelRatio(dpr);
renderer.setClearColor(0x000000, 0);

// Two scenes / cameras: a sim scene (writes to FBO) and a composite scene (renders to canvas).
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const outScene = new THREE.Scene();

// --- Load logo textures
const loader = new THREE.TextureLoader();
const logoBlack = loader.load("assets/logo-black.png");
const logoPurple = loader.load("assets/logo-purple.png");
[logoBlack, logoPurple].forEach((t) => {
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
});

// --- Ink FBOs (ping-pong)
function makeFBO(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
}
let SIM_W = 0, SIM_H = 0;
let fboA, fboB;

// --- Sim shader: advect previous ink, decay, splat at mouse
const simMat = new THREE.ShaderMaterial({
  uniforms: {
    uPrev: { value: null },
    uMouse: { value: new THREE.Vector2(-9, -9) },     // in [0..1] over the logo square
    uMouseVel: { value: new THREE.Vector2(0, 0) },
    uMouseInside: { value: 0 },
    uTime: { value: 0 },
    uDt: { value: 1 / 60 },
    uRadius: { value: 0.085 },
    uStrength: { value: 0.95 },
    uDecay: { value: 0.985 },          // multiplicative per-frame
    uAdvect: { value: 0.6 },           // how much we move pixels via curl noise
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uPrev;
    uniform vec2 uMouse;
    uniform vec2 uMouseVel;
    uniform float uMouseInside;
    uniform float uTime;
    uniform float uDt;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uDecay;
    uniform float uAdvect;

    // hash + value noise (cheap)
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i);
      float b = hash(i+vec2(1.,0.));
      float c = hash(i+vec2(0.,1.));
      float d = hash(i+vec2(1.,1.));
      vec2 u = f*f*(3.-2.*f);
      return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
    }
    // 2d curl of a scalar potential = divergence-free velocity field
    vec2 curl(vec2 p){
      float e = 0.01;
      float n1 = vnoise(p + vec2(0., e));
      float n2 = vnoise(p - vec2(0., e));
      float n3 = vnoise(p + vec2(e, 0.));
      float n4 = vnoise(p - vec2(e, 0.));
      float dx = (n1 - n2) / (2.*e);
      float dy = (n3 - n4) / (2.*e);
      return vec2(dy, -dx);
    }

    void main() {
      // advection: where did this pixel come from?
      vec2 flow = curl(vUv * 4.0 + uTime * 0.15) * 0.0035 * uAdvect;
      // bias flow slightly upward — ink rises like smoke
      flow.y += 0.0008;
      vec2 src = vUv - flow;
      vec4 prev = texture2D(uPrev, src);

      // decay
      prev *= uDecay;

      // splat at mouse (a soft Gaussian)
      float d = distance(vUv, uMouse);
      float falloff = exp(- (d*d) / (uRadius*uRadius));
      float deposit = uStrength * falloff * uMouseInside;

      // mouse velocity inflates the brush slightly along travel direction (motion smear)
      float speed = length(uMouseVel);
      float smear = exp(- pow(distance(vUv, uMouse - uMouseVel*0.6) / (uRadius*1.4), 2.0)) * uMouseInside;
      deposit += smear * speed * 0.9;

      // store ink in .r; channel .g stores "heat" which fades faster (used for edge sparkle)
      float ink = clamp(prev.r + deposit, 0.0, 1.5);
      float heat = clamp(prev.g * 0.92 + deposit * 1.4, 0.0, 1.5);

      gl_FragColor = vec4(ink, heat, 0.0, 1.0);
    }
  `,
});

const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat);
simScene.add(simQuad);

// --- Composite shader: draws into the page canvas
//   - covers the full viewport but only samples the logo where the logo square sits.
//   - displaces the purple sample by curl-noise scaled by ink strength → fluid look
//   - adds a hot-edge rim where ink gradient is high → Tron neon
const outMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uInk: { value: null },
    uBlack: { value: logoBlack },
    uPurple: { value: logoPurple },
    uLogoMin: { value: new THREE.Vector2(0, 0) }, // logo bbox in viewport-uv coords [0..1]
    uLogoMax: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uFlood: { value: 0 }, // 0..1 driven by scroll → fills entire logo with purple
    uPixel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uInk;
    uniform sampler2D uBlack;
    uniform sampler2D uPurple;
    uniform vec2 uLogoMin, uLogoMax;
    uniform float uTime;
    uniform float uFlood;
    uniform vec2 uPixel;

    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i);
      float b = hash(i+vec2(1.,0.));
      float c = hash(i+vec2(0.,1.));
      float d = hash(i+vec2(1.,1.));
      vec2 u = f*f*(3.-2.*f);
      return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
    }
    vec2 curl(vec2 p){
      float e = 0.01;
      float n1 = vnoise(p + vec2(0., e));
      float n2 = vnoise(p - vec2(0., e));
      float n3 = vnoise(p + vec2(e, 0.));
      float n4 = vnoise(p - vec2(e, 0.));
      return vec2((n1-n2)/(2.*e), -(n3-n4)/(2.*e)) * 0.5;
    }

    void main() {
      // skip work outside logo box
      vec2 lo = uLogoMin, hi = uLogoMax;
      if (vUv.x < lo.x || vUv.x > hi.x || vUv.y < lo.y || vUv.y > hi.y) {
        discard;
      }
      vec2 lUv = (vUv - lo) / (hi - lo);   // 0..1 inside logo square

      // sample ink (same coord system: logo-local)
      float ink = texture2D(uInk, lUv).r;
      float heat = texture2D(uInk, lUv).g;

      // mix with scroll flood (purple takes over uniformly)
      float reveal = clamp(max(ink, uFlood), 0.0, 1.0);

      // displace the purple sample using curl noise, scaled by reveal so static black stays clean
      vec2 disp = curl(lUv * 6.0 + uTime * 0.4) * 0.022 * smoothstep(0.05, 1.0, reveal);
      // also pinch toward mouse slightly via gradient of ink (cheap: sample neighbors)
      vec2 px = uPixel;
      float ir = texture2D(uInk, lUv + vec2(px.x, 0.)).r;
      float il = texture2D(uInk, lUv - vec2(px.x, 0.)).r;
      float iu = texture2D(uInk, lUv + vec2(0., px.y)).r;
      float id = texture2D(uInk, lUv - vec2(0., px.y)).r;
      vec2 grad = vec2(ir - il, iu - id);
      disp += grad * 0.06;

      vec4 black = texture2D(uBlack, lUv);
      // higher-contrast logo: lift shadow detail + gain so the dark carbon
      // texture stays legible against the pure-black hero
      black.rgb = pow(black.rgb, vec3(0.68)) * 1.45;
      vec4 purple = texture2D(uPurple, clamp(lUv + disp, vec2(0.0), vec2(1.0)));

      // soften reveal edges + add a hot rim where the ink gradient is high
      float edge = clamp(length(grad) * 18.0, 0.0, 1.0) * (1.0 - uFlood);
      float r = smoothstep(0.02, 0.55, reveal);

      // base = black logo, where ink → cross-fade to purple
      vec4 col = mix(black, purple, r);
      // add neon edge glow only on the actual logo pixels (alpha mask intersection)
      float mask = max(black.a, purple.a);
      vec3 rim = vec3(0.78, 0.45, 1.0) * edge * mask * 1.4;
      col.rgb += rim;

      // subtle inner heat shimmer (Tron-y)
      col.rgb += vec3(0.55, 0.28, 0.95) * heat * 0.12 * mask;

      col.a = mask;

      gl_FragColor = col;
    }
  `,
});

const outQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat);
outScene.add(outQuad);

// ----- Layout / sizing
let W = 0, H = 0;
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  renderer.setSize(W, H, false);

  // sim resolution: keep small for perf, square-ish based on the logo footprint
  const r = logoWrap.getBoundingClientRect();
  const sim = Math.max(160, Math.min(512, Math.floor(Math.min(r.width, r.height) * dpr * 0.6)));
  if (sim !== SIM_W) {
    SIM_W = SIM_H = sim;
    if (fboA) fboA.dispose();
    if (fboB) fboB.dispose();
    fboA = makeFBO(SIM_W, SIM_H);
    fboB = makeFBO(SIM_W, SIM_H);
    outMat.uniforms.uPixel.value.set(1 / SIM_W, 1 / SIM_H);
  }
  updateLogoBox();
}

function updateLogoBox() {
  const r = logoWrap.getBoundingClientRect();
  // logoWrap may be transformed by scroll; clamp to viewport-uv
  const x0 = r.left / W;
  const x1 = (r.left + r.width) / W;
  // three's UV origin is bottom-left; DOM is top-left → invert Y
  const y1 = 1 - r.top / H;
  const y0 = 1 - (r.top + r.height) / H;
  outMat.uniforms.uLogoMin.value.set(x0, y0);
  outMat.uniforms.uLogoMax.value.set(x1, y1);
}

window.addEventListener("resize", resize);

// ----- Mouse / pointer
const mouse = {
  pos: new THREE.Vector2(-9, -9),     // logo-local UV
  prev: new THREE.Vector2(-9, -9),
  vel: new THREE.Vector2(0, 0),
  inside: 0,
  screenX: -9, screenY: -9,
};

window.addEventListener("pointermove", (e) => {
  mouse.screenX = e.clientX;
  mouse.screenY = e.clientY;
  const r = logoWrap.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width;
  const v = 1 - (e.clientY - r.top) / r.height;
  mouse.pos.set(u, v);
  // inside the logo square footprint? (a small margin lets ink seep at edges)
  const m = 0.06;
  mouse.inside = (u > -m && u < 1 + m && v > -m && v < 1 + m) ? 1 : 0;

  // custom cursor — arrow tip anchored exactly at the pointer
  cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});
window.addEventListener("pointerleave", () => { mouse.inside = 0; });

// ----- Scroll → drive the hero exit (flood + stage transform).
// The incoming story panels are driven separately in panels.js.
function onScroll() {
  const y = window.scrollY;
  const p = Math.min(1, y / window.innerHeight);
  progressEl.style.width = (p * 100).toFixed(2) + "%";

  // hero stage parallaxes / scales out
  const sc = 1 - p * 0.18;
  const fade = 1 - Math.pow(p, 1.6);
  stage.style.transform = `translateY(${-p * 30}vh) scale(${sc})`;
  stage.style.filter = `blur(${p * 8}px)`;
  stage.style.opacity = String(Math.max(0, fade));

  // logo gets sucked downward as we scroll, leaving a streak
  logoWrap.style.transform = `translate(-50%, calc(-50% + ${p * 25}vh)) scale(${1 - p * 0.4})`;

  // flood the purple in as we scroll (drives the shader uniform)
  outMat.uniforms.uFlood.value = Math.min(1, p * 1.25);

  updateLogoBox();
}
// rAF-throttle scroll: at most one onScroll (which reads layout) per frame
let scrollRaf = false;
window.addEventListener("scroll", () => {
  if (scrollRaf) return;
  scrollRaf = true;
  requestAnimationFrame(() => { scrollRaf = false; onScroll(); });
}, { passive: true });

// ----- Render loop
let last = performance.now();
let read = null, write = null;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Once the hero has scrolled away the fx canvas is faded out (see panels.js).
  // Skip the WebGL sim + composite entirely while it's off-screen so the
  // downstream panels (esp. the globe) get the full frame budget — the rAF
  // stays alive so the effect resumes the moment the hero scrolls back in.
  if (window.scrollY < window.innerHeight * 1.3) {
    // velocity (logo-uv per frame)
    mouse.vel.set(mouse.pos.x - mouse.prev.x, mouse.pos.y - mouse.prev.y);
    mouse.prev.copy(mouse.pos);

    if (!read) { read = fboA; write = fboB; }

    simMat.uniforms.uPrev.value = read.texture;
    simMat.uniforms.uMouse.value.copy(mouse.pos);
    simMat.uniforms.uMouseVel.value.copy(mouse.vel);
    simMat.uniforms.uMouseInside.value = mouse.inside;
    simMat.uniforms.uTime.value = now * 0.001;
    simMat.uniforms.uDt.value = dt;

    renderer.setRenderTarget(write);
    renderer.render(simScene, orthoCam);
    renderer.setRenderTarget(null);

    // composite
    outMat.uniforms.uInk.value = write.texture;
    outMat.uniforms.uTime.value = now * 0.001;
    renderer.render(outScene, orthoCam);

    // swap
    const t = read; read = write; write = t;
  }

  requestAnimationFrame(frame);
}

resize();
onScroll();
requestAnimationFrame(frame);

// ----- Initial entrance: a 1s ink sweep across the logo on load, so the
// hover-reveal effect announces itself before the visitor touches anything.
(function entrance() {
  const DURATION = 1000; // ms
  let start = 0;
  function tick(now) {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / DURATION);
    // ease in-out across the run
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // sweep left→right with a gentle vertical arc so the ink trails across
    mouse.pos.set(0.12 + e * 0.76, 0.5 + Math.sin(e * Math.PI) * 0.13);
    mouse.inside = 1;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      mouse.inside = 0;
      mouse.pos.set(-9, -9);
    }
  }
  // small delay so the logo textures have loaded
  setTimeout(() => requestAnimationFrame(tick), 350);
})();
