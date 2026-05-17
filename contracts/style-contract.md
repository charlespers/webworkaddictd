# Style Contract

The visual style system for addictd.ai (V3 — the Tron direction). This contract
is enforceable: a change that violates it is wrong, even if it renders correctly.

The reference implementation is the hero in `index.html` + `app.js`. Where a rule
here and the hero disagree, the hero is a bug to file — not a licence to break
the rule.

V3 is a clean break. The earlier "kinetic instrument / blueprint / shader-field"
brand from V1/V2 does **not** apply. The direction is **Tron**: a dark, electric,
precise surface built from futuristic lines, with sleekness maximized.

## 1. Tokens are the only source of truth

Every colour — and every value that recurs — lives as a CSS custom property in
the `:root` block of `index.html`. New code reads tokens; it never hard-codes.

- No raw hex, `rgb()`, `hsl()`, or `oklch()` literal may be introduced in new
  rules where a token exists or should exist.
- If you need a value with no token, add the token first, then use it.
- The current token set is the canonical palette. Adding a token is fine;
  re-defining `--bg`, `--ink`, `--ink-hot`, or `--text` is a brand change, out
  of scope for an implementation task.

The hero's source carries a few one-off `rgba(...)` literals inside shadows and
masks — inherited verbatim from the locked handoff. They are the exception a
faithful port grandfathered in, not a precedent for new code.

## 2. Colour — the black-purple Tron palette

Dark only. The page never inverts. There is no light theme and no
theme-conditional logic.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#000` | the ground — solid black, site-wide |
| `--ink` | `#9b5cff` | the core purple — the brand colour, the ink the shader paints |
| `--ink-hot` | `#c89bff` | the hot/light purple — accents, glints, the cursor core, glow |
| `--line` | `rgba(180,150,255,0.10)` | the faint structural hairline — grid, rules |
| `--line-hot` | `rgba(200,160,255,0.55)` | the lit structural line — HUD brackets, horizon, reticles |
| `--text` | `#d9d3ea` | type — a cool near-white, never pure `#fff` |
| `--wordmark` | `#ffffff` | the `addictd.ai` wordmark — crisp pure white (the one pure-white element; `--text` stays off-white for body type) |

The ground is a flat, solid black: `.stage` is filled with `var(--bg)` (`#000`)
and nothing else. No radial lift, no gradient, no aurora, no mesh layer. The Tron
elements — the grid floor, the horizon, the ink shader — read against pure black.

Purple is the only hue. No green, cyan, or amber "instrument" colours enter the
palette — that register belonged to the retired V1/V2 brand. One hue, many
values, is the discipline.

## 3. Typography

Two families, two registers — they do not blend:

- **`--mono`** (`ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace`) —
  the **HUD / system register**: corner labels, reticles, the scroll cue.
  Always uppercase, wide tracking (`0.18em`–`0.4em`), small (10–13px). It reads
  as machine readout, not prose.
- **`--sans`** (`"Inter", system-ui, ...`) — the **wordmark & prose register**.
  The `addictd.ai` wordmark (the page `<h1>` — see `design-features-contract.md`
  F13) is `--sans`, weight 600, lowercase, letter-spacing `0.06em`, in
  `--wordmark` white. Body prose, when it arrives, is also `--sans`.

Mono text in the HUD is decorative system-chrome — non-load-bearing. Any text
the reader must actually read holds at a real reading size (≥ 15px) in `--sans`.

## 4. The Tron line language

The style is built from **lines** — not boxes, cards, or fills:

- Structural lines are **hairlines**: 1px, low-opacity purple (`--line` /
  `--line-hot`). The perspective grid floor, the horizon, the HUD corner
  brackets, the reticle leads, and the logo ring all draw in this weight.
- The grid floor is a true CSS-3-D plane (`rotateX(64deg)`, 80px cells, a slow
  drift, masked at the horizon). It is the signature surface — do not flatten
  it to a 2-D background image.
- Corners and edges are **drawn open** — brackets, partial frames, tick leads —
  never closed rectangles. A closed box around content is a violation
  (`anti-slop-contract.md`).
- New structural elements reach for `--line` / `--line-hot` before inventing a
  weight or a colour.

## 5. Glow & neon discipline

Glow is the most abused element of a neon style. It is rationed:

- Glow is a **cast-light accent** — a bright edge that bleeds — permitted only
  where the hero uses it: the horizon line, the HUD pulse dots, the cursor core,
  the scroll-progress strip, the `addictd.ai` wordmark's faint halo, and the
  shader's ink rim / heat shimmer.
- Glow is **never** a wash behind text, never a halo on every element, never a
  full-card bloom. If more than a few small things glow in one viewport, one of
  them is wrong.
- Glow comes from a `box-shadow` or shader rim on a thin, bright source — not
  from a blurred filled shape.

## 6. Texture

The surface carries exactly one texture stack, already in the hero: **scanlines**
(a faint `repeating-linear-gradient`, `mix-blend-mode: screen`) and a **vignette**
(a radial darkening at the frame). Both are faint by intent — texture, not a
statement. No film-grain overlay, no second scanline pass, no noise turned up
"for edge."

## 7. The cursor

The native cursor is hidden (`cursor: none`) and replaced by the custom Tron
crosshair (`.cursor` — an SVG ring + ticks with a hot core). It is a brand
element, not a gimmick. On coarse pointers (`@media (hover: none)`) the native
cursor is restored and the `.cursor` crosshair element is hidden — the crosshair
is a fine-pointer affordance only.

## 8. Layout & the stage

- The hero is a single fixed, full-viewport **stage** — not a scrolling document
  of stacked sections.
- The logo sits dead-centre in a square footprint of `min(58vmin, 720px)`.
- The `addictd.ai` wordmark sits centred in the upper stage, above the logo —
  see `design-features-contract.md` F13.
- The `body` is `200vh` tall: the first `100vh` carries the hero and its
  scroll-driven exit; the second `100vh` is room for the incoming transition
  (`design-features-contract.md` F12). Scroll progress saturates at the first
  `100vh`.

## Why this exists

A dark site with a purple glow is the most generic thing a brief like this can
become. The style survives only by being **specific**: one hue, drawn in
hairlines, glow rationed, texture faint. Every loosened rule pulls the page back
toward the generic neon template. When in doubt, subtract — the design should
feel more restrained than "Tron" tempts you to be.

See also: `anti-ai-contract.md`, `anti-slop-contract.md`,
`design-features-contract.md`.
