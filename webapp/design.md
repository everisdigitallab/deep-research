# Design - GPT Researcher Innovation Center

A locked design system for the Innovation Center surfaces in this app. Every page redesign should read this file before emitting code. This system aligns the project to a modern NTT DATA-inspired enterprise aesthetic while keeping the product more current and product-led.

## Genre
modern-minimal

## Macrostructure family
- Marketing pages: Marquee Hero with card-led destination choices and restrained editorial proof rows
- App pages: Workbench with a strong top bar, split hero, and layered control surfaces
- Content pages: Long Document with compact utility chrome

## Theme
- `--color-paper`: oklch(98% 0.008 247)
- `--color-paper-2`: oklch(95% 0.014 244)
- `--color-ink`: oklch(27% 0.03 250)
- `--color-ink-2`: oklch(48% 0.022 248)
- `--color-rule`: oklch(89% 0.012 244)
- `--color-accent`: oklch(53% 0.17 234)
- `--color-accent-2`: oklch(71% 0.11 205)
- `--color-focus`: oklch(62% 0.19 234)
- Accent discipline: keep chromatic accent at or below 8% of the viewport

## Typography
- Display: Space Grotesk, weight 700, style normal
- Body: Manrope, weight 400
- Mono: JetBrains Mono, weight 500
- Display tracking: -0.04em
- Type scale anchor: `--text-display` = clamp(3rem, 4vw, 5.25rem)

## Spacing
4-point named scale. Use named tokens only.

## Motion
- Easings: `--ease-out`, `--ease-in-out`
- Reveal pattern: fade plus subtle translateY on non-critical panels only
- Reduced motion fallback: opacity-only, <= 150ms

## Microinteractions stance
- Silent success
- Hover delay 800ms for tooltips, focus delay 0ms
- Buttons lift 1px max
- Focus ring appears instantly

## CTA voice
- Primary CTA: filled accent surface, rounded pill, direct verb
- Secondary CTA: quiet outline, same radius, no ghost-only ambiguity

## Per-page allowances
- Marketing pages may use soft gradients and ambient radial highlights
- App pages must stay mostly functional and panel-driven
- Content pages should remain typography-first

## What pages MUST share
- Light paper background with blue-driven accent
- Display and body font pairing
- Pill-based navigation and CTA rhythm
- Soft bordered cards with subtle shadow
- Compact executive tone

## What pages MAY differ on
- Hero composition
- Utility layout inside app surfaces
- Density of supporting cards

## Exports

### tokens.css
```css
:root {
  --color-paper: oklch(98% 0.008 247);
  --color-paper-2: oklch(95% 0.014 244);
  --color-paper-3: oklch(92% 0.018 244);
  --color-ink: oklch(27% 0.03 250);
  --color-ink-2: oklch(48% 0.022 248);
  --color-rule: oklch(89% 0.012 244);
  --color-accent: oklch(53% 0.17 234);
  --color-accent-2: oklch(71% 0.11 205);
  --color-accent-ink: oklch(99% 0.003 240);
  --color-focus: oklch(62% 0.19 234);
  --color-success: oklch(64% 0.14 161);
  --color-warning: oklch(76% 0.15 82);
  --color-danger: oklch(63% 0.19 22);

  --font-display: "Space Grotesk", "Segoe UI", sans-serif;
  --font-body: "Manrope", "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "SFMono-Regular", monospace;

  --space-3xs: 0.25rem;
  --space-2xs: 0.5rem;
  --space-xs: 0.75rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2rem;
  --space-xl: 3rem;
  --space-2xl: 4.5rem;
  --space-3xl: 6rem;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-2xl: 2.4rem;
  --text-display: clamp(3rem, 4vw, 5.25rem);
  --text-display-s: clamp(2.4rem, 3vw, 4rem);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-short: 180ms;
  --dur-mid: 260ms;

  --radius-card: 28px;
  --radius-pill: 999px;
  --radius-input: 18px;
  --shadow-soft: 0 20px 60px rgba(13, 29, 58, 0.08);
  --shadow-card: 0 10px 30px rgba(13, 29, 58, 0.06);
}
```
