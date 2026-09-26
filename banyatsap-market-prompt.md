# Build this site as a single HTML file: BANYATSAP — Smart Market Management & AI Risk Detection

You are an expert creative front-end developer. Produce a **single self-contained `index.html`**
that builds the project below **exactly** — same layout, copy, visuals, motion and interaction.
Pure HTML/CSS/JS in one file: no build step, no framework, no bundler. ES modules inline in a
`<script type="module">`. **three.js and Lenis are the only external code**, pulled through an
import map; the spring solver, the shared ticker, the scroll triggers, the text reveals, the
sticky stack, the inspection-route trace, the halftone floor plan, the stall-grid dissolves, the
contour backdrops, the meter chart and the loader are all written by hand. Hardcode every value
given here as a fixed constant. Where this document quotes code, use it as it stands — every number
in it is the shipped default. Nothing in it is a suggestion.

**There are no image, model or texture assets.** Every visual on the page — the 3D market, the
floor plan, the charts, the receipts — is generated procedurally from the data model in §0. Do not
reference any external image URL. Do not use placeholder photos.

## What it is

A one-page showcase for **Banyatsap Market (ตลาดบัญญัติทรัพย์)** — a management system for a
140-stall fresh market that issues monthly rent/water/electricity bills and uses Machine Learning
for two jobs: **Risk Scoring** (logistic regression predicting which tenants will pay late) and
**Meter Anomaly Detection** (catching abnormal water/electricity readings before a bill is issued).

A light art-directed sheet: one near-white ground (`#f6f8f7`), near-black copy, one green accent
(`#19d38f` — fresh produce and money), one risk colour (`#ff5230`) used **only** for high-risk data,
and near-black panels that come and go per section. Two faces — **Kanit** (display, bold, for the
masthead, section heads and figures) and **IBM Plex Sans Thai** (everything conversational — nav,
meta rows, panel copy). Latin labels are uppercase; Thai is never uppercased (CSS `text-transform`
has no effect on Thai, but keep it off Thai runs anyway).

Five blocks. The first three are a **stack**: each pins at the top of the viewport and the next one
comes out over it, the covered one receding — scaling to 0.9 and darkening to 55% black — rather
than scrolling away. The pipeline block is the last layer, so it covers but is never covered.

1. **Hero** — masthead, the market's name at 96px, meta rows, two bracket-cornered panels and an
   actions row, laid over a full-bleed WebGL scene: **the market itself, as 140 instanced stalls**
   on an isometric floor, drawn in quiet ink on the paper ground. The page opens behind a loading
   veil (a receipt silhouette filling from the top and a 4px meter along the foot). When it lifts,
   an **AI scan front** sweeps across the market left-to-right, lifting every stall to its risk
   height and colouring it, then settles back to ink. From then on the risk data exists **only where
   the cursor has just been**: the pointer's recent path is a liquid-edged lens that raises and
   colours the stalls under it. Animated contour lines roll across the whole block behind it.
2. **ความเสี่ยงค้างชำระ (Payment risk)** — the first dark surface. The seam with the hero is the
   **stall grid coming apart**: the light ground carries into the dark block as solid rows, breaks
   into a checkerboard of stall-sized squares and burns off as you scroll. Behind the copy, a
   1440×800 **floor plan**: a halftone dot field forming the three zones, dashed aisle axes that
   crawl, a hub (the market office) with three rings and a slow ping. When the block arrives an
   **inspection route** traces through every aisle in one 6-second walk — a green line with an
   additive glow and a white filament at its head, slowing at corners — lighting four zone markers.
   After that the cursor becomes a **reticle** that snaps to the nearest stall and shows its tenant
   card with the ML risk score.
3. **จากมิเตอร์ถึงใบแจ้งหนี้ (The pipeline)** — seven stepped-corner plates on near-black, stacked
   with no gap, a rail down the middle with a white progress thread and a square marker that turns
   five times over the block. Each plate holds a **live procedural mini-visual** of one pipeline
   stage. Step numbers assemble letter by letter then settle to 40%. Hovering one plate dims the rest.
4. **มิเตอร์ผิดปกติ (Meter anomalies)** — back to light: a 96px masthead, a report paragraph, a
   chamfered dark button, and a large **raw-vs-cleaned comparison chart** with a draggable divider,
   melting into a dark band carrying the five-cycle **billing calendar strip** with crawling dashed
   connectors, a live-cycle bracket and a pulse. The same contour field rolls behind it (2D canvas,
   marching squares).
5. **ตลาดที่รู้ล่วงหน้า. (A market that knows ahead)** — the sign-off: a green page edge with a
   near-black panel inset 16 inside it, the contours in white at 10%, a stack of three receipt cards
   rising back into place as the page bottoms out, the nav column resolving letter by letter, the
   legal row along the foot.

Everything that moves is a spring (damped: `tension`, `friction`, `mass 1`). Nothing on the page is
a CSS keyframe; the only CSS transitions are hover colour, the plates' inset and the button floods.

## Page shell & libraries

```html
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Banyatsap — ตลาดบัญญัติทรัพย์</title>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
    "lenis": "https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.mjs"
  }
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">
</head>
```

`<body>` in IBM Plex Sans Thai. `history.scrollRestoration = "manual"` and `window.scrollTo(0, 0)`
before anything else — the page opens behind a veil and always starts at the top.

### Thai typography rules (non-negotiable)

- **Leading.** Thai carries tone marks and upper vowels above the cap line and lower vowels below
  the baseline. Never set Thai below `line-height: 1.15`. Latin-only display runs (figures, `P1`,
  `01`) may use 0.9 / 0.72 as specified; any run containing Thai uses the `--leading-thai` token.
- **Word reveals.** Thai has no spaces. Authored Thai strings in this document are pre-segmented
  with `|` — split on `|`, never on spaces, and never with a regex over the characters.
- **Letter reveals.** Split with `new Intl.Segmenter("th", { granularity: "grapheme" })` — never
  `split("")`, which tears combining vowels and tone marks off their consonants.
- **No `overflow` clip** on any reveal container — it shaves tone marks.

### Tokens — the whole palette and type scale

```css
:root {
  /* Tier 1 — the only place a literal appears */
  --raw-paper-50: #f6f8f7;        /* page ground */
  --raw-paper-100: #e8ecea;       /* backdrop contour lines */
  --raw-paper-200: #dbe1de;       /* hairlines */
  --raw-steel-400: #b3bdb8;       /* muted copy on dark */
  --raw-ink-950: #0b0d0c;         /* body copy, darkest surface */
  --raw-ink-900: #111513;
  --raw-ink-800: #1c211f;
  --raw-ink-700: #2b322f;
  --raw-ink-alpha-40: rgb(11 13 12 / 0.4);
  --raw-slate-500: #6f7773;       /* floor plan halftone */
  --raw-slate-600: #4b524e;       /* floor plan axes, inner ring */
  --raw-slate-900: #1f2421;       /* floor plan outer rings */
  --raw-green-400: #19d38f;       /* accent */
  --raw-green-alpha-25: rgb(25 211 143 / 0.25);
  --raw-red-500: #ff5230;         /* high risk — data only */
  --raw-amber-400: #ffb020;       /* medium risk — data only */
  --raw-stone-600: #505552;       /* pipeline plate outline */
  --raw-white-alpha-10: rgb(255 255 255 / 0.1);
  --raw-white-alpha-20: rgb(255 255 255 / 0.2);
  --raw-white-alpha-40: rgb(255 255 255 / 0.4);
  --raw-ink-alpha-08: rgb(11 13 12 / 0.08);
  --raw-white: #ffffff;

  /* Tier 2 — roles */
  --background: var(--raw-paper-50);
  --foreground: var(--raw-ink-950);
  --foreground-muted: var(--raw-ink-alpha-40);
  --surface-black: var(--raw-ink-950);
  --surface-dark: var(--raw-ink-900);
  --surface-soft: var(--raw-paper-200);
  --contour-light: var(--raw-paper-100);
  --foreground-on-dark: var(--raw-white);
  --foreground-on-dark-muted: var(--raw-steel-400);
  --foreground-on-dark-faint: var(--raw-white-alpha-40);
  --border-muted: var(--raw-paper-200);
  --map-dot: var(--raw-slate-500);
  --map-grid: var(--raw-slate-600);
  --map-grid-ghost: var(--raw-slate-900);
  --plate-outline: var(--raw-stone-600);
  --plate-fill: var(--raw-white-alpha-10);
  --rail: var(--raw-white-alpha-20);
  --meter-contour: var(--raw-ink-alpha-08);
  --footer-contour: var(--raw-white-alpha-10);
  --accent: var(--raw-green-400);
  --accent-muted: var(--raw-green-alpha-25);
  --risk-high: var(--raw-red-500);
  --risk-mid: var(--raw-amber-400);

  --type-impact: 6rem;      /* hero name */
  --type-display-lg: 4.375rem;
  --type-display: 3.25rem;
  --type-heading: 2.375rem; /* figures */
  --type-title: 1.25rem;
  --type-lead: 1.125rem;
  --type-label: 1rem;
  --type-body: 0.875rem;
  --type-eyebrow: 0.75rem;
  --type-display-sm: 3.4375rem; /* section mastheads */

  --leading-headline: 0.95;  /* Latin only */
  --leading-flat: 0.9;       /* Latin only */
  --leading-cap: 0.72;       /* Latin figures only */
  --leading-thai: 1.2;
  --leading-thai-display: 1.12;

  --duration-fast: 150ms; --duration-normal: 250ms; --duration-plate: 700ms;
  --ease-entrance: cubic-bezier(0.2, 0, 0, 1);
  --ease-plate: cubic-bezier(0.33, 0, 0, 1);
  --font-sans: "IBM Plex Sans Thai", system-ui, sans-serif;
  --font-display: "Kanit", "IBM Plex Sans Thai", sans-serif;
}
body { background: var(--background); color: var(--foreground); min-height: 100lvh; margin: 0; font-family: var(--font-sans); }
```

No dark-mode override: the theme is fixed and each block chooses its own surface.

### Root font-size bands

```css
html { font-size: 16px; }
@media (max-width: 1920px) { html { font-size: 0.833333vw; } }
@media (max-width: 1440px) { html { font-size: 1.111111vw; } }
@media (max-width: 1279px) { html { font-size: 16px; } }
```

Above 1920 write `16 * innerWidth / 1920` px to `<html>` on resize. The pipeline, meter and footer
blocks measure themselves in **`cqw`** off their own `container-type: inline-size` section — one
design pixel is `px(v) = (v / 1440 * 100).toFixed(4) + "cqw"` — so they are the 1440 frame at every
width. Type in those blocks uses `type(v) = max(px(v), var(--type-min, 0px))`; sections set
`--type-min: 13px` below 1024. Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, and
`short` = `(max-height: 500px)`.

## 0 — The data model (everything visual reads from this)

One seeded PRNG so every reload draws the same market:

```js
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let rand = mulberry32(2569);
```

**Layout — three zones, 140 stalls, in the 1440×800 artboard.** Stall `34×26`, gap `8`, and an
aisle of `22` inserted after every second column and after every second row inside a zone.

| zone | Thai name | cols × rows | origin (x, y) | goods mix |
|---|---|---|---|---|
| A | โซนอาหารสด | 8 × 6 = 48 | (160, 210) | ผักผลไม้, เนื้อสัตว์, อาหารทะเล |
| B | โซนอาหารปรุงสำเร็จ | 13 × 4 = 52 | (590, 150) | อาหารตามสั่ง, ขนม, เครื่องดื่ม |
| C | โซนของใช้ทั่วไป | 10 × 4 = 40 | (590, 470) | เสื้อผ้า, ของใช้, โทรศัพท์ |

Stall ids are `A-01 … A-48`, `B-01 … B-52`, `C-01 … C-40`, numbered row-major. The market office
(the hub) sits at `(1278, 400)`; the entrance at `(96, 700)`.

**Per-stall features** (generate in id order, from `rand`):

```js
stall = {
  id, zone, x, y, w: 34, h: 26,                       // artboard rect
  goods,                                              // pick from the zone's mix
  rent: zone === "A" ? 3200 : zone === "B" ? 4200 : 2600,  // บาท/เดือน
  lateCount: Math.floor(Math.pow(rand(), 2.2) * 7),   // late payments, last 12 cycles
  avgDaysLate: +(rand() * 12).toFixed(1),
  tenureMonths: 3 + Math.floor(rand() * 90),
  meterSpikes: Math.floor(Math.pow(rand(), 3) * 5),   // flagged readings, last 6 cycles
  arrears: 0,                                         // set below
};
stall.arrears = stall.lateCount > 3 ? Math.round(stall.rent * (0.3 + rand() * 1.2)) : 0;
```

**Risk score — logistic regression, fixed weights (the "trained model"):**

```js
const W = { bias: -3.1, lateCount: 0.62, avgDaysLate: 0.11, tenure: -0.018, spikes: 0.35, arrears: 0.00042 };
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
stall.risk = sigmoid(
  W.bias + W.lateCount * stall.lateCount + W.avgDaysLate * stall.avgDaysLate +
  W.tenure * stall.tenureMonths + W.spikes * stall.meterSpikes + W.arrears * stall.arrears
);
stall.band = stall.risk >= 0.6 ? "high" : stall.risk >= 0.3 ? "mid" : "low";
```

Every count shown on the page (`ความเสี่ยงสูง`, `ค้างชำระ`, `% ชำระตรงเวลา`) is **computed from this
array**, never typed in — so the numbers on the page always agree with the map. Colour by band:
`low → --accent`, `mid → --risk-mid`, `high → --risk-high`.

**Tenant display names** are generated, not real: `ร้าน` + one of
`["ป้าแดง","เจ๊หมวย","ลุงสมชาย","พี่นก","น้องเอ","ครัวบ้านสวน","สดใส","ทองดี","มีสุข","รุ่งเรือง","ใจดี","บุญมา"]`
+ ` ` + goods. Duplicates are fine.

## The motion engine you write

**One rAF loop.** A reference-counted ticker: subscribers register `(callback, getFramerate)`; each
frame the loop walks a snapshot of the set and calls a subscriber only when
`time - last > getFramerate()` (`0` runs every tick; `1000/60 - 2` gives 60 on a 60Hz screen and
every second tick at 120). It starts on the first subscriber and cancels on the last. **Lenis runs
from this loop, registered first**, so every scroll reader sees this frame's `scrollY`:

```js
import Lenis from "lenis";
const lenis = new Lenis({ smoothWheel: true });
subscribe((time) => lenis.raf(time), () => 0);
```

Under `prefers-reduced-motion: reduce` skip Lenis and let the platform scroll.

**The spring** — state `{ value, velocity }`, stepped at 1ms substeps up to a 64ms frame cap:

```js
const stepSpring = (s, target, { tension, friction }, dtMs) => {
  const steps = Math.min(64, Math.max(1, Math.round(dtMs)));
  for (let i = 0; i < steps; i++) {
    const force = -tension * (s.value - target);
    const damping = -friction * s.velocity;
    s.velocity += (force + damping) * 0.001;   // mass 1
    s.value += s.velocity * 0.001;
  }
  const eps = s.precision ?? 0.01;              // 0.001 for opacity-like ranges
  s.resting = Math.abs(s.velocity) < eps && Math.abs(target - s.value) < eps;
  if (s.resting) { s.value = target; s.velocity = 0; }
};
```

Every animated thing is one of these driven toward a target, with a `delayIn` before it starts.
Three modes: `always` (to `to` while enabled, back to `from` when not), `once` (plays in once, never
replays), `forward` (plays in when enabled; when the element's top is above the viewport top it
holds `to` rather than reversing — track `scrolledDown = rect.top <= 0`).

Spring configs, by name: `REVEAL {90, 26}`, `ROW/ITEM {170, 24}`, `SHEET {190, 26}`,
`FIGURE {200, 24}`, `TYPE {210, 24}`, `STEP {190, 24}`, `COPY {110, 26}`, `NAME {190, 24}`,
`VEIL {70, 24}`, `CLEAR {140, 26}`, `PROGRESS waiting {10, 30} / ready {170, 26}`,
`STEP_SETTLE {32, 26}`, `TRIGGER {140, 30}`, `LIFT {120, 14}` (the hero stalls — underdamped on
purpose so a stall overshoots a little when it rises). `{ duration, easing }` is a plain tween.

**Text reveals.** Split into words (on `|` for Thai, on spaces for Latin) or letters (grapheme
segmenter), each unit an `inline-block` span running `{ opacity 0, y 0.35em } → { 1, 0 }` for words
and `{ 0, 0.3em } → { 1, 0 }` for letters. Unit *i* starts at `delayIn + i * stagger`. Container
`display: flex; flex-wrap: wrap; column-gap: 0.3em` (Thai word units use `column-gap: 0` — Thai is
set without spaces). Keep a visually-hidden plain copy for assistive tech (the `|` removed) and mark
animated spans `aria-hidden`.

**Scroll triggers.** Read the element's rect inside the ticker (framerate 10ms):

```js
const poses = {
  top_top: bb.top, center_top: bb.top + bb.height / 2, bottom_top: bb.bottom,
  top_bottom: bb.top - vh, center_bottom: bb.top + bb.height / 2 - vh, bottom_bottom: bb.bottom - vh,
  top_center: bb.top - vh / 2, center_center: bb.top + bb.height / 2 - vh / 2, bottom_center: bb.bottom - vh / 2,
};
const scrollStart = poses[start], scrollEnd = poses[end];
const length = Math.abs(scrollStart - scrollEnd);
const progress = Math.min(Math.max(0, 1 - (scrollStart + length) / length), 1);
```

A **scrub** interpolates `from → to` by `progress` and applies it immediately; a **toggle** snaps
at `progress >= 1`. Keep an `interpolatedProgress` spring (0–1) for readers that want the smoothed
value. Every trigger and every canvas only computes while its element is in view **plus ten frames
after it leaves** (an `IntersectionObserver` gate). An **in-view gate** (`once`) uses `rootMargin`
`0% 0% -25% 0%` for pipeline rows and `0% 0% -20% 0%` for the calendar strip.

### The sticky stack

Wrap the first three blocks in `position: relative; background: var(--surface-black)`. Each layer is
`position: sticky; top: 0` with `z-index` 0 / 10, except the last (the pipeline), which is
`position: relative; z-index: 20`. Inside each pinned layer: an inner wrapper
(`transform-origin: center`) holding the block, then a full-bleed `absolute inset-0` shade,
`background: var(--surface-black); opacity: 0; pointer-events: none`. A passive scroll listener
coalesced into one rAF:

```js
const RECEDE_SCALE = 0.9, RECEDE_SHADE = 0.55;
const phone = matchMedia("(max-width: 639px)");
const apply = () => {
  const view = innerHeight || 1;
  const shrink = phone.matches ? 0 : 1 - RECEDE_SCALE;
  for (const { inner, shade, next } of pinned) {
    const p = Math.min(1, Math.max(0, 1 - next.getBoundingClientRect().top / view));
    inner.style.transform = p > 0 && shrink > 0 ? `scale(${1 - shrink * p})` : "";
    inner.style.willChange = p > 0 && shrink > 0 ? "transform" : "";
    shade.style.opacity = `${RECEDE_SHADE * p}`;
    inner.style.visibility = p >= 1 ? "hidden" : "visible";
  }
};
```

The transform lives on the inner wrapper, never on the sticky element, and is cleared at rest (a
`scale(1)` would make the layer the containing block for the fixed loading veil).

### Shared pieces

**Bracket panel** — no border, no fill, four 10×10 corner strokes, one path drawn four ways:
`viewBox="0 0 10.5 10.5"`, `M0 0.5H10V10.5`, `stroke: currentColor`, top-right as drawn, top-left
`scaleX(-1)`, bottom-left `scale(-1)`, bottom-right `scaleY(-1)`.

**Chamfered button** — `W×50`, chamfer 8 bottom-right. Path `M0.5 0.5H{W-0.5}V42L{W-8} 49.5H0.5Z`
in an SVG `preserveAspectRatio="none"`: a body (fill per use), an accent **flood** (same path,
`transform-origin: left; scaleX(0) → scaleX(1)` on hover, 250ms `--ease-plate`), an accent ring.
Label accent → `--surface-black` on hover; arrow `M0 5.35H13M8 10.35L13 5.35L8 0.35` stepping
`translateX(0.25rem)` on hover (150ms).

**Stall-grid dissolve (the seams).** A canvas band `absolute inset-x-0 top-0; height: 34svh;
pointer-events: none`, scrubbed `"top bottom" → "top top"` (`TRIGGER`). Its cells are stall-sized.

```js
const CELL = 26, SOLID_UNTIL = 0.16, LIFT = 2, ACCENT_SHARE = 0.06;
const noise = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
// render(): ratio = min(devicePixelRatio, 2); surface = carry === "light" ? --background : --surface-black
const columns = Math.ceil(width / CELL), rows = Math.ceil(height / CELL), lift = progress * LIFT;
for (let y = 0; y < rows; y++) {
  const depth = y / Math.max(1, rows - 1) + lift;
  if (depth > 1) break;
  const solid = depth <= SOLID_UNTIL;
  const fade = Math.max(0, Math.min(1, 1 - (depth - SOLID_UNTIL) / (1 - SOLID_UNTIL)));
  if (!solid && fade <= 0) break;
  for (let x = 0; x < columns; x++) {
    if (!solid) {
      if ((x + y) % 2 !== 0) continue;
      if (noise(x, y) > fade) continue;
    }
    ctx.fillStyle = !solid && noise(x + 101, y + 57) < ACCENT_SHARE ? accent : surface;
    ctx.fillRect(x * CELL, y * CELL, CELL - 2, CELL - 2);   // the 2px gap makes each square read as a stall
  }
}
```

Used on the risk block (`carry="light"`, z 10), the pipeline (`carry="light"`, z 30) and the meter
block (`carry="dark"`, z 30). Re-render on resize and on every progress change.

**The contour field** — one analytic field shared by the hero shader and both 2D canvases:

```js
const LINE_SCALE = 3.8, LINE_COUNT = 2.5, WAVE_AMOUNT = 0.37, WAVE_SPEED = 1.66, LINE_OPACITY = 0.85;
const field = (x, y, t) => {
  let f = Math.sin(x * 1.0 + t * 0.6) * 0.5;
  f += Math.sin(y * 0.85 - t * 0.45) * 0.45;
  f += Math.sin((x + y) * 0.65 + t * 0.35) * 0.35;
  f += Math.sin((x - y) * 0.95 - t * 0.55) * 0.25;
  return f * 0.5 + 0.5;
};
// displaced sample: q = p + (sin(p.y*0.8 + t*0.7), cos(p.x*0.7 - t*0.6)) * WAVE_AMOUNT
// iso-lines at level = 0.5, 1.5 (halfway between integers of field(q) * LINE_COUNT)
```

On a 2D canvas draw it with **marching squares** over a 96-cell grid (long edge; short edge keeps
cells square), redrawn at 24ms while in view, `lineWidth 1`, `globalAlpha LINE_OPACITY`, handling
all 16 cases including the two saddles (5 and 10 draw two segments).

## 1 — The hero

`<section data-hero>` — `position: relative; isolation: isolate; min-height: 100lvh; overflow: hidden; background: var(--background)`.
Layers bottom up: the scene canvas (`absolute inset-0; pointer-events: none`), a copy ramp below
`xl`, the loading veil (`position: fixed`), the content column.

**From `xl`**: content column `min-height: 100lvh; display: flex; flex-direction: column; padding: 1.5rem`
(`sm` 2rem sides). Masthead on top; a middle row `flex: 1; display: flex; align-items: center; justify-content: space-between`
with the identity left (max width 28rem) and the two panels right in a 13.625rem column; the actions
row on the foot. **Below `xl`**: a column — masthead, identity, panels (hidden below `sm`), actions;
the scene's camera pulls back 15% and aims lower so the market sits in the bottom 65% of the section;
a ramp (`absolute inset-x-0 bottom-0; height: 22%`) eases the paper back in under the copy.

### The masthead

`<header>` flex, space-between, `z-index: 30`.
- Logo: an inline SVG wordmark — a 22×22 rounded square in `--foreground` holding a 3×3 grid of
  4×4 paper squares with the centre one in `--accent` (a stall grid with one stall flagged), then
  `BANYATSAP` in Kanit 700, 1.125rem, tracking 0.04em. Links `/`.
- Nav (from `xl`): `position: absolute; left: 50%; transform: translateX(-50%)`, `gap: 3.5rem`,
  `--type-label`, hover accent over 150ms: `ภาพรวม` → `#overview`, `ความเสี่ยง` → `#risk`,
  `กระบวนการ` → `#pipeline`, `มิเตอร์` → `#meter`, `ติดต่อ` → `#contact`.
- Right (from `xl`): `[ แดชบอร์ด → ]` bold; brackets and arrow `aria-hidden`.
- Below `xl`: a burger (two 1px lines 1.5rem wide, 0.3125rem apart) opening a **full-screen sheet**
  appended to `<body>`: `position: fixed; inset: 0; z-index: 50; background: var(--background)`,
  fading in with `SHEET`; the five links plus แดชบอร์ด in Kanit 700 `--type-heading`,
  line-height `--leading-thai-display`, each rising `{0, 0.75rem} → {1, 0}` with `ITEM` at
  `120 + i * 55`. Stop Lenis and lock scroll while open; focus the close button; `Escape` closes;
  close automatically when the viewport crosses 1280.

### The identity (left rail)

```
market_140                        ← --type-label, uppercase, --foreground-muted
ตลาด|บัญญัติทรัพย์                  ← h1, Kanit 700, --type-impact, line-height 1.12
■ นนทบุรี · 3 โซน                  ← meta rows, --type-lead, line-height 1.2, gap 0.5rem
■ 140 แผงค้า · บิลรายเดือน
■ ML RISK SCORING · v2.1
```

- The h1 reveals **word by word on `|`** (`wordStagger 110`, `REVEAL`, `once`). Size
  `--type-display-lg` by default, `md` `--type-impact`, `lg` back to `--type-display-lg`, `xl`
  `--type-impact`. Latin subtitle under it: `SMART MARKET MANAGEMENT` in `--type-label`, uppercase,
  tracking 0.18em, `--foreground-muted`, fading in at `+320`.
- Meta-row icons are 0.75rem squares: `--foreground`, `--foreground`, `--accent`.
- Entrance (from the veil's handover): the id fades at `+180`; the name's words at `+180`; each
  meta row rises `{0, 0.75rem} → {1, 0}` at `180 + 260 + i * 130`.

### The two panels (right rail)

A column, `gap: 2rem`, width `13.625rem` from `md`. Each a bracket panel, `padding: 1rem`.

**Panel 1 — next billing cycle.** Eyebrow `รอบบิลถัดไป` (`--type-eyebrow`, weight 600, accent).
A `<dl>` (`--type-body`, line-height 1.2, gap 0.375rem, `margin-top: 1rem`): `<dt>` bold
`ตุลาคม 2569`, `<dd>` `ออกบิล 140 ใบ`, `<dd><time datetime="2026-10-01">1 ต.ค. 2569</time></dd>`.
Then a **mini floor plan** (`6.25rem × 4.375rem`): an inline canvas drawing all 140 stalls from §0
scaled to fit, as 1px-gapped rectangles in `--foreground` at 20% opacity, with every high-risk stall
in `--risk-high` at full opacity.

**Panel 2 — this cycle.** Eyebrow `สถานะรอบนี้`. A three-up `<dl>` (`grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1.5rem`):
`<dt>` `--type-eyebrow`, nowrap — `แผง`, `เสี่ยงสูง`, `ตรงเวลา`; `<dd>` Kanit 600 `--type-heading`,
line-height 0.72, tracking −0.06em — `140`, the computed high-risk count (colour `--risk-high`), the
computed on-time share as `NN%` (on-time = stalls with `lateCount <= 1`). Letter by letter
(`letterStagger 26`, `FIGURE`, `delayIn i * 90`, forward).

The panel column rises `{0, 1.25rem} → {1, 0}` with `REVEAL` at `+900`.

### The actions row (foot)

From `sm` a `grid-template-columns: 1fr auto 1fr; align-items: end; gap: 2rem` row, rising with
`REVEAL` at `+1500`:
- **Demo cue** (hidden below `sm`): a 2rem circle outline with a play triangle, then two lines:
  `ดูการทำงานของโมเดล` (weight 500, hover accent) over `02:10` (`--foreground-muted`). Links `#pipeline`.
- **CTA** `เข้าสู่แดชบอร์ด` → `#contact`: chamfered button 220×50 measured in em off its 20px label
  (`height: 2.5em; width: 11em`), body fill `var(--surface-dark)`, accent label, accent brackets at
  the four corners (`M205 49.5H213L219.5 42V36 · M212 0.5H219.5V7 · M8 0.5H0.5V7 · M7.5 49.5H0.5V42.5`).
- **Credits** (hidden below `sm`), right-aligned, `--type-body`: `KMITL`, `GITHUB`, `LINE OA`.

### The loading veil

`position: fixed; inset: 0; z-index: 50; background: var(--background)`, centred column,
`role="status"`, `aria-label` "กำลังโหลด" → "โหลดเสร็จแล้ว". Centre: a `6rem × 8.5rem` box clipped to
a **receipt silhouette** — `clip-path: polygon(...)` with a straight top and a zig-zag bottom edge of
8 teeth — holding a faint shell (`--foreground` at 12%) and a solid sheet
(`--foreground; transform-origin: top`) whose `scaleY` **is the progress**. Three 1px paper lines
cross the receipt at 30/45/60% height so it reads as a bill. Under it, `margin-top: 1.75rem`,
`BANYATSAP` in `--type-lead`, tracking 0.18em, rising `{0, 0.6rem} → {1, 0}` with `{110, 26}` at
`+260`. A 4px meter along the foot: track `--border-muted`, fill `--foreground`, `scaleX = progress`.

**Progress is not measured** — it creeps to **0.7** on `PROGRESS waiting` and completes to **1** on
`PROGRESS ready` the moment the scene reports `ready`. The exit runs in three beats: on `ready` the
veil's content clears (opacity 1→0, `translateY(-0.75rem)`, `CLEAR`); **430 + 240 ms** later the
veil lifts (`VEIL`) **and the page's entrance begins** (every `+N` above is measured from here; the
scene's `beginScan()` is called on the same tick). Remove the veil element only when its rendered
opacity is `<= 0.004` (poll `getComputedStyle` each frame; 3000ms timeout backstop).

## 2 — The hero scene (WebGL)

One canvas, plain three.js: `WebGLRenderer({ alpha: false, antialias: desktop, stencil: false })`,
clear colour read from `--background`, `ACESFilmicToneMapping`, DPR capped per tier (mobile 1,
tablet 1.25, desktop 1.5). Tier: `mobile` if width < 768 or (coarse pointer and width < 1024),
`tablet` if coarse or width < 1280, else `desktop`. Re-read on width change or pointer-class change.

**Camera.** `PerspectiveCamera(30, aspect, 0.1, 100)` at `(0, 11, 13)` looking at `(0.6, 0, 0.4)` —
an elevated three-quarter view of the floor. Artboard → world: `wx = (x - 720) / 90`,
`wz = (y - 400) / 90`.

**The floor.** A `PlaneGeometry` 18×11 on `y = 0` with a `ShaderMaterial`: `--background` base, the
aisle grid as 1px lines in `--surface-soft` (every 22 artboard px along aisles only — derive from the
layout), the three zone outlines as dashed lines in `--foreground` at 25%, and zone labels
`A · โซนอาหารสด` etc. drawn once into a `CanvasTexture` and mapped beside each zone.

**The stalls — one `InstancedMesh`**, `BoxGeometry(1, 1, 1)` translated so its base sits at y 0,
140 instances placed from §0 (width `34/90`, depth `26/90`), base height `0.12`.
`MeshStandardMaterial({ roughness: 0.85, metalness: 0 })` lit by a `HemisphereLight` (sky
`#ffffff`, ground `#d9dfdc`, 1.4) and one `DirectionalLight` (1.1) from `(-6, 12, 4)` with no
shadows. Per-instance colour via `setColorAt`.

Each stall owns two springs, stepped on the CPU every frame:
- `lift` (config `LIFT`) → target height `0.12 + stall.risk * 1.6 * reveal`
- `tint` (config `ROW`) → target `reveal` (0 = ink, 1 = band colour)

Colour = `mix(ink #1c211f, bandColour, tint)`. Write `instanceMatrix` (scale-y = lift) and
`instanceColor` each frame, flagging `needsUpdate` only when any spring is moving.

**`reveal` per stall** is `max(scanReveal, lensReveal)`:

- **The scan (entrance).** From `beginScan()`, a front `f` runs `-0.2 → 1.2` over **2.8s**,
  ease-in-out sine, across the stalls' normalised x (`(x - 160) / (1182 - 160)`). A stall is revealed
  while `x_n < f` and **un-revealed again 0.55 behind the front** — so a band of lifted, coloured
  stalls travels across the market and leaves it quiet. Stalls inside the band's leading 0.06 get a
  white-hot tint (`mix(band, #ffffff, 0.6)`) — the scan's glow. When the front exits, the lens takes
  over.
- **The lens (after the scan).** Keep the last **48** smoothed pointer positions (the pointer is
  lerped at `0.17` per frame) projected onto the floor plane by raycasting. For each stall compute
  its distance to the **polyline** of that history; each link weighted `pow(1 - i/47, 1.9)`; the
  lens radius is `1.1` world units scaled by **pace** (eased pointer speed: attack 0.09, release
  0.205, peak 0.029 NDC/frame) — `radius * mix(0.35, 1.0, pace)`. A stall is revealed when
  `weight * smoothstep(r, r * 0.35, dist) > 0.08`. A resting cursor still reveals a small patch
  (pace floor 0.35) — unlike a pure hover effect, the reader must always be able to inspect.
- On touch, the pointer is parked at the market office and a slow idle sweep drives the lens along
  zone A → B → C every 6s. On the mobile tier, skip the lens entirely after the scan.

**Hover tag.** The stall nearest the cursor (within 0.5 world units) gets a floating HTML tag
positioned by projecting its top to screen: `A-12 · ร้านป้าแดง ผักผลไม้ · RISK 74%` in
`--type-eyebrow`, `--surface-black` fill, white text, the risk figure in its band colour, a 1px
leader line down to the stall. Springs in/out with `ITEM`.

**Tilt.** The whole market group yaws `±3°` and pitches `±2°` with the cursor at the window edges,
through two cascaded `0.17` lerps (a lean, not a snap), and slides `0.02 × pointer` world units.

**The backdrop.** A full-frustum plane behind the floor (re-scaled to the frustum each frame) drawing
the contour field in a fragment shader in `--contour-light` on `--background`, using `fwidth` on the
**unwrapped** field for a crisp 1.4-px stroke. Where the lens is active, the bands between contour
lines under it alternate two greys (`0.62` / `0.44` linear) — the lens's shadow on the paper.

**Ready.** After materials compile (`renderer.compileAsync`) and one throwaway frame renders, fire
`onReady`. The render loop runs on the shared ticker (desktop every tick, touch tiers `1000/60 - 2`)
only while the hero is in view, the tab is visible, and `scrollY <= innerHeight * 1.15`. Reduced
motion: skip the scan, show the settled quiet market, lens off.

**Fallback.** If WebGL is unavailable, draw the floor plan in 2D (the same stall rects, high-risk in
red) in the hero's box and let the veil lift immediately.

## 3 — ความเสี่ยงค้างชำระ (Payment risk)

`<section id="risk">` — `position: relative; isolation: isolate; min-height: 100lvh; overflow: hidden; background: var(--surface-black); color: var(--foreground-on-dark)`.
Layers: the floor-plan stage (`absolute inset-0`), the stall-grid dissolve (`carry="light"`, z 10),
then the copy column: `position: relative; min-height: 100lvh; display: flex; flex-direction: column; justify-content: space-between; padding: 4.8611cqw 2.2222cqw 2rem`.

### The heading (left rail)

`<h2>` Kanit 700, `--leading-thai-display`, accent, `font-size: max(3.8194cqw, 40px)`, two authored
lines — `ความเสี่ยง` / `ค้างชำระ` — each its own word reveal (`REVEAL`, `delayIn i * 130`, forward),
then a full stop in **white** at `130 + 110`. A green rule `24 × 2` design px scaling in from the
left at `2 * 130`. Then the intro, word by word on `|` (`wordStagger 34`, `{150, 24}`, delay
`2*130 + 90`), `--leading-thai`, `width: max(18cqw, 15rem)`, `font-size: max(1.25cqw, 17px)`:
`โมเดล|ให้คะแนน|ความเสี่ยง|ผู้เช่า|ทุกราย|ก่อน|ออกบิล|—|เจ้าหน้าที่|รู้ล่วงหน้า|ว่า|ควร|ติดตาม|แผง|ไหน`

### The model plate (bottom right)

A `320×78` frame with the bottom-right corner cut 9: `viewBox="0 0 320 78"`,
`M0.5 0.5H319.5V69L311 77.5H0.5Z`, fill `--surface-black`, stroke accent 1 non-scaling, a divider
at `x = 83`. Rises with `REVEAL` at 260; type starts at 430.
- Badge cell: a **spinning coin** — an ellipse `rx 18 ry 11` outline in accent whose inner ellipse
  `rx = max(0.5, |cos(turn)| * 18)`, `turn` 0→2π every 10s, paused off screen — then `ML` (white)
  and `/ v2.1` (accent), letter by letter.
- Stats cell, three rows `<dt>` accent + `<dd>` white, letter by letter (`letterStagger 22`,
  `TYPE`, figure at `430 + row * 110`, wording +70): `{highCount}` / `แผงเสี่ยงสูง`,
  `{arrearsCount}` / `แผงมียอดค้าง`, `AUC 0.87` / `ความแม่นยำโมเดล`.

### The floor-plan stage

A `1440×800` stage, `transform-origin: top left`, inside an `absolute inset-0; overflow: hidden`
frame masked top and bottom (`linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%)`).
From 1024 wide **cover** fit: `scale = max(w/1440, h/800)`, centred. Below 1024, fit the plan's
bounding box (padded 46) to the width.

In the stage, bottom up:

1. **The halftone** — a canvas in artboard units (backing store × `min(dpr, 2)`, 1 on coarse).
   Lattice pitch `7.8 × 7.7`, origin `(5, 16.6)`. A lattice point is a dot **iff it falls inside any
   stall rect or within 6px of one** — the three zones emerge as dense dot fields and the aisles as
   empty channels. Dot radius 1.1, `--map-dot`. Bake the resting field once into an offscreen canvas
   and blit it; per frame touch only lit dots (found by lattice arithmetic, never by search).
2. **The SVG layer** (`viewBox 0 0 1440 800`):
   - Dashed axes along the main aisles: `x = 555, 1210` and `y = 440`, drawn 4000 units past the
     artboard, `stroke: var(--map-grid); stroke-width 1.2; dasharray "7 4.7"`, `dashoffset` 0 → 11.7
     every **7s** linear — the aisles crawl.
   - The hub (market office) at `(1278, 400)`: rings `r 40` (1.7, `--map-grid`), `r 200` and `r 250`
     (1.2, `--map-grid-ghost`), a dot `r 6`, and a **ping** `r = 6 + v * 48`,
     `opacity = 0.4 * (1 - v)²`, accent, `v` 0→1 every **4.2s** ease-out quad.
   - Seven 9.4-square corner marks in `--background` at `[37,43] [1390,43] [37,524] [1390,524] [37,755] [650,755] [779,755]`.
   - Stall outlines: every stall rect stroked `--foreground-on-dark` at 12%, 0.75px.
   - Four **zone markers** — `<polygon points="7.7,0 -3.85,6.67 -3.85,-6.67">` filled accent at each
     zone's entry corner and at the office door, rotated to the route heading there.
   - An **entrance mark** at `(96, 700)`: four small stall-sized squares in a 2×2 checker.
3. **The route canvas** — 1440×800 CSS, drawn in artboard units.

#### The inspection route — one 6-second walk

Build `ROUTE` once from the layout: start at the entrance `(96, 700)`; walk up the aisle west of
zone A; **serpentine** through zone A's vertical aisles (up one, down the next); cross at `y = 440`
to zone B; serpentine through B's vertical aisles; drop to zone C; serpentine through C; then run
along `y = 700` back to the entrance, closing the loop. Resample the polyline to a **3-unit step**.
Record each zone marker's distance along the route as `d`.

An `IntersectionObserver` at `threshold 0.35` starts a one-shot tween `lap: 0 → 1` over **6000ms,
ease-in-out sine**. When it rests, `heat: 1 → 0` over 800ms ease-out cubic cools the head; only when
*that* rests is the cursor reticle armed. The walk never re-runs or reverses. Pacing lives in the
route's own curvature:

```js
const CORNER_BRAKE = 9, LINE_WIDTH = 4.2, GLOW_WIDTH = 12, HEAD_UNITS = 180;
// CUMULATIVE[i] = arc length to point i; TOTAL = CUMULATIVE.at(-1)
const TIME_AT = (() => {
  const n = ROUTE.length, turn = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const [ax, ay] = ROUTE[i - 1], [bx, by] = ROUTE[i], [cx, cy] = ROUTE[i + 1];
    const ux = bx - ax, uy = by - ay, vx = cx - bx, vy = cy - by;
    const l = (Math.hypot(ux, uy) || 1) * (Math.hypot(vx, vy) || 1);
    turn[i] = Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / l)));
  }
  const smooth = turn.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) { s += turn[j]; c++; }
    return s / c;
  });
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + (CUMULATIVE[i] - CUMULATIVE[i - 1]) * (1 + CORNER_BRAKE * smooth[i]));
  return acc.map((v) => v / acc[n - 1]);
})();
// distanceAtTime(t): binary-search TIME_AT, interpolate CUMULATIVE
```

Render each frame: clear; take the route up to `distanceAtTime(lap)`; draw an additive
(`globalCompositeOperation = "lighter"`) glow in accent at 0.05 / 0.1 alpha (`GLOW_WIDTH`,
`GLOW_WIDTH * 0.45`); then the **hot head** — the last `HEAD_UNITS` as a linear gradient from
accent at 0 alpha to `mix(accent, #b9ffe4, heat)` at the tip, at `LINE_WIDTH`; a **white filament**
down the last 42% of the head at `0.38 × LINE_WIDTH`, alpha `0.95 × heat`; a radial spark at the tip.
Behind the head the route stays a calm accent line at 0.55 alpha. As the head passes a zone marker,
flare it: a radial glow `r = 12 + (1 - age) * 14` and an expanding ring `r = 9 + age * 20`, `age`
running over the next 90 units. **Stalls the head passes within 18 units of** flash their outline
to their band colour for 400ms — the inspector glancing at each stall.

#### The reticle — after the walk

The pointer (mouse only; not under `hover: none` or reduced motion) is converted to artboard units
through the stage's own transform. A light with mass follows it (`approach(from, to, dt, 0.07)`,
frame-rate-independent exponential approach). The reticle lights the halftone along **its own
lattice row and column** — two arms reaching `320 × spread` units, linear falloff, where `spread`
opens toward 1 when the cursor settles (speed < 900 units/s; open `tau 0.38`, shut `0.09`) — plus a
round bloom `r 46` at the crossing. A lit dot squares up into a **checker**: the square grows from
0.7 to 1.0 of the lattice pitch as the light rises past `0.34`, and the lattice parity
`(col + row) & 1` decides fill or clear. Colour: `> 0.8 → white`, `> 0.5 → mix(accent, white, 0.55)`,
else accent. Lit levels decay with `exp(-dt / 0.3)`.

It **snaps to the nearest stall**: that stall's rect is drawn in its band colour with four 6px
corner ticks, and a **tenant card** springs in beside the cursor (flipping side near edges) — a
bracket panel on `--surface-black`, `--type-body`, `--leading-thai`:

```
B-17                         RISK 74%      ← id bold; risk in band colour, Kanit 600
ร้านเจ๊หมวย อาหารตามสั่ง
ค่าเช่า 4,200 ฿ · ค้าง 3,150 ฿
จ่ายช้า 5/12 รอบ · มิเตอร์ผิดปกติ 2 ครั้ง
[██████████░░░░] ← a 1px-framed bar, width = risk, band colour
```

Below the bar, the **top contributing feature** in `--foreground-on-dark-muted`: the feature whose
`weight × value` is largest, phrased as `ปัจจัยหลัก: จ่ายช้าบ่อย` / `ยอดค้างสูง` /
`มิเตอร์ผิดปกติ` / `เพิ่งเข้าเช่า` (negative tenure contribution inverted). The card is what makes
the model explainable — never omit it.

## 4 — จากมิเตอร์ถึงใบแจ้งหนี้ (The pipeline)

`<section id="pipeline">` — `container-type: inline-size; position: relative; isolation: isolate; background: var(--surface-black); color: var(--foreground-on-dark); padding-bottom: px(150)`.
Below `lg`: `overflow-x: clip` (**not** `hidden` — that would break the sticky stack). The last layer
of the stack: `position: relative; z-index: 20`. Stall-grid dissolve on top (`carry="light"`, z 30).
A wrapper with `padding-top: px(169)` holds the rail, the heading and seven rows of **462**
(centre) and **217** (side) px, stacked with **no gap** — centre, side, centre, side, centre, side,
centre. Below `sm` it becomes a column (`gap: 2.5rem; padding: 0 24px`).

### The heading

`<h2>` Kanit 700, `--leading-thai-display`, accent, `font-size: max(px(55), 40px)`,
`position: absolute; z-index: 20; top: px(32); right: px(32); width: max(px(330), 82cqw)` from `lg`
right-aligned — `จากมิเตอร์` / `ถึงใบแจ้งหนี้` — word reveals at `i * 130`, white full stop at 240.

### The rail

`position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 10; width: px(16); top: 0`,
hidden below `sm`. One SVG `viewBox="0 0 16 {H}"`, `overflow: visible`: a line at `x 8` solid 0→98,
then dashed `6 6` to `rest`, `stroke: var(--rail)`; a white progress rect `x 7.5, width 1, height = run`;
a white marker square side 9 (20 below `lg`) at `translate(8 run) rotate(run / rest * 1800)` —
**five full turns**. `run = interpolatedProgress * rest`, scrubbed `"top center" → "bottom bottom"`.
`rest` = the last row's middle minus 50 — the thread stops **on the last step**.

### A row

`position: relative; width: 100%; height: px(462 | 217)`. Three layers, each on its own parallax
scrub over the row's crossing (`"top bottom" → "bottom top"`) moving **`top`** (never a transform)
from `+px(travel)` to `−px(travel)`: `plate: side 60, centre 20`, `copy 110`.

1. **The plate** — `width: px(333 | 710)`; side plates at the left or right gutter (`px(32)`),
   centre plates at `left: 50%; translateX(-50%)`. Below `sm`: `width: 82%; aspect-ratio: 710/462`,
   alternating sides. The fill is clipped to the stepped plate shape and **insets to 5% on hover**
   (`transition: inset 700ms var(--ease-plate)`) while the outline stays:

   ```
   PLATE_CLIP (clipPathUnits="objectBoundingBox"):
   M 0.01915,0.00107H 0.98085C 0.98574,0.00107 0.99044,0.00300 0.99390,0.00642C 0.99736,0.00984 0.99930,0.01449 0.99930,0.01933V 0.88815C 0.99930,0.89299 0.99736,0.89763 0.99390,0.90105C 0.99044,0.90448 0.98574,0.90640 0.98085,0.90640H 0.64733C 0.63864,0.90640 0.63007,0.90834 0.62224,0.91206C 0.61442,0.91579 0.60754,0.92122 0.60212,0.92794L 0.56153,0.97830C 0.55635,0.98474 0.54976,0.98993 0.54227,0.99350C 0.53478,0.99707 0.52656,0.99892 0.51825,0.99892H 0.01915C 0.01426,0.99892 0.00956,0.99700 0.00610,0.99358C 0.00264,0.99016 0.00070,0.98551 0.00070,0.98067V 0.01933C 0.00070,0.01449 0.00264,0.00984 0.00610,0.00642C 0.00956,0.00300 0.01426,0.00107 0.01915,0.00107Z
   ```
   The outline is the same shape scaled to `viewBox="0 0 711 463"`, `preserveAspectRatio="none"`,
   `stroke: var(--plate-outline)`, non-scaling. Fill `var(--plate-fill)`.

   **Inside each plate, a live canvas visual** (in view + 10 frames only; DPR ≤ 2), drawn in white,
   accent and the risk colours on the plate fill — this replaces photography:

   | # | frame | align | visual inside the plate |
   |---|---|---|---|
   | 01 | centre | — | **Meter reading** — a 7-segment odometer (water `m³` and electricity `kWh`) rolling up digit by digit, each digit a spring; a stall id ticks through `A-01 … C-40` every 900ms |
   | 02 | side | right | **Raw data** — 140 scattered dots (usage vs. stall), 6 obvious outliers pulsing red |
   | 03 | centre | — | **Anomaly detection** — a 30-day line; a rolling median band (±3.5 MAD) sweeps across; points outside flip to red rings with a `!` tag |
   | 04 | side | left | **Features** — five horizontal bars (the logistic weights from §0) growing from a centre zero line, negative left, positive right |
   | 05 | centre | — | **Risk scoring** — the sigmoid curve drawn once; 140 dots drop onto it by their `z`; a dashed threshold at 0.6; dots above turn red |
   | 06 | side | right | **Billing** — a receipt printing downward line by line: stall, rent, water, electricity, total, zig-zag tear |
   | 07 | centre | — | **Dashboard** — a mini floor plan of all 140 stalls in band colours, with a 4-bar summary (low / mid / high / arrears) |

   Each visual starts when its row enters view and loops calmly (period ≥ 6s); under reduced motion
   it renders its final frame once.
2. **The step number** — `position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20`,
   Kanit 700, accent, `font-size: max(px(36), 30px)`, `01` … `07`, letter by letter
   (`letterStagger 26`, `STEP`, forward) on view (`0% 0% -25% 0%`, once). On **centre** rows it settles
   from 1 to **0.4** after a 2200ms hold with `STEP_SETTLE`. It rides its plate's parallax.
3. **The copy** (centre rows only) — `<p>` at `left: px(1020); top: 50%; translateY(-50%); z-index: 20`,
   white, `--leading-thai`, `width: min(max(px(260), 200px), 26.9444cqw)`,
   `font-size: max(px(18), 17px)`; the lead sentence bold then the rest. Rises
   `{0, 0.75rem} → {1, 0}` with `COPY` at `+220`. Rides `copy` parallax.

| # | copy (lead in bold) |
|---|---|
| 01 | **อ่านมิเตอร์ทุกแผง** เจ้าหน้าที่บันทึกค่าน้ำ–ไฟของ 140 แผงเข้าระบบทุกสิ้นเดือน |
| 03 | **จับค่าผิดปกติก่อนออกบิล** ระบบเทียบกับค่ามัธยฐานย้อนหลังของแต่ละแผง ค่าที่กระโดดเกินเกณฑ์จะถูกพักไว้ให้ตรวจซ้ำ |
| 05 | **ให้คะแนนความเสี่ยง** Logistic Regression ใช้ประวัติการจ่าย ยอดค้าง และอายุสัญญา ทำนายโอกาสจ่ายช้าในรอบถัดไป |
| 07 | **เห็นทั้งตลาดในหน้าเดียว** แดชบอร์ดสรุปสถานะทุกแผง พร้อมรายชื่อที่ควรติดตามก่อนวันครบกำหนด |

**Hovering one plate dims the rest** (`hover: hover` only): every other row to `opacity: 0.3` over
700ms `--ease-plate`.

## 5 — มิเตอร์ผิดปกติ (Meter anomalies)

`<section id="meter">` — `container-type: inline-size; position: relative; isolation: isolate; min-height: 100lvh; overflow: hidden; background: var(--background); color: var(--foreground)`.
The 1440×800 frame in `cqw`. Bottom up: the contour canvas (marching squares, `--meter-contour`),
the dark **band** (`absolute inset-x-0 bottom-0; height: px(169); background: var(--surface-black)`),
the chart stage, a gradient melting the stage's foot into the band, the stall-grid dissolve
(`carry="dark"`, z 30), then the copy, the panels and the calendar strip.

### The intro (left rail)

- `<h2>` at `left: px(32); top: px(32)`, Kanit 700, `--leading-thai-display`,
  `font-size: max(px(96), 40px)` — `มิเตอร์` / `ผิดปกติ` — word reveals, the full stop in **accent**.
- A column at `left: px(32); bottom: calc(px(169) + px(32)); width: max(px(338), 280px); gap: px(40)`:
  the report word by word on `|` (`wordStagger 30`, `{150, 24}`, delay 350), `--leading-thai`,
  `font-size: max(px(18), 17px)`:
  `รอบ|กันยายน|ระบบ|พัก|บิล|ไว้|6|ใบ|เพราะ|ค่า|ไฟ|สูง|กว่า|ปกติ|เกิน|3.5|เท่า|—|ตรวจ|แล้ว|พบ|มิเตอร์|เสีย|2|จุด|ก่อน|ถึง|มือ|ผู้เช่า`
  Then a chamfered button `ดูรายงานรอบนี้` → `#contact` (217×50, body `--surface-black`, accent
  label), rising at 520.

### The comparison chart (centre-right)

A stage `left: px(420); top: px(150); width: px(700); height: px(400)`, drawn on one canvas. Data:
the **worst stall in §0 by `meterSpikes`**, 30 daily electricity readings generated from `rand` as
`base 12 kWh + weekly sine ±2 + noise ±1`, with 3 injected spikes (`×3.8`, `×4.4`, `×0.1` — a dead
meter) on days 7, 18, 24.

- **Detection** (compute, do not hardcode): rolling median over a 7-day window; MAD; a point is
  anomalous when `|x - median| / (1.4826 * MAD) > 3.5`. **Cleaned** = anomalies replaced by the
  rolling median.
- **Draw**: x axis days 1–30, y axis kWh, hairlines in `--surface-soft`, Kanit tick labels. Left of
  the divider: the **raw** series in `--foreground` with anomalous points as `--risk-high` rings and
  a `!` tag; right of the divider: the **cleaned** series in accent with repaired points as hollow
  accent squares. The shaded median band (±3.5 MAD) runs behind both in `--accent-muted`.
- **The divider**: a vertical 1px `--foreground` line with a 28px round handle (arrows `‹ ›`), dragged
  with pointer events (keyboard: arrow keys ±1 day, `role="slider"`, `aria-valuenow` = day). Its
  position is a spring (`HOVER {170, 24}`) toward the pointer. Labels above: `ข้อมูลดิบ` left,
  `หลัง AI ทำความสะอาด` right.
- **Scroll-in**: the divider enters from the right edge (all raw) and a scrub `"top bottom" → "center center"`
  sweeps it to day 15, revealing the cleaned half as the reader arrives. After that, it is the reader's.
- A caption strip under the chart: `แผง {id} · {tenant} · พบค่าผิดปกติ {n} วัน · ยอดบิลที่ถูกต้อง {cleanedTotal} ฿ (ไม่ใช่ {rawTotal} ฿)`
  computed at 4.4 ฿/kWh.

### The two panels (right rail) — hidden below `sm`

Bracket panels stroked **`--foreground`**, anchored to the right gutter, `U = calc(100cqw / 1440)`.
- **The cycle** (brackets y 32U → 105U, at 320ms): `รอบบิลกันยายน 2569` (bold), `ออกบิลแล้ว 134 ใบ`,
  `พักตรวจ 6 ใบ` — each line `14U`, `--leading-thai`.
- **The stats** (brackets y 137U → 535U, at 460ms): four rows `58U` tall, `gap 24U`, a 31U inline-SVG
  icon (droplet, bolt, alert triangle, baht coin — simple 1.5px strokes) then a label (`12U`,
  `--foreground-muted`) over a figure (Kanit 600, `38U`, line-height 0.72): `ค่าน้ำรวม` /
  `{m³}`, `ค่าไฟรวม` / `{kWh}`, `ค่าผิดปกติ` / `{count}`, `ยอดที่ป้องกันได้` / `{฿}`. 1px rules in
  `--foreground-muted` drawing in from the left between rows at `460 + row * 90`; each figure
  letter by letter at +120.

### The billing calendar strip (the band)

`position: absolute; inset-x-0 bottom-0; z-index: 20; height: px(169)`, everything measured from
the band's top, x spread about the middle by `--cal-spread` (1 at the frame, 1.75 between `sm` and
`lg`): `spread(x) = calc(50% + px(x - 720) * var(--cal-spread, 1))`. Entrance gated on view, forward.

- Four dashed connectors at `top: px(131.5)`, 1px: `{416,126} {580,128} {743,136} {914,124}`;
  `repeating-linear-gradient(to right, var(--foreground-on-dark-muted) 0 px(7), transparent px(7) px(11.45))`
  whose `background-position-x` crawls `0 → ±px(11.45)` every **5200ms** — the two left of the live
  cycle crawl **right**, the two right of it crawl **left**, toward the cycle being reported. Each
  scales in at `560 + i * 90`.
- Five cards at `top: px(43)`, centred column, rising at `560 + i * 90`: the cycle label (`type(12)`),
  the month (Kanit 600, white, `max(type(18), 17px)`, `NAME` at +110), the result (`type(14)`).
  Label and result `--foreground-on-dark-muted`, **accent on the live cycle**.

  | cycle | month | result | x | w | marker |
  |---|---|---|---|---|---|
  | รอบ 07 | กรกฎาคม | เก็บได้ 94% | 347 | 100 | `94%` |
  | รอบ 08 | สิงหาคม | เก็บได้ 96% | 511 | 100 | `96%` |
  | รอบ 09 | กันยายน | กำลังเก็บ | 675 | 100 | **live** — filled accent dot |
  | รอบ 10 | ตุลาคม | 1 ต.ค. | 839 | 114 | ring |
  | รอบ 11 | พฤศจิกายน | 1 พ.ย. | 1017 | 76 | ring |

- Markers at `top: px(126)`: a result in Kanit 600 `type(12)` white, or an 11-unit SVG — `r 5` white
  ring for cycles to come, `r 5.5` accent disc for the live one — fading in at `+60`.
- **The live pulse**: a ring `r = 5.5 + v * 5.5 * 3.4`, `opacity = 0.5 (1 - v)²`, accent, `v` 0→1
  every **3200ms** ease-out quad.
- **The live bracket**: accent brackets from `spread(669)` to `spread(781)`, y 32 → 113; **hovering
  the live card opens them by 5 design px**.

Below `sm` the strip becomes a three-column grid of the last three cycles, connectors, markers and
bracket hidden; the chart stacks under the intro at full width, 16:10.

## 6 — ตลาดที่รู้ล่วงหน้า. (The footer)

`<section id="contact">` — `container-type: inline-size; position: relative; isolation: isolate; min-height: 100lvh; overflow: hidden; background: var(--accent)`.
A green page edge with a near-black panel inset **16** (`px(16)`) on every side:
`position: absolute; inset: px(16); overflow: hidden; background: var(--surface-black); color: var(--foreground-on-dark)`,
holding the contour canvas in `--footer-contour`. No dissolve seam — the green edge draws the join.

**The receipt stack** — on the section (not in the panel), centred, hidden below `sm`: three receipt
cards drawn in HTML/CSS, each `px(300)` wide with a zig-zag bottom edge (`clip-path`), paper
`#f6f8f7`, ink text, rotated `-6°`, `2°`, `-1.5°` and offset so they fan. The front card is a real
bill from §0 (the highest-risk stall): header `BANYATSAP · ใบแจ้งหนี้`, stall id, tenant, rent,
water, electricity, arrears, a dashed rule, **total** in Kanit 700, and a stamp `ความเสี่ยงสูง 74%`
in `--risk-high` at `-12°`. A parallax layer whose window **ends at `bottom bottom`**
(`"top bottom" → "bottom bottom"`) moves the stack's `top` from `px(60)` to `0` — it rides **back
into place** as the page bottoms out, so the resting frame is exact.

Copy, with `G = px(32)` (24px below `sm`):
- **Logo** at `left: G; top: G` — the header wordmark in accent, fading in at 120.
- **Masthead** `<h2>` at `top: G; right: G; width: max(px(420), 44cqw)`, Kanit 700, accent,
  `--leading-thai-display`, `font-size: max(px(55), 40px)`, right-aligned — `ตลาดที่` / `รู้ล่วงหน้า`
  — word reveals, the full stop in **white**.
- **Nav** at `left: G; top: 50%; translateY(-50%)`, Kanit 600, white, `font-size: max(type(36), 30px)`,
  `--leading-thai-display`, `gap: type(12)`, hover accent: `ภาพรวม` / `ความเสี่ยง` / `กระบวนการ` /
  `มิเตอร์` / `แดชบอร์ด`, each resolving **grapheme by grapheme** (`letterStagger 22`, `ROW`) at
  `260 + i * 80`. Below `sm` each is a full-width row with a 15%-white rule and an accent arrow.
- **The foot row**, all three ending 32 above the foot, rising at 640 / 720 / 800:
  `© 2569 Banyatsap Market Project · KMITL` (`type(14)`, `--foreground-on-dark-faint`); the button
  `ดูซอร์สโค้ด` → `#` at `left: px(583)` — `275×50`, chamfer 8.835, **hollow**
  (`M0.5 0.5H274.5V41.165L266.165 49.5H0.5Z`, stroke accent, fill none) with the accent flood; and
  `GITHUB` / `LINE OA` / `EMAIL` right-aligned, `justify-content: space-between`, hover accent.

## Responsive rules, in one place

| width | hero | risk | pipeline | meter | footer |
|---|---|---|---|---|---|
| ≥ 1280 | overlay layout | cover fit | 1440 frame in `cqw` | 1440 frame in `cqw` | 1440 frame |
| 1024–1279 | root 16px, stacked copy, name `--type-display-lg`, market pushed right | cover fit | rail marker 20 | calendar ×1.75 | receipts ×0.87 |
| 640–1023 | market in bottom 65%, lens radius ×1.2, contour reveal off | plan fitted to width | type floors on | chart under intro | — |
| < 640 | panels hidden, lens off after scan (mobile tier) | `min-height 680px`, dissolve behind copy | column, plates 82% alternating, rail hidden | stacked, 3-card strip | 680px, list nav, no receipts |

Touch (`hover: none`): the idle sweep drives the hero lens; the risk reticle is replaced by **tap to
inspect** (tap a stall → tenant card, tap elsewhere to close). Reduced motion: no scan, no route
walk (draw the full route at rest), no parallax, all reveals appear at their final state.

## Accessibility

One `<h1>` (the market's name); every block a `<section>` with an `<h2>`; the masthead a `<header>`
with `<nav aria-label="หลัก">`; the veil `role="status"`. Every text reveal keeps a visually-hidden
plain copy and hides animated spans. Canvases `aria-hidden`, **but** the risk map and the meter chart
each get a visually-hidden `<table>` summary (top-10 risk stalls; the 30 readings with anomaly flags)
so the data is reachable without a pointer. The divider is a real `role="slider"`. The menu sheet is
`role="dialog" aria-modal="true"`. Dates use `<time>`.

## Fixed parameters (bake these in)

Hero entrance `nav 0 · identity 180 · panels 900 · actions 1500`; veil `CLEAR 430 · PAUSE 240 ·
LIFT_TIMEOUT 3000`; scene gate `1.15`; scan `2800ms, band 0.55, glow 0.06`; lens `samples 48 ·
radius 1.1 · idle 0.35 · taper 1.9 · threshold 0.08`; sheet `120 + i * 55`; route `6000ms · cool 800 ·
brake 9`; reticle `open 320 · settle 900 · core 46 · threshold 0.34`; coin `10000ms`; aisles
`7000ms`; ping `4200ms`; pipeline `STEP_REST 0.4 · STEP_HOLD 2200`; calendar `CARD 560 · STAGGER 90 ·
PULSE 3200 · REACH 3.4 · CRAWL 5200 · BRACKET 5`; meter panels `320 · 460 · ROW 90`; footer
`NAV 260 · STAGGER 80 · FOOT 640`; stack `SCALE 0.9 · SHADE 0.55`; model `seed 2569`.

## Execution rules

- HARD RULE: one `index.html`. No external CSS/JS beyond the import map and Google Fonts. No React.
- HARD RULE: write the real math — the spring solver, the scroll-progress interpolator, the logistic
  model, the rolling-median/MAD detector, marching squares, the route pacing.
- HARD RULE: every number shown on the page is computed from the §0 data array.
- Any runtime error in a visual must be visible: wrap each canvas/scene init in `try/catch` and show a
  small banner naming the component that failed, rather than failing silently behind the veil.
- Output the **complete, working, copy-pasteable file** — no "…rest of code here", no TODOs. If the
  file is long, keep going until it is finished.
