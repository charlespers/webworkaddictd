# Design Features Contract

This contract enumerates the design features of the addictd.ai hero — what each
one is, how it behaves, and what may not change. It is the registry downstream
work checks against: an agent extending the site keeps these features intact and
coherent unless a clause here changes first.

Source of truth: `index.html` + `app.js`, a faithful 1:1 port of the Claude
Design handoff ("claude-logo-frame"). The handoff is the locked design.

This contract is enforceable. Removing or degrading a feature below — without a
clause here changing first — is a fail.

## The features

### F1 — The stage
A single fixed, full-viewport surface (`.stage`) on a solid black ground
(`var(--bg)` / `#000`; `style-contract.md` §2). Everything in the hero lives on
it. It is not a scrolling document of sections. On scroll it transforms as one
unit (see F11).

### F2 — Perspective grid floor
A CSS-3-D plane (`.floor` / `.floor-grid`): `rotateX(64deg)`, 80px cells in
`--line`, a 12s linear `floor-flow` drift, masked to fade into the horizon. The
signature Tron surface. It stays a true 3-D-transformed plane — not a flat
background image.

### F3 — Horizon line
A 1px lit line (`--line-hot`) across the vertical centre, with a soft glow.
Anchors the floor's vanishing perspective.

### F4 — Scanlines + vignette
The texture stack (`style-contract.md` §6): faint screen-blended scanlines and a
radial vignette. Faint by intent.

### F5 — HUD
Four open corner brackets, two mono labels (`SYS · ADDICTD // INIT 0.0.1` and
`SIG · LIVE`, each with a pulsing dot), and two edge reticles (`N 037`, `E 152`).
Decorative system-chrome in the mono register — the text is non-load-bearing and
intentionally not real copy — the page's only real copy is the F13 wordmark.

### F6 — The logo + ink-reveal shader  *(the centerpiece)*
The addictd logo, centered in a `min(58vmin, 720px)` square, rendered by a
Three.js 0.160.0 WebGL pipeline in `app.js`:
- Two logo textures — `assets/logo-black.png` (default) and
  `assets/logo-purple.png` (revealed).
- A ping-pong FBO **ink simulation**: curl-noise advection + per-frame decay, a
  soft Gaussian splat at the cursor, motion-smear along cursor velocity.
- A **composite shader**: cross-fades black→purple by the ink mask,
  curl-noise-displaces the purple sample for a fluid look, adds a hot neon rim
  where the ink gradient is steep, and an inner heat shimmer.
- An **entrance pulse** at center on load, so the effect is visible immediately.

Constraints: **exactly one WebGL context** on the page. The `#fx` canvas spans
the full viewport (so ink can roam) but the shader `discard`s outside the logo
footprint. The logo *is* the ink shader — do not substitute a CSS image-swap.

### F7 — The logo ring
Concentric outline rings around the logo (`.ring` + pseudo-elements): one static
hairline, one dashed and one dotted, counter-rotating slowly (`spin` 60s / 100s).
Subtle framing, not a focal element.

### F8 — Custom crosshair cursor
The native cursor is hidden; `.cursor` (SVG ring + ticks + hot core) follows the
pointer. On coarse pointers (`@media (hover: none)`) the native cursor is
restored and the `.cursor` element is hidden — see `style-contract.md` §7.

### F9 — Scroll-progress strip
A 2px neon strip (`.progress`) pinned to the top, its width driven by scroll
progress.

### F10 — Scroll cue
A bottom-centered mono "scroll" label with a dripping bar (`drip` 2.2s), inviting
the scroll that triggers F11.

### F11 — The scroll-driven hero exit
As scroll progress `p` runs 0→1 across the first viewport (`app.js` `onScroll`):
the shader `uFlood` floods the logo fully purple; the stage blurs, scales down,
translates up, and fades; the logo is pulled downward and shrinks. This **is**
the "logo disappears" — it must remain intact, because the incoming transition
(F12) depends on it.

### F12 — The incoming transition  *(feature-in-design — do not build)*
The next transition: as the reader scrolls down, the logo disappears (F11) and
**an element enters from the left**. Its design is being produced separately and
is **out of scope** until delivered.

What exists for it now, and must be preserved:
- `#section-2` in `index.html` — a clean, empty, `overflow:hidden` `<section>`
  at `100vh`, ready to host the left-entering element.
- The marked **"SECTION 2 — incoming transition hook"** in `app.js` `onScroll`,
  where scroll progress `p` is available to drive the reveal.
- The `min-height: 200vh` on `body`: the first `100vh` is the hero's
  scroll-driven exit (F11); the second `100vh` is `#section-2`'s own viewport.
  `onScroll` clamps scroll progress `p` to `0→1` over the first `100vh` only —
  wiring F12 across the second `100vh` will need its own scroll mapping.

Do not fill `#section-2`, repurpose the hook, or remove the scroll room until the
F12 design lands.

### F13 — The addictd.ai wordmark
The site wordmark — the page's `<h1>` (`<h1 class="wordmark">addictd.ai</h1>`),
inside `.stage`, centred in the upper stage above the logo mark (F6). Lowercase,
`--sans` weight 600, letter-spacing `0.06em`, in `--wordmark` white (`#fff`) with
a faint Tron halo (`text-shadow`). It is `pointer-events: none` display chrome;
as a child of `.stage` it exits with the hero on scroll (F11 — blur / scale /
fade). It is the page's only `<h1>` and its only real copy — the HUD text (F5)
stays decorative.

## Deferred hardening  *(the later "elevate" pass)*

Carried verbatim from the handoff and intentionally **not** addressed in the
faithful 1:1 port. To be picked up when the design moves past "concept":

- **`prefers-reduced-motion`** — currently unhandled. The floor drift, ring spin,
  HUD pulse, scroll-cue drip, and the shader rAF loop all run unconditionally. A
  reduced-motion path should freeze them to a static frame.
- **WebGL-unavailable fallback** — if the context fails, the logo silently does
  not render. A static `logo-black.png` fallback should be shown.
- **Three.js delivery** — loaded from the unpkg CDN via importmap. Vendor it
  locally for a production build (a third-party CDN is a runtime dependency).
- **Texture weight** — `logo-black.png` (~0.81 MB) and `logo-purple.png`
  (~1.0 MB) are 1200×1200 PNGs; compress and resize before production.

## How to use this contract

Before a change merges, walk F1–F12: does it keep every feature it touches
behaving as described? If it removes or weakens one, either a clause here changes
first — a real design decision, made with the user — or the change is wrong. New
features get a new `F#` entry here.

See also: `style-contract.md`, `anti-ai-contract.md`, `anti-slop-contract.md`.
