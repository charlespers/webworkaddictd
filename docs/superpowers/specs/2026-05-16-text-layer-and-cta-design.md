# addictd.ai V3 — Text Layer + Close CTA — Design

_Date: 2026-05-16_

## Goal

V3 is currently a near text-free "killer visuals" landing page (Tron aesthetic,
hero logo + three scroll panels: coins / wallet / globe). This adds a deliberate
typographic layer — hero copy, a name for each act — plus a final call-to-action
section.

## 1. Text style

- **Typeface:** Michroma, loaded via a Google Fonts `<link>` in `index.html`
  `<head>` (Michroma ships weight 400 only — the outline treatment carries the
  visual weight, so that is sufficient).
- **Two registers:**
  - **Display (neon outline / "light-ribbon"):** `UPPERCASE`, transparent fill,
    ~1px stroke `-webkit-text-stroke: 1.1px rgba(228,210,255,0.95)`, layered
    purple glow `text-shadow: 0 0 9px rgba(155,92,255,0.85), 0 0 28px
    rgba(124,47,237,0.6), 0 0 58px rgba(124,47,237,0.4)`, letter-spacing ~0.12em.
    Used for: hero headline, the three act labels, the CTA button.
  - **Micro:** Michroma, `UPPERCASE`, small (~10px), tracked (~0.2–0.4em), dim
    solid fill (`rgba(220,205,255,0.5–0.8)`), no outline, no glow. Used for: the
    hero byline, the hero tagline, the CTA secondary link.
- The globe's mono CPM readouts and the panel chrome (brackets, wipe line) keep
  their existing fonts — this is a separate brand layer, not a global retheme.

## 2. Hero copy

Three lines added inside the hero `.stage`:

- `CLIPPING` — display style, centered **above** the logo.
- `By Addictd` — micro, centered **below** the logo.
- `Real campaigns. Real views. Real money.` — micro, tracked, below the byline.

Because the copy lives inside `.stage`, it inherits the existing scroll
transform — it blurs / scales / fades out with the logo as the hero exits.
On load it does a gentle fade + glow-in (~0.8s), suppressed under
`prefers-reduced-motion`. The logo stays large; copy sits in the top / bottom
margins (logo may take a minor size trim if it crowds).

## 3. Act labels — layout System B

- Remove the `01 / 02 / 03` corner tag (`.idtag`) markup from all three panels.
- Add a left-aligned, vertically-centered, multi-line **display-style** label to
  each act:
  - panel-1 → `INSTANT PAYOUTS`
  - panel-2 → `HIGHEST RPMS`
  - panel-3 → `PAID FOR YOUR AUDIENCE`
- "Name left, visual right" for every act:
  - panel-1 (coins) already sits right — the label drops into its empty left half.
  - panel-2 (wallet) and panel-3 (globe) shift right-of-center to clear the left
    ~40% for the label. The globe canvas is sized from the `#p3stage` rect and
    its readouts are positioned relative to it, so shifting the stage element
    keeps the globe internals correct (CSS-only change expected).
- Each label reveals with its panel's wipe — opacity/transform tied to the
  existing `--enter` CSS custom property the panel already exposes.

### 3a. Act 1 — extra content (payment platforms)

Act 1's left block carries more than just the name. Below `INSTANT PAYOUTS`:

- A micro sub-line: `Fast payouts, where you're familiar`.
- A row of payment-platform logos beneath it. Based on the platforms Whop
  supports for payouts/checkout (bank/ACH, crypto, Venmo, Cash App, Apple Pay,
  PayPal), the proposed set is: **Whop · Apple Pay · PayPal · Cash App · Venmo ·
  Crypto (Bitcoin)**.
- Logos are **monochrome** (white/grey) inline SVGs — full-colour brand marks
  would clash with the deliberately black-&-white coin panel and the hairline
  Tron palette. Sourced as SVG path data from an open icon set (Simple Icons,
  CC0); any logo not available there is drawn as a simple monochrome wordmark.
- The logo row sits in a single line, evenly spaced, dim by default; it reveals
  with the panel wipe alongside the label.
- Acts 2 and 3 keep just their name (no sub-line, no logos).

## 4. Close CTA section

A new final section after panel-3, using the call to action from **V1's**
`Act4.tsx` ("the close"):

- **Content:** primary CTA link `Get paid` (display neon-outline style);
  secondary quiet link `agency login` (micro). Both `href="#"` placeholders
  until real destinations are provided. A visually-hidden `<h2>` "Join addictd"
  for accessibility. **No footer.**
- **Animation:** scroll-driven. A glowing horizontal hairline appears centered;
  as the section scrolls in it expands outward into a full-screen rectangular
  neon frame (glowing border filling the viewport). The CTA content resolves
  (fades/scales in) inside the frame. This is V3's take on V1's one-shot CTA
  "pop". Suppressed/relaxed under `prefers-reduced-motion`.
- The CTA becomes interactive (pointer-events enabled) once resolved.

## 5. Scroll structure

- `panels.js`: add a CTA slot after panel-3. Current panel-3 is `start 4,
  span 4` → occupies `[4,8]`. CTA: `start 8, span ~1.5` → `[8,9.5]` (the
  hairline expands over the first part, then the full-screen CTA dwells for the
  rest so it stays readable/clickable), with a new `kind: 'cta'` dispatch.
- The CTA slot replaces the current `[8,9]` empty outro buffer.
- `index.html`: `body min-height` `900vh → ~1000vh` (≈9.5 slots of scroll plus
  a short tail). Update layout comments.

## Files touched

- `index.html` — Michroma `<link>`; hero copy markup; act-label markup; remove
  `.idtag`s; CTA section markup; `body min-height`.
- `panels.css` — display + micro text classes; hero copy CSS; act-label CSS;
  panel-2 / panel-3 repositioning; CTA section CSS + hairline-expand animation.
- `panels.js` — CTA scroll slot + dispatch; act-label reveal wiring if not pure
  CSS; updated layout header comment.
- `globe.js` — only if the panel-3 stage shift needs a JS tweak (expected none —
  CSS-only).
- `app.js` — no changes expected.

## Out of scope

- Real CTA destinations (placeholders only).
- A page footer / legal links.
- Retheming existing HUD / globe readout typography.

## Risks / open decisions

- **Hero crowding:** the logo is large (`min(78vmin,940px)`); headline above +
  copy below must fit. Mitigate by positioning copy in the hero margins and, if
  needed, a small logo size trim.
- **Panel-3 shift:** verify the globe still centers correctly within the
  shifted, narrower stage and that readout leader-labels stay on-canvas.
