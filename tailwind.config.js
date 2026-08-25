/**
 * Design tokens come from the Editorial direction — see design/screens/*.dc.html
 * and the published canvas. Keep this file and src/theme/tokens.ts in step.
 *
 * The mockups express accents in oklch; React Native cannot parse oklch, so the
 * hex values here are the converted equivalents:
 *   accent       oklch(0.44 0.13 20) -> #8C2C33
 *   accentPress  oklch(0.36 0.11 20) -> #6B1D24
 *
 * Neutrals were corrected for WCAG AA (see docs/11, D14). `faint` is gone:
 * it and `muted` could not both reach 4.5:1 and stay distinguishable, so they
 * are one tone and hierarchy comes from size and weight instead.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        paper: '#FAF7F1',
        ink: '#17130F',
        body: '#4A423A',
        muted: '#786F66',
        rule: '#E4DCD0',
        fill: '#EAE2D6',
        empty: '#958D82',
        accent: '#8C2C33',
        'accent-press': '#6B1D24',
      },
      fontFamily: {
        serif: ['InstrumentSerif_400Regular'],
        sans: ['Archivo_400Regular'],
        'sans-medium': ['Archivo_500Medium'],
        'sans-semibold': ['Archivo_600SemiBold'],
      },
      // React Native letterSpacing is absolute px, not em. These are the
      // mockup's em values resolved against the sizes they are used at.
      letterSpacing: {
        label: '1.8px', // 0.18em at 10px — section labels, YOUR PROFILE
        meta: '1.2px', // 0.12em at 10px — 4.2 AVG · 38 KREAMIS
        tab: '1.5px', // 0.14em at 11px — RECENT / TOP / HIGHEST
      },
    },
  },
  plugins: [],
};
