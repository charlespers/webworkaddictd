# Anti-AI Contract

This contract exists so the site does not read as **AI-generated**. The hero is a
real design with a point of view; it must not drift into the look a language
model produces when handed "make a sleek futuristic AI landing page."

This contract is enforceable. It reduces to one test:

> Could a stranger tell this page was designed by a person making specific
> choices — rather than generated from a generic prompt? If not, it fails.

The reference implementation is `index.html` + `app.js`.

## The tells we refuse

Every item below is an AI default. None of them ship.

### Surface & colour tells

- The **purple→blue diagonal "AI gradient"** as a 2-D wash — behind text, on a
  hero, on a card, anywhere. addictd's purple is a single hue across the ground
  and the ink; never a diagonal two-colour wash.
- **Glassmorphism** — frosted translucent panels, `backdrop-filter: blur()` on a
  nav or a card.
- **Neumorphism** — soft inset/outset "puffy" shapes.
- **Mesh gradients** and blurred colour-blobs behind content.
- **Aurora backgrounds**, drifting colour fog, a second ambient glow layer on
  top of the ground.
- **Iridescent 3-D orbs**, glassy chrome spheres, generated "hero objects."

### Iconography & imagery tells

- **Brain glyphs, robot heads, bot mascots, chat-bubble icons, neural-network
  blobs** — the whole "this is AI" icon vocabulary.
- **Sparkles** — ✨, four-point stars, "magic" glints scattered as decoration.
- A **padlock or shield** standing in for "secure," a gear for "settings," a
  rocket for "launch."
- **Stock 3-D renders**, AI-generated illustration, photoreal globes.

### Structure tells

- The **centred-headline + centred-subhead + two-centred-buttons** hero.
- A **"powered by AI" badge**, a glowing chip, a shimmering "✦ New" pill.
- Section after section in the same centred-text-then-grid rhythm.

(The concrete layout / motion / copy slop list lives in `anti-slop-contract.md`.
This contract is the *why* — those shapes read as machine-made.)

## The shader must read as an instrument, not a screensaver

The WebGL ink-reveal (F6 in `design-features-contract.md`) is the highest-risk
element: WebGL on a landing page is itself an AI-era cliché. It earns its place
only by being **specific and responsive**:

- It responds to a **real input** — the cursor. It is not an ambient loop
  playing to no one.
- It must never read as a **screensaver, a lava lamp, or a generic 2024-era
  WebGL hero** — the purple-and-blue aurora-wash kind. It reads as ink on a
  surface, reacting.
- No second WebGL canvas, no particle field, no cursor-spotlight bloom is added
  beside it.

## Specificity over genericity

- Commit to **Tron**. Half-committing — Tron lines *plus* a glass card *plus* a
  gradient button — produces exactly the generic result this contract exists to
  stop.
- Every element answers "why is this here, in this exact form?" If the honest
  answer is "it's what these pages have," cut it.
- Motion must **mean** something — the ink follows the cursor; the flood follows
  the scroll. Motion with no referent is decoration, and decoration is where
  AI-default creeps back in.

## Restraint is the tell-breaker

A model **adds**. A designer **removes**. The most reliable way to stop looking
AI-generated is to ship fewer elements, each more deliberate. When a change adds
something, the reviewer asks what it removed.

## Why this exists

"Looks like AI made it" is now a specific, recognisable failure — and it is the
default outcome of this exact brief (dark, futuristic, purple, WebGL). The page
stays credible only by refusing the defaults on this list and choosing, visibly,
on purpose.

See also: `anti-slop-contract.md`, `style-contract.md`,
`design-features-contract.md`.
