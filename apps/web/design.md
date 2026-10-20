---
version: alpha
name: Design Analysis
description: An analysis of design language — a single-viewport, obsidian-black operational AI infrastructure landing system built around liquid-metal chrome, frosted glass surfaces, and cinematic atmospheric depth. Pure #000000 canvas locked to prevent white flash, multi-stop metallic gradients on navigation pills, specular hover sweeps, and an editorial pairing of tightly tracked Inter with an italic Instrument Serif focal accent in muted silver (#9a9a9a).

colors:
  primary: "#ffffff"
  on-primary: "#111111"
  ink: "#ffffff"
  ink-soft: "#f3f3f3"
  text-stat: "#d8d8d8"
  text-muted: "#9a9a9a"
  canvas: "#000000"
  surface-metal-dark: "#050505"
  surface-metal-mid: "#2a2a2a"
  surface-metal-light: "#4a4a4a"
  surface-glass: "rgba(8, 8, 8, 0.55)"
  backdrop-scrim: "rgba(8, 8, 8, 0.42)"
  hairline: "rgba(255, 255, 255, 0.16)"
  hairline-soft: "rgba(255, 255, 255, 0.12)"
  border-metal: "rgba(198, 198, 198, 0.55)"
  border-metal-hover: "rgba(235, 235, 235, 0.9)"
  glow-ice: "rgba(186, 208, 255, 0.35)"
  accent-avatar: "#f26b1d"

typography:
  display-2xl:
    fontFamily: Inter
    fontSize: 88px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -0.045em
  display-xl:
    fontFamily: Inter
    fontSize: 76px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -0.045em
  display-lg:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -0.045em
  heading-1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -0.045em
  heading-1-accent:
    fontFamily: "Instrument Serif"
    fontStyle: italic
    fontSize: 51.84px
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: -0.03em
  heading-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -0.045em
  logo:
    fontFamily: Inter
    fontSize: 15.5px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.03em
  lede:
    fontFamily: Inter
    fontSize: 15.5px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: -0.015em
  nav:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.01em
  nav-mobile:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.01em
  button:
    fontFamily: Inter
    fontSize: 13.5px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.02em
  stat:
    fontFamily: Inter
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: -0.015em
  badge:
    fontFamily: Inter
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.01em

rounded:
  none: 0px
  xs: 5px
  sm: 6px
  md: 7px
  lg: 10px
  full: 9999px

spacing:
  xs: 8px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 22px
  xxl: 26px
  stats-y: 36px
  header-x: 40px
  stats-x: 72px
  hero-gap: 85px

components:
  nav-pill-metal:
    backgroundColor: "linear-gradient(105deg, #050505 0%, #2a2a2a 48%, #4a4a4a 100%)"
    textColor: "{colors.ink-soft}"
    borderColor: "{colors.border-metal}"
    typography: "{typography.nav}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0px {spacing.lg}"

  button-solid:
    backgroundColor: "linear-gradient(180deg, #ffffff 0%, #e7e7e7 48%, #cfcfcf 100%)"
    textColor: "{colors.on-primary}"
    borderColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0px 16px"

  button-ghost:
    backgroundColor: "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.45) 50%, rgba(160, 175, 200, 0.08))"
    textColor: "{colors.ink}"
    borderColor: "rgba(198, 198, 198, 0.45)"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0px 16px"

  button-hero-ghost:
    backgroundColor: "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.5) 46%, rgba(150, 170, 200, 0.1))"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-metal}"
    backdropFilter: "blur(16px)"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: "42px"
    padding: "0px {spacing.lg}"

  badge-infrastructure:
    backgroundColor: "linear-gradient(90deg, #7d7d7d 0%, #2a2a2a 52%, #0a0a0a 100%)"
    textColor: "#f2f2f2"
    typography: "{typography.badge}"
    rounded: "{rounded.xs}"
    padding: "9px 15px"

  burger-toggle:
    backgroundColor: "{colors.surface-glass}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    size: "42px"

  menu-backdrop:
    backgroundColor: "{colors.backdrop-scrim}"
    backdropFilter: "blur(24px)"

  stat-item:
    textColor: "{colors.text-stat}"
    typography: "{typography.stat}"
    gap: "{spacing.md}"

  grain-overlay:
    opacity: 0.035
    zIndex: 100

  # ─── Examples (illustrative) — kit-mirror surfaces referencing brand primitives ───
  ex-pricing-tier:
    description: "Default Pricing tier card. Uses dark glass surface with hairline border."
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-pricing-tier-featured:
    description: "Featured/highlighted tier — liquid-metal gradient fill with metallic border."
    backgroundColor: "linear-gradient(105deg, #050505 0%, #2a2a2a 48%, #4a4a4a 100%)"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-metal}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-product-selector:
    description: "Workflow capability selector surface."
    backgroundColor: "{colors.surface-glass}"
    borderColor: "{colors.hairline-soft}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-cart-drawer:
    description: "Deployment summary drawer with hairline row dividers."
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
    item-divider: "{colors.hairline-soft}"
  ex-app-shell-row:
    description: "Navigation row inside an operational console shell."
    backgroundColor: "{colors.surface-metal-dark}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.lg}"
  ex-data-table-cell:
    description: "Operational telemetry table chrome."
    headerBackground: "{colors.surface-metal-dark}"
    headerTypography: "{typography.badge}"
    bodyTypography: "{typography.stat}"
    cellPadding: "{spacing.sm} {spacing.lg}"
    rowBorder: "{colors.hairline-soft}"
  ex-auth-form-card:
    description: "Sign-in card using frosted glass and metallic borders."
    backgroundColor: "{colors.surface-glass}"
    borderColor: "{colors.border-metal}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-modal-card:
    description: "Modal dialog over blur(24px) backdrop scrim."
    backgroundColor: "{colors.surface-metal-dark}"
    borderColor: "{colors.border-metal}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-empty-state-card:
    description: "Empty workflow state container."
    backgroundColor: "{colors.surface-glass}"
    borderColor: "{colors.hairline-soft}"
    rounded: "{rounded.md}"
    padding: "{spacing.stats-y}"
    captionTypography: "{typography.lede}"
  ex-toast:
    description: "Liquid-metal notification banner."
    backgroundColor: "linear-gradient(105deg, #050505 0%, #2a2a2a 48%, #4a4a4a 100%)"
    borderColor: "{colors.border-metal}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
    typography: "{typography.stat}"
---
## Overview

Vesper.ai is an operational AI infrastructure landing experience engineered as a single, locked desktop viewport (`100dvh`) where atmospheric motion and tactile metallic chrome carry the entire brand narrative. The system is anchored on an uncompromising pure black foundation (`{colors.canvas}` — `#000000`), enforced via triple-redundant CSS and inline body rules so the viewport can never flash white during load. Against this dark void, a full-bleed background video (`.hero-photo`) and a subtle fractal-noise film grain (`.grain` at `3.5%` opacity) establish cinematic depth without competing with the foreground typography.

Where flat dark-mode interfaces rely on static gray cards, Vesper.ai uses a **liquid-metal and frosted-glass interaction language**. Primary navigation links are independent metallic pills (`105deg` charcoal-to-steel gradients framed by `rgba(198, 198, 198, 0.55)` borders) that trigger diagonal specular light sweeps (`::before` and `::after` shine pseudo-elements) and cool ice-blue outer glows on hover.

The typographic voice relies on a single high-contrast editorial interruption: tightly tracked **Inter** (`500` weight, `-0.045em`) forms the structural headline, while the two words *"AI agents"* shift into italic **Instrument Serif** (`400` weight, `1.08em` scale) and drop in luminance to muted silver (`{colors.text-muted}` — `#9a9a9a`), creating focal emphasis through recession and serif geometry rather than loud color.

**Key Characteristics:**

- **Zero-flash obsidian foundation** — pure `#000000` canvas with full-bleed background video at 100% opacity and a fixed `z-index: 100` SVG fractal-noise grain overlay
- **Single-frame desktop discipline** — locked `100vh / 100dvh` 3-row CSS Grid (`auto 1fr auto`) on viewports `>= 901px` with zero vertical scroll
- **Bottom-anchored hero composition** — hero copy aligns to the lower third (`align-items: flex-end`), leaving the upper-center viewport open for the atmospheric background media
- **Liquid-metal & liquid-glass controls** — multi-stop directional gradients, `1px` specular borders, `inset 0 1px 0` top-edge highlights, and diagonal hover shine sweeps (`translateX(-130%)` to `translateX(130%)`)
- **Serif-in-sans typographic tension** — Inter Medium (`-0.045em`) interrupted solely on `"AI agents"` by italic Instrument Serif in `#9a9a9a` with a dedicated blur-to-sharp entrance keyframe (`in-em`)
- **Resilient choreographed entrance** — 15 staggered `.appear` elements using `cubic-bezier(0.16, 1, 0.3, 1)` with resting `opacity: 1`, `animationend` `.is-in` locking, and a double-`requestAnimationFrame` fallback

---

## Colors

Source page: single-viewport landing page (`#top`).

### Brand & Accent

- **Pure White** (`{colors.primary}` — `#ffffff`): Primary brand mark, headline text, badge sparkle icon, and top-stop of the solid primary CTA gradient.
- **Ice Specular Glow** (`{colors.glow-ice}` — `rgba(186, 208, 255, 0.35)`): Cool blue-white atmospheric luminescence that appears only on button and nav-pill hover states (`#f3f6ff` → `#d5def2` surface shift with `rgba(170, 200, 255, 0.22–0.40)` outer glow).
- **Avatar Orange** (`{colors.accent-avatar}` — `#f26b1d`): A single warm micro-accent confined to the third circular team avatar in the bottom-right proof stat.

### Surface

- **Canvas** (`{colors.canvas}` — `#000000`): Pure black root background forced immediately on `html` and `body`.
- **Liquid Metal Pill Gradient** (`#050505` → `#2a2a2a` 48% → `#4a4a4a` 100% at `105deg`): Default surface for navigation links; shifts to `#111111` → `#3a3a3a` 45% → `#6a6a6a` 100% on hover.
- **Solid Liquid-Glass CTA** (`#ffffff` 0% → `#e7e7e7` 48% → `#cfcfcf` 100% at `180deg`): High-contrast metallic white button fill; shifts toward cool ice (`#ffffff` → `#f3f6ff` 42% → `#d5def2` 100%) on hover.
- **Hero Frosted Ghost Surface** (`135deg`, `rgba(255, 255, 255, 0.12)` → `rgba(0, 0, 0, 0.50)` 46% → `rgba(150, 170, 200, 0.10)`): Paired with `backdrop-filter: blur(16px)` for the secondary hero CTA.
- **Badge Gradient** (`90deg`, `#7d7d7d` 0% → `#2a2a2a` 52% → `#0a0a0a` 100%): Borderless horizontal metallic fade from medium gray on the left (behind the glowing white sparkle) to near-black on the right.
- **Mobile Drawer Scrim** (`{colors.backdrop-scrim}` — `rgba(8, 8, 8, 0.42)`): Full-viewport overlay paired with `backdrop-filter: blur(24px)` when `body.menu-open` is active.

### Borders & Hairlines

- **Metallic Control Border** (`{colors.border-metal}` — `rgba(198, 198, 198, 0.55)`): Used on nav pills and hero ghost buttons; brightens to `rgba(235, 235, 235, 0.90)` or `rgba(220, 230, 255, 0.80)` on hover.
- **Standard Hairline** (`{colors.hairline}` — `rgba(255, 255, 255, 0.16)`): Used on the mobile burger toggle (`--border`), brightening to `rgba(255, 255, 255, 0.32)` on hover.
- **Soft Hairline** (`{colors.hairline-soft}` — `rgba(255, 255, 255, 0.12)`): Reserved token (`--border-soft`) and top-edge inner specular highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.12)`).

### Text

- **Primary Ink** (`{colors.ink}` — `#ffffff`): Logo wordmark, H1 headline, and ghost button labels.
- **Near-Black On-Primary** (`{colors.on-primary}` — `#111111`): Label color on solid white-gradient CTA buttons and stroke color inside white SVG icon tiles.
- **Soft Ink** (`{colors.ink-soft}` — `#f3f3f3` / `#f2f2f2`): Navigation pill labels and hero badge text.
- **Stat Silver** (`{colors.text-stat}` — `#d8d8d8`): Quantitative proof labels in the footer bar (`--stat`).
- **Muted Silver** (`{colors.text-muted}` — `#9a9a9a`): Lede paragraph copy AND the italicized `"AI agents"` serif phrase inside the H1 (`--muted`).

---

## Typography

### Font Families

1. **Inter** (Variable Roman `100–900`): Primary geometric/neo-grotesque workhorse used across the logo, navigation pills, badge, H1 structural words, lede paragraph, buttons, and footer stats. Self-hosted via `inter.woff2` with Google Fonts fallback (`opsz 14..32, wght 100..900`) and system sans stack (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`).
2. **Instrument Serif** (Italic `400` only): Used exclusively for the two words `AI agents` inside the first line of the H1. Self-hosted via `instrument-serif-italic.woff2` with Google Fonts italic fallback and `"Times New Roman", Times, serif`.

### Hierarchy (Default 1440px Baseline & Responsive Matrix)

| Token                             | Size (1440px)    | Weight            | Line Height | Letter Spacing | Responsive Scale (`≤560` / `≤900` / `901–1279` / `1280–1599` / `≥1600` / `≥1920` / `≥2560`)                         |
| --------------------------------- | ---------------- | ----------------- | ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `{typography.heading-1}`        | 48px             | 500               | 1.12        | -0.045em       | `34px` / `36px` / `42px` / `54px` / `64px` / `76px` / `88px` (Short desktop: `40px` @ `≤850h`, `34px` @ `≤720h`) |
| `{typography.heading-1-accent}` | 1.08em (~51.8px) | 400 Italic        | 1.12        | -0.03em        | Scales proportionally (`1.08em`) with `--h1` across all breakpoints                                                                  |
| `{typography.logo}`             | 15.5px           | 600 (`.ai` 400) | 1.0         | -0.03em        | `16px` (`≤900`) / `15px` (`901–1279`) / `15.5px` (`1440`) / `17px` (`≥1600`) / `18px` (`≥1920`)                  |
| `{typography.lede}`             | 15.5px           | 400               | 1.55        | -0.015em       | `16px` / `16.5px` / `15px` / `16px` / `18px` / `20px` / `22px` (`14px` @ `≤720h`)                                     |
| `{typography.nav}`              | 14px             | 400               | 1.0         | -0.01em        | `19px` (`≤900` drawer) / `13px` (`901–1279`) / `14px` (`1440`) / `15px` (`≥1600`) / `16px` (`≥1920`)             |
| `{typography.button}`           | 13.5px           | 500               | 1.0         | -0.02em        | `15px` (`≤900`) / `13px` (`901–1279`) / `13.5px` (`1440`) / `15px` (`≥1600`) / `16px` (`≥1920`)                  |
| `{typography.stat}`             | 13.5px           | 400               | 1.35        | -0.015em       | `15px` (`≤900`) / `12.5px` (`901–1279`) / `13.5px` (`1440`) / `15px` (`≥1600`) / `16px` (`≥1920`)                |
| `{typography.badge}`            | 12.5px           | 400               | 1.0         | -0.01em        | `13.5px` (`≤900`) / `12px` (`901–1279`) / `12.5px` (`1440`) / `13.5px` (`≥1600`) / `14.5px` (`≥1920`)            |

### Principles

- **Luminance recession as focal emphasis.** Instead of highlighting *"AI agents"* with a bright neon gradient, the design drops its luminance from `#ffffff` to `#9a9a9a` while shifting to an italic serif at `1.08em`.
- **Two-line masked headline containment.** The H1 splits strictly into two `.headline-line` blocks (`display: block; overflow: hidden; padding: 0.06em 0.15em 0.14em`), preventing descender clipping during the `translateY(40%)` mask reveal.
- **Weight split in the wordmark.** `Vesper` renders at SemiBold `600` while `.ai` drops to Regular `400` (`<span class="logo-suffix">.ai</span>`), all set at `-0.03em`.
- **Negative tracking across every tier.** From `-0.045em` on display type down to `-0.01em` on badges and nav pills, no element uses loose or uppercase tracking.

---

## Layout

### Layer Stack (Back → Front)

1. **Root Canvas (`html, body`)**: Pure `#000000` background.
2. **Hero Media Layer (`.hero-photo`)**: `position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden` containing the `object-fit: cover` background video at 100% opacity and a `::after` scrim layer.
3. **Page Grid (`.page`)**: `position: relative; z-index: 1; display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh / 100dvh`.
4. **Film Grain (`.grain`)**: `position: fixed; inset: 0; z-index: 100; pointer-events: none; opacity: 0.035` repeating a `180px × 180px` SVG `feTurbulence` noise tile.

### Spacing & Container Tokens (1440px Baseline)

- **Header Padding**: `var(--header-y)` `22px` top, `var(--header-x)` `40px` horizontal, `10px` bottom
- **Hero Bottom Gap**: `var(--hero-gap)` `85px` (distance between hero CTAs and the stats footer)
- **Hero Copy Containers**: `var(--copy-max)` `860px` outer wrapper; `var(--lede-max)` `470px` lede paragraph measure
- **Internal Hero Rhythm**: Badge `margin-bottom: 22px`; Lede `margin-top: 18px`; Hero Actions `margin-top: 26px` with `10px` button gap
- **Stats Footer Padding**: `0 var(--stats-x) var(--stats-y)` (`0 72px 36px`), respecting `max(var(--stats-y), env(safe-area-inset-bottom))`

### Grid & Spatial Composition

- **Header (`header.header`)**: 3-column CSS Grid (`grid-template-columns: 1fr auto 1fr; align-items: center`). Logo is `justify-self: start`, `#site-nav` is `justify-self: center` (`gap: 8px`), and `.header-cta` is `justify-self: end`.
- **Hero (`main.hero#top`)**: Bottom-centered flex container (`display: flex; align-items: flex-end; justify-content: center; min-height: 0`). It deliberately avoids vertical centering so the upper half of the viewport showcases the background visual.
- **Stats Footer (`footer.stats`)**: Horizontal flex bar (`justify-content: space-between; align-items: center; gap: 24px`) anchoring the three quantitative proof points across the bottom edge.

### Responsive Strategy

#### Breakpoints (2D Width × Height Matrix)

| Breakpoint                                     | Key Token & Layout Changes                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`≥ 2560px`** (Ultra-Wide 4K)        | `--h1: 88px`, `--lede: 22px`, `--header-x: 120px`, `--stats-x: 160px`, `--copy-max: 1280px`, `--lede-max: 680px`                                                                                                                                                                     |
| **`≥ 1920px`** (1080p+ Desktop)       | `--h1: 76px`, `--lede: 20px`, `--nav-h: 48px`, `--btn-h: 48px`, `--hero-btn-h: 52px`, `--header: 32px × 80px`, `--stats: 120px × 52px`, `--copy-max: 1120px`, `--lede-max: 620px`                                                                                            |
| **`≥ 1600px`** (Large Desktop)        | `--h1: 64px`, `--lede: 18px`, `--nav-h: 44px`, `--btn-h: 44px`, `--hero-btn-h: 48px`, `--header: 28px × 64px`, `--stats: 96px × 44px`, `--copy-max: 980px`, `--lede-max: 540px`                                                                                              |
| **`1280px – 1599px`**                 | `--h1: 54px`, `--lede: 16px`, `--header-x: 48px`, `--stats-x: 80px`, `--copy-max: 900px`                                                                                                                                                                                               |
| **`901px – 1279px`** (Small Laptop)   | `--h1: 42px`, `--lede: 15px`, `--nav-h: 36px`, `--btn-h: 38px`, `--hero-btn-h: 40px`, `--header: 16px × 28px`, `--stats: 36px × 28px`, `--hero-gap: 64px`, `--copy-max: 760px`                                                                                               |
| **`≥ 901px` & `max-height: 850px`** | Compresses vertical rhythm to preserve no-scroll lock: `--header-y: 14px`, `--stats-y: 24px`, `--hero-gap: 48px`, `--h1: 40px`                                                                                                                                                           |
| **`≥ 901px` & `max-height: 720px`** | Tight vertical lock: `--h1: 34px`, `--lede: 14px`, `--hero-gap: 32px`, `--stats-y: 18px`, `--nav-h: 30px`, `--btn-h: 34px`, `--hero-btn-h: 36px`                                                                                                                                   |
| **`≤ 900px`** (Tablet / Phone)        | Unlocks vertical scroll (`height: auto; overflow-y: auto`). Header switches to `1fr auto auto`, reveals `.burger`, converts `#site-nav` into a full-screen `blur(24px)` column drawer (`56px` tall links at `19px`), and stacks `.stats` into a centered column (`gap: 16px`). |
| **`≤ 560px`** (Compact Phone)         | `--h1: 34px`, `--lede: 16px`, `--header-x: 16px`. `.hero-actions` stacks vertically (`flex-direction: column`) with `width: 100%` buttons.                                                                                                                                           |

---

## Elevation & Depth

| Level                            | Treatment                                                                                               | Use                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **0 — Canvas**            | Pure `#000000` + `.hero-photo` video layer                                                          | Root viewport backdrop                    |
| **1 — Metallic Pill**     | `105deg` dark metallic gradient + `1px` `rgba(198,198,198,0.55)` border                           | Header navigation links (`#site-nav a`) |
| **2 — Frosted Glass**     | `135deg` translucent gradient + `backdrop-filter: blur(16px)` + `inset 0 1px 0`                   | Hero secondary CTA (`See it in action`) |
| **3 — Solid Specular**    | `180deg` `#fff → #cfcfcf` gradient + `1px solid #fff` + `inset 0 1px 0 rgba(255,255,255,0.95)` | Primary CTAs (`Start for Free`)         |
| **4 — Modal Blur Drawer** | `rgba(8,8,8,0.42)` scrim + `backdrop-filter: blur(24px)` (`z-index: 40–45`)                      | Mobile full-screen navigation overlay     |
| **5 — Film Grain**        | `opacity: 0.035` SVG `feTurbulence` (`z-index: 100`)                                              | Topmost tactile cohesion layer            |

### Specular Shine & Glow Mechanics

- **Nav Pill Shine (`#site-nav a::before`)**: A `115deg` linear gradient (`transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%`) sits at `translateX(-120%)` and sweeps to `translateX(120%)` over `0.6s ease` on hover, accompanied by `0 0 18px rgba(200, 210, 230, 0.18)`.
- **Button Shine (`.btn::after`)**: A stronger `115deg` highlight (`transparent 20%, rgba(255,255,255,0.45) 48%, transparent 76%`) sweeps from `translateX(-130%)` to `translateX(130%)` over `0.65s ease`.
- **Solid Button Hover Elevation**: Combines an inner top highlight (`inset 0 1px 0 #fff`), an ice-blue ambient halo (`0 0 22px rgba(186,208,255,0.35)`, boosted to `26px` / `0.40` in `.hero-actions`), and a soft downward lift (`0 8px 18px rgba(255,255,255,0.12–0.14)`).

---

## Shapes

### Border Radius Scale

| Token              | Value | Use                                                                                                                    |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `{rounded.none}` | 0px   | Full-bleed `.hero-photo`, `.grain`, and `.menu-backdrop` layers                                                  |
| `{rounded.xs}`   | 5px   | Hero eyebrow `.badge` (`Operational AI Infrastructure`)                                                            |
| `{rounded.sm}`   | 6px   | All `.btn` controls (`Start for Free`, `See it in action`) and `.burger` toggle (`6.2px` on stat 2 SVG tile) |
| `{rounded.md}`   | 7px   | Desktop `#site-nav a` liquid-metal pills                                                                             |
| `{rounded.lg}`   | 10px  | Mobile full-width `#site-nav a` drawer links (`≤ 900px`)                                                          |

Unlike stadium-pill design systems (`9999px`), Vesper.ai uses **tightly machined architectural corners (`5px–7px`)** on desktop controls. This machined geometry reinforces an industrial, infrastructure-grade aesthetic.

### Custom SVG Iconography Geometry

- **Brand Mark (`.logo svg`)**: `22×22` (`viewBox="0 0 24 24"`), rotated `-30deg` around center `(12, 12)`. Composed of two vertical rounded capsules (`width="3.6" height="14.6" rx="1.8"` at `x=5.5` and `x=14.9`) paired with two opposing terminal dots (`r="1.45"` at `cx=7.3, cy=3.2` and `cx=16.7, cy=20.8`). Also encoded as a white SVG data URI for the document favicon.
- **Badge Sparkle (`.badge-star`)**: `18×20` 4-point concave star path with `drop-shadow(0 0 3px rgba(255,255,255,0.45))`.
- **Stat 1 — Workflow Dual-Pill**: Two vertical rounded capsules (`7.2×18.8`, `rx="3.6"`) filled with opposing diagonal white-to-charcoal linear gradients, bridged by a central horizontal connector (`5.6×2.2`, `rx="1.1"`, `#4a4a4a`).
- **Stat 2 — Download Tile**: Solid `#ffffff` squircle (`19.2×19.2`, `rx="6.2"`) housing a `#111111` downward arrow (`stroke-width="1.85"`, round caps/joins).
- **Stat 3 — Team Avatar Trio (`.stat-icon-wide`)**: `38×21` (`viewBox="0 0 40 22"`) overlapping horizontal cluster of three `r="9.2"` circles at `cx="10.2"`, `20.2`, and `30.2`:
  1. Dark charcoal (`#2b2b2b`) circle with a stylized pale cat/fox silhouette (`#f4f4f4` face ellipse + ear polygons + `#1a1a1a` eyes).
  2. Crisp white (`#ffffff`) circle with a minimalist smiling face (`#111` eyes, nose ellipse, and curved smile path).
  3. Vibrant orange (`#f26b1d`) circle with a centered bold white `Inter` lowercase `e`.

---

## Components

### Navigation & Header (`header.header`)

**`logo`**

- Left-aligned flex lockup (`gap: 9px`), `-30deg` dual-capsule SVG mark + `Vesper` (`600`) + `.ai` (`400`). Enters with `appear--scale` at `--d: 0.08s`.

**`nav-pill-metal` (`#site-nav a`)**

- Four links: `Benefits` (`#benefits`, `appear--scale`, `0.16s`), `How It Works` (`#how-it-works`, `appear--soft`, `0.28s`), `FAQs` (`#faqs`, `appear--scale`, `0.40s`), `Pricing` (`#pricing`, `appear--soft`, `0.52s`).
- `40px` height, `0 18px` padding, `7px` radius, `105deg` metallic gradient, `::before` specular sweep.

**`burger-toggle` (`.burger`)**

- Hidden on desktop (`>= 901px`); `display: grid` (`42×42px`, `6px` radius) on `<= 900px`.
- Contains three `16×1.5px` white bars (`gap: 5px`). When `body.menu-open` is active, bar 1 transforms with `translateY(6.5px) rotate(45deg)`, bar 2 fades to `opacity: 0`, and bar 3 transforms with `translateY(-6.5px) rotate(-45deg)`.

### Buttons (`.btn`)

**`button-solid` (`.btn-solid`)**

- Used for Header CTA (`--d: 0.34s`, `40px` height) and Hero Primary CTA (`--d: 0.96s`, `42px` height).
- White-to-silver vertical gradient, `#111` text, `1px solid #fff`, `::after` shine sweep, and ice-blue hover luminescence.

**`button-hero-ghost` (`.hero-actions .btn-ghost`)**

- Used for `See it in action` (`#demo`, `appear--side`, `--d: 1.10s`, `42px` height).
- `135deg` dark frosted gradient with `backdrop-filter: blur(16px)` and `rgba(198,198,198,0.55)` border.

### Hero Content (`.hero-copy`)

**`badge-infrastructure` (`.badge`)**

- Borderless `5px`-radius pill (`9px 15px` padding) with `90deg` `#7d7d7d → #2a2a2a → #0a0a0a` gradient, glowing `.badge-star` SVG (`in-star` animation), and `Operational AI Infrastructure` label (`appear--pop`, `--d: 0.22s`).

**`headline` (`h1` + `.headline-line`)**

- Two masked rows (`--d: 0.42s` and `--d: 0.62s`, `appear--mask`) with `em` (`in-em` blur-to-sharp animation, `1.2s` duration, `0.72s` delay).

**`lede` (`.lede`)**

- Constrained to `470px` max-width (`#9a9a9a`), entering via `appear--soft` at `--d: 0.82s` with an extended `1.25s` duration.

### Entrance Motion System (`.appear`)

Every animated element rests at `opacity: 1` so the page is never blank if scripts or CSS animations are blocked, using `animation-fill-mode: both` (`1.05s`, `cubic-bezier(0.16, 1, 0.3, 1)`) to apply the `0%` keyframe during its `--d` delay:

- **`in-scale`**: `opacity: 0; transform: scale(0.84)` → identity
- **`in-soft`**: `opacity: 0; transform: translateY(14px)` → identity
- **`in-mask`**: `opacity: 0; transform: translateY(40%)` → identity (clipped by `.headline-line`)
- **`in-pop`**: `0%` `scale(0.9)` → `70%` `scale(1.03)` → `100%` `scale(1)`
- **`in-btn`**: `opacity: 0; transform: translateY(18px) scale(0.94)` → identity
- **`in-side`**: `opacity: 0; transform: translateX(22px)` → identity
- **`in-stat`**: `opacity: 0; transform: translateY(20px)` → identity
- **`in-star`**: `0%` `scale(0.2) rotate(-50deg)` → `65%` `scale(1.2) rotate(8deg)` → `100%` identity
- **`in-em`**: `0%` `opacity: 0.35; filter: blur(4px)` → `100%` `opacity: 1; filter: blur(0)`

---

## Do's and Don'ts

### Do

- **Force `#000000` immediately** via inline `body` styles and priority CSS rules so the canvas never flashes white before assets load.
- **Keep desktop locked to a single frame (`100dvh`)** on viewports `>= 901px` and adjust vertical tokens on short viewports (`max-height: 850px` / `720px`) so the header, hero, and stats footer always fit without scrolling.
- **Anchor hero copy to the bottom (`align-items: flex-end`)** rather than vertically centering it, preserving open breathing room for the background video in the upper viewport.
- **Use tight `5px–7px` radii** on buttons, badges, and metallic nav pills to maintain the machined infrastructure feel.
- **Apply `Instrument Serif` italic in `#9a9a9a` exclusively to `"AI agents"`** inside the H1, leaving all other typography in tightly tracked `Inter`.
- **Ensure resilient animations** by keeping `.appear` resting `opacity: 1`, locking finished elements with `.is-in` on `animationend`, and verifying via double `requestAnimationFrame` + `prefers-reduced-motion: reduce`.

### Don't

- **Don't use `9999px` stadium pills** for buttons or navigation links — Vesper.ai's controls are rectangular with crisp `6px–7px` corners.
- **Don't add extra sections below the fold** (no feature grids, pricing tables, forms, or multi-column sitemaps); the three-stat proof bar is the terminal element of the viewport.
- **Don't set the `Instrument Serif` accent in pure white** — its `#9a9a9a` muted silver contrast against `#ffffff` `Inter` is the signature typographic detail.
- **Don't use flat solid fills on interactive controls** — every nav link and button relies on directional multi-stop gradients, `1px` specular borders, and diagonal shine pseudo-elements.
- **Don't leave `.appear` elements at `opacity: 0` at rest** — always use `opacity: 1` with `animation-fill-mode: both` and the `.is-in` JS fallback so content can never get stuck invisible.
