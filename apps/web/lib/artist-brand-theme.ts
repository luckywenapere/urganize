/**
 * An artist's page in that artist's brand colors (founder, 2026-11-11, #1209).
 *
 * The two colors a manager sets in Settings (a background and an accent, the
 * same pair the share images use) now also theme the artist page: the band
 * behind the name, the Up next card, the page ground, buttons and links. The
 * Urganize texture stays on top of every palette (the woven grain, the frame,
 * the tooth edge under the band), so each artist feels different while the
 * app still feels like one thing.
 *
 * A PERSON PICKS TWO COLORS; EVERYTHING ELSE IS DERIVED, the rule
 * social-share-colors.ts already follows:
 *
 *   1. Text color is never chosen. Every surface gets cream or ink, whichever
 *      reads better on it.
 *   2. The color used for small text and links on the page (`--color-brand`)
 *      has to clear 4.5:1 on the page ground. The accent is tried first, then
 *      the background, then each one stepped toward the theme's text color
 *      until it reads. So a pale accent never becomes an unreadable link.
 *   3. The page ground and cards are only tinted (about a tenth of the brand),
 *      so body text keeps the contrast the house tokens were tuned for.
 *
 * An artist with no colors set gets NOTHING from here (null), so their page is
 * byte for byte the house page.
 *
 * Pure and dependency free apart from the shared hex helpers, so the tests run
 * the exact rules the page draws.
 */

import {
  contrastRatio,
  normalizeHexColor,
  readableTextColor,
  type BrandColors,
} from '@/lib/social-share-colors';

type Rgb = [number, number, number];

/** The theme's own colors the brand is mixed into, from globals.css. */
type ThemeBase = {
  base: Rgb;
  surface: Rgb;
  hover: Rgb;
  active: Rgb;
  text: Rgb;
  house: Rgb;
  groundMix: number;
  surfaceMix: number;
};

const LIGHT: ThemeBase = {
  base: [245, 240, 230],
  surface: [250, 245, 236],
  hover: [235, 230, 220],
  active: [228, 223, 212],
  text: [26, 22, 17],
  house: [20, 100, 58],
  groundMix: 0.1,
  surfaceMix: 0.05,
};

const DARK: ThemeBase = {
  base: [12, 12, 13],
  surface: [23, 23, 25],
  hover: [32, 32, 35],
  active: [32, 32, 35],
  text: [242, 242, 240],
  house: [127, 217, 154],
  groundMix: 0.12,
  surfaceMix: 0.08,
};

/** Small text and links on the page ground. */
export const MIN_PAGE_TEXT_CONTRAST = 4.5;

/** The attribute the artist page carries while it is themed. */
export const ARTIST_BRAND_ATTR = 'data-artist-brand';

export function hexToRgb(hex: string): Rgb {
  const value = (normalizeHexColor(hex) ?? '#000000').slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** `amount` of `to` mixed into `from` (0 is all `from`, 1 is all `to`). */
export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * amount)) as Rgb;
}

const triplet = (rgb: Rgb) => `${rgb[0]} ${rgb[1]} ${rgb[2]}`;

/**
 * The first candidate that reads at `min` on `ground`. Each candidate is tried
 * as it is, then stepped toward `towards` (the theme's text color) a quarter
 * at a time, so a near miss keeps most of its hue instead of falling straight
 * back to the house color. `fallback` when nothing reads.
 */
export function readableOn(ground: Rgb, candidates: Rgb[], towards: Rgb, fallback: Rgb, min: number): Rgb {
  const groundHex = rgbToHex(ground);
  for (const step of [0, 0.25, 0.5, 0.75]) {
    for (const candidate of candidates) {
      const tried = mixRgb(candidate, towards, step);
      if (contrastRatio(rgbToHex(tried), groundHex) >= min) return tried;
    }
  }
  return fallback;
}

export type ArtistBrandTheme = {
  /** The band behind the artist's name. */
  band: string;
  /** Text on the band: cream or ink. */
  onBand: string;
  /** Buttons and the status line on the band: the accent when it reads there. */
  bandAccent: string;
  /** Text on a bandAccent fill. */
  onBandAccent: string;
  /** The Up next card: the darker of the two colors, a touch deeper. */
  deep: string;
  onDeep: string;
  /** Page tokens per theme, as "r g b" triplets for globals.css's rgb(var()). */
  light: PageTokens;
  dark: PageTokens;
};

export type PageTokens = {
  base: string;
  surface: string;
  hover: string;
  active: string;
  brand: string;
  brandHover: string;
  /** Text on a --color-brand fill. */
  inverse: string;
};

function pageTokens(theme: ThemeBase, background: Rgb, accent: Rgb): PageTokens {
  const ground = mixRgb(theme.base, background, theme.groundMix);
  const brand = readableOn(ground, [accent, background], theme.text, theme.house, MIN_PAGE_TEXT_CONTRAST);
  return {
    base: triplet(ground),
    surface: triplet(mixRgb(theme.surface, background, theme.surfaceMix)),
    hover: triplet(mixRgb(theme.hover, background, theme.groundMix)),
    active: triplet(mixRgb(theme.active, background, theme.groundMix)),
    brand: triplet(brand),
    brandHover: triplet(mixRgb(brand, theme.text, 0.12)),
    inverse: triplet(hexToRgb(readableTextColor(rgbToHex(brand)))),
  };
}

/**
 * The theme for an artist, or null when they have not set any colors. One
 * color is enough: a missing background borrows the accent and the other way
 * round, so a manager who picked only one still gets a whole page.
 */
export function resolveArtistBrandTheme(brand: BrandColors | null | undefined): ArtistBrandTheme | null {
  const chosenBackground = normalizeHexColor(brand?.background);
  const chosenAccent = normalizeHexColor(brand?.accent);
  if (!chosenBackground && !chosenAccent) return null;

  const backgroundHex = (chosenBackground ?? chosenAccent) as string;
  const accentHex = (chosenAccent ?? chosenBackground) as string;
  const background = hexToRgb(backgroundHex);
  const accent = hexToRgb(accentHex);

  const onBand = readableTextColor(backgroundHex);
  const bandAccent =
    contrastRatio(accentHex, backgroundHex) >= MIN_PAGE_TEXT_CONTRAST ? accentHex : onBand;

  const darker = contrastRatio(backgroundHex, '#000000') <= contrastRatio(accentHex, '#000000') ? background : accent;
  // A touch deeper than the color itself, and deeper still for a mid-tone
  // (a grey reads at under 4.5:1 with both cream and ink) until its text reads.
  let deep = rgbToHex(mixRgb(darker, [0, 0, 0], 0.1));
  for (let amount = 0.2; amount <= 0.8; amount += 0.1) {
    if (contrastRatio(readableTextColor(deep), deep) >= MIN_PAGE_TEXT_CONTRAST) break;
    deep = rgbToHex(mixRgb(darker, [0, 0, 0], amount));
  }

  return {
    band: backgroundHex,
    onBand,
    bandAccent,
    onBandAccent: readableTextColor(bandAccent),
    deep,
    onDeep: readableTextColor(deep),
    light: pageTokens(LIGHT, background, accent),
    dark: pageTokens(DARK, background, accent),
  };
}

/**
 * Text a little quieter than `text` on `ground`, but never below 4.5:1: the
 * mix backs off until it reads, so a mid-tone band keeps legible captions.
 */
export function quieterOn(ground: Rgb, text: Rgb, amount: number): Rgb {
  for (let step = amount; step > 0; step -= 0.04) {
    const tried = mixRgb(text, ground, step);
    if (contrastRatio(rgbToHex(tried), rgbToHex(ground)) >= MIN_PAGE_TEXT_CONTRAST) return tried;
  }
  return text;
}

function pageBlock(tokens: PageTokens): string {
  return [
    `--color-bg-base: ${tokens.base};`,
    `--color-bg-surface: ${tokens.surface};`,
    `--color-bg-elevated: ${tokens.surface};`,
    `--color-bg-hover: ${tokens.hover};`,
    `--color-bg-active: ${tokens.active};`,
    `--color-brand: ${tokens.brand};`,
    `--color-brand-hover: ${tokens.brandHover};`,
    `--color-text-inverse: ${tokens.inverse};`,
  ].join(' ');
}

/**
 * The stylesheet the artist page renders while it is themed. The page tokens
 * go on the html element (through :has, so they arrive and leave with the
 * page, no effect needed): the body ground, the woven texture and the
 * shadcn aliases declared on :root all read them from there. The band tokens
 * are scoped to the band, whose own text tokens become cream or ink.
 */
export function artistBrandCss(theme: ArtistBrandTheme): string {
  const has = `:has([${ARTIST_BRAND_ATTR}])`;
  const band = rgbToHex(hexToRgb(theme.band));
  const onBand = hexToRgb(theme.onBand);
  const bandAccent = hexToRgb(theme.bandAccent);
  const bandRgb = hexToRgb(band);
  return [
    `html[data-theme='light']${has} { ${pageBlock(theme.light)} }`,
    `:root:not([data-theme='light'])${has} { ${pageBlock(theme.dark)} }`,
    `[${ARTIST_BRAND_ATTR}] { --artist-deep: ${theme.deep}; --artist-on-deep: ${theme.onDeep}; }`,
    `[${ARTIST_BRAND_ATTR}] .artist-brand-band {` +
      ` --artist-band: ${band}; --artist-band-accent: ${theme.bandAccent};` +
      ` background-color: var(--artist-band); color: ${theme.onBand};` +
      ` --color-text-primary: ${triplet(onBand)};` +
      ` --color-text-secondary: ${triplet(quieterOn(bandRgb, onBand, 0.18))};` +
      ` --color-text-tertiary: ${triplet(quieterOn(bandRgb, onBand, 0.3))};` +
      ` --color-stroke: ${triplet(onBand)};` +
      ` --color-brand: ${triplet(bandAccent)};` +
      ` --color-brand-hover: ${triplet(mixRgb(bandAccent, onBand, 0.14))};` +
      ` --color-text-inverse: ${triplet(hexToRgb(theme.onBandAccent))};` +
      ` --color-bg-hover: ${triplet(mixRgb(bandRgb, onBand, 0.1))};` +
      ` --color-bg-surface: ${triplet(mixRgb(bandRgb, onBand, 0.14))};` +
      ` --primary: var(--color-brand); --ring: var(--color-brand); }`,
    // Up next is a dark card from lg up (house: forest #1d2a21 with cream);
    // themed, it takes the deep brand color. Higher specificity than its
    // Tailwind classes, so the house page needs no change at all.
    `@media (min-width: 1024px) {` +
      ` [${ARTIST_BRAND_ATTR}] .artist-up-next, [${ARTIST_BRAND_ATTR}] .artist-up-next:hover { background-color: var(--artist-deep); color: var(--artist-on-deep); }` +
      ` [${ARTIST_BRAND_ATTR}] .artist-up-next .up-next-ink { color: var(--artist-on-deep); }` +
      ` [${ARTIST_BRAND_ATTR}] .artist-up-next .up-next-muted { color: color-mix(in srgb, var(--artist-on-deep) 72%, transparent); }` +
      ` [${ARTIST_BRAND_ATTR}] .artist-up-next .up-next-cta { background-color: var(--artist-on-deep); color: var(--artist-deep); }` +
      ` }`,
  ].join('\n');
}
