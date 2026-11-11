/**
 * Brand colors for the share images (founder call, 2026-09-24).
 *
 * Each artist can set two colors, a background and an accent, and the share
 * posters use them instead of Urganize's own ink and spring green. Nothing
 * else about the poster changes: same layout, same fonts, same small mark.
 *
 * A PERSON PICKS TWO COLORS; EVERYTHING ELSE IS DERIVED, and the derivation is
 * the point. People choose brand colors by feel, and two colors that look
 * right side by side can still make words unreadable on a phone in the sun.
 * So:
 *
 *   1. The text color is never chosen. It is cream or ink, whichever reads
 *      better on the background, so the headline always stays readable.
 *   2. An accent too close to its background is taken OFF the words and kept
 *      on the decorations only (the rule under the eyebrow and the small
 *      square), where it cannot hide anything. So a bad pair can make an image
 *      plain, never unreadable. Settings says so when it happens.
 *
 * Share images and, since 2026-11-11 (#1209, founder call), the artist's own
 * page in the app (lib/artist-brand-theme.ts reuses these helpers). The
 * founder's no-themes rule (one fixed look for press kits, the recap card and
 * every public page) still stands everywhere else.
 *
 * Pure and dependency free, like social-share.ts: the Settings preview, the
 * share-card route and the tests all run the SAME rules, so the preview can
 * never promise a poster the route does not draw.
 */

import { settingsDeepLink } from '@/lib/settings-nav';

export const isBrandColorsEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_BRAND_COLORS === 'true';

/**
 * The share-card route answers with this header, 'brand' or 'default', so the
 * sheet knows whose colors a poster is in without asking a second time.
 */
export const SHARE_PALETTE_HEADER = 'X-Share-Palette';

/** Where Settings keeps the editor, so the share sheet can link straight to it. */
export const BRAND_COLORS_SETTINGS_ANCHOR = 'brand-colors';
export const BRAND_COLORS_SETTINGS_HREF = settingsDeepLink({
  segment: 'artists',
  section: BRAND_COLORS_SETTINGS_ANCHOR,
});

/** What an artist has chosen. null means "use Urganize's color" for that slot. */
export type BrandColors = { background: string | null; accent: string | null };

export const NO_BRAND_COLORS: BrandColors = { background: null, accent: null };

export type SharePalette = {
  background: string;
  /** Cream or ink, whichever reads better on the background. */
  text: string;
  textMuted: string;
  textFaint: string;
  /** Fills only: the rule and the square beside the extra line. */
  accent: string;
  /** The accent where it reads on the background, the text color where it does not. */
  accentText: string;
  /** True when the artist set at least one color. */
  isBrand: boolean;
};

// Urganize's own colors, Brand Bible screen mode. With no brand colors the
// palette is EXACTLY what the posters drew before this existed, down to the
// rgba strings, and a test pins that.
export const SHARE_INK = '#0D120E';
export const SHARE_SPRING = '#7FD99A';
export const SHARE_CREAM = '#F5F0E6';

/**
 * The accent is only ever used for large type on the poster (the eyebrow, the
 * artist line, the date), so WCAG's floor for large text is the right bar.
 */
export const MIN_ACCENT_CONTRAST = 3;

const HEX_SIX = /^#?([0-9a-f]{6})$/i;
const HEX_THREE = /^#?([0-9a-f]{3})$/i;

/**
 * "#1a2b3c", "1A2B3C", "#abc" or "abc" as "#1A2B3C". Anything else is null.
 * Uppercase because that is what the database constraint accepts, so the API
 * and the check can never disagree about one color written two ways.
 */
export function normalizeHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const six = HEX_SIX.exec(trimmed);
  if (six) return `#${six[1].toUpperCase()}`;
  const three = HEX_THREE.exec(trimmed);
  if (three) {
    const [r, g, b] = three[1].toUpperCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(normalizeHexColor(hex) ?? SHARE_INK).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, from 1 (identical) to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Cream or ink, whichever reads better on this background. Ties go to cream. */
export function readableTextColor(background: string): string {
  return contrastRatio(SHARE_CREAM, background) >= contrastRatio(SHARE_INK, background)
    ? SHARE_CREAM
    : SHARE_INK;
}

// Written the way the poster always wrote its muted cream, so the default
// palette is byte for byte the old one.
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveSharePalette(brand: BrandColors | null | undefined): SharePalette {
  const chosenBackground = normalizeHexColor(brand?.background);
  const chosenAccent = normalizeHexColor(brand?.accent);
  const background = chosenBackground ?? SHARE_INK;
  const accent = chosenAccent ?? SHARE_SPRING;
  const text = readableTextColor(background);
  return {
    background,
    text,
    textMuted: withAlpha(text, 0.66),
    textFaint: withAlpha(text, 0.44),
    accent,
    accentText: contrastRatio(accent, background) >= MIN_ACCENT_CONTRAST ? accent : text,
    isBrand: chosenBackground !== null || chosenAccent !== null,
  };
}

/**
 * The one warning Settings shows, or null when there is nothing to warn about.
 * It fires exactly when the palette moved the accent off the words, so the
 * sentence and the poster can never disagree.
 */
export function describeBrandColorWarning(brand: BrandColors | null | undefined): string | null {
  const palette = resolveSharePalette(brand);
  if (!palette.isBrand || palette.accentText === palette.accent) return null;
  const tone = palette.text === SHARE_CREAM ? 'light' : 'dark';
  return `The accent is hard to read on this background, so the words use ${tone} text instead. The accent still shows on the lines.`;
}

export function sameBrandColors(first: BrandColors, second: BrandColors): boolean {
  return (
    normalizeHexColor(first.background) === normalizeHexColor(second.background) &&
    normalizeHexColor(first.accent) === normalizeHexColor(second.accent)
  );
}

const COLOR_ERROR = 'Use a color like #1A2B3C.';

/**
 * The body the Settings editor sends. Each slot is a color, or null (or an
 * empty string) for "use Urganize's". A slot that is present but not a color
 * is refused rather than dropped, so a typo is answered, not silently saved as
 * "no color".
 */
export function parseBrandColorsInput(
  body: unknown
): { ok: true; value: BrandColors } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: COLOR_ERROR };
  const record = body as Record<string, unknown>;

  const readSlot = (value: unknown): { ok: true; value: string | null } | { ok: false } => {
    if (value === undefined || value === null) return { ok: true, value: null };
    if (typeof value === 'string' && value.trim() === '') return { ok: true, value: null };
    const hex = normalizeHexColor(value);
    return hex ? { ok: true, value: hex } : { ok: false };
  };

  const background = readSlot(record.background);
  const accent = readSlot(record.accent);
  if (!background.ok || !accent.ok) return { ok: false, error: COLOR_ERROR };
  return { ok: true, value: { background: background.value, accent: accent.value } };
}
