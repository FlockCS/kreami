/**
 * Editorial design tokens.
 *
 * Source of truth is the design canvas (see design/screens/*.dc.html). This file
 * exists for the places Tailwind classes cannot reach — navigation themes, SVG
 * fills, status bar, splash — and must be kept in step with tailwind.config.js.
 *
 * The mockups express accents in oklch. React Native cannot parse oklch, so
 * these are the converted sRGB equivalents:
 *   accent      oklch(0.44 0.13 20) -> #8C2C33
 *   accentPress oklch(0.36 0.11 20) -> #6B1D24
 */

export const colors = {
  /** Page background — warm off-white. */
  paper: '#FAF7F1',
  /** Primary text and hard rules. */
  ink: '#17130F',
  /** Body copy and Kreami notes. */
  body: '#4A423A',
  /** Metadata, labels, secondary text. */
  muted: '#8C8177',
  /** Counters and de-emphasised metadata. */
  faint: '#B0A597',
  /** Hairline dividers. */
  rule: '#E4DCD0',
  /** Avatar placeholders, histogram tracks. */
  fill: '#EAE2D6',
  /** Unfilled Kream glyph stroke. */
  empty: '#CFC4B4',
  /** The single accent. Filled Kreams, primary buttons, 0/5 numerals. */
  accent: '#8C2C33',
  /** Pressed state for accent surfaces. */
  accentPress: '#6B1D24',
} as const;

export const fonts = {
  /** Titles and every numeral. */
  serif: 'InstrumentSerif_400Regular',
  sans: 'Archivo_400Regular',
  sansMedium: 'Archivo_500Medium',
  sansSemibold: 'Archivo_600SemiBold',
} as const;

/**
 * React Native letterSpacing is absolute px, not em. These resolve the
 * mockup's em values against the sizes they are actually used at.
 */
export const tracking = {
  /** 0.18em at 10px — section labels. */
  label: 1.8,
  /** 0.12em at 10px — topic average and count. */
  meta: 1.2,
  /** 0.14em at 11px — sort tabs. */
  tab: 1.5,
} as const;

/** The rating scale. Six discrete values, no halves. See docs/01-product-vision.md. */
export const KREAM_MIN = 0;
export const KREAM_MAX = 5;

/** Below this many Kreamis a Topic shows no average. See docs/02-domain-model.md. */
export const MIN_KREAMIS_FOR_AVERAGE = 3;

export type Colors = typeof colors;
