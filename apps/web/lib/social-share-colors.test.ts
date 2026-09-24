import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_ACCENT_CONTRAST,
  SHARE_CREAM,
  SHARE_INK,
  SHARE_SPRING,
  contrastRatio,
  describeBrandColorWarning,
  isBrandColorsEnabled,
  normalizeHexColor,
  parseBrandColorsInput,
  readableTextColor,
  resolveSharePalette,
  sameBrandColors,
} from './social-share-colors';

describe('normalizeHexColor', () => {
  it('writes every color the one way the database accepts', () => {
    expect(normalizeHexColor('#1a2b3c')).toBe('#1A2B3C');
    expect(normalizeHexColor('1A2B3C')).toBe('#1A2B3C');
    expect(normalizeHexColor('  #abc ')).toBe('#AABBCC');
    expect(normalizeHexColor('fff')).toBe('#FFFFFF');
  });

  it('refuses anything that is not a plain color', () => {
    for (const value of ['', '#12345', '#1234567', 'red', 'rgb(0,0,0)', '#GGGGGG', '#1a2b3c80', null, 12, {}]) {
      expect(normalizeHexColor(value)).toBeNull();
    }
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a color on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#7FD99A', '#7FD99A')).toBeCloseTo(1, 5);
  });

  it('matches the Brand Bible figure for spring on ink', () => {
    expect(contrastRatio(SHARE_SPRING, SHARE_INK)).toBeGreaterThan(10.5);
    expect(contrastRatio(SHARE_SPRING, SHARE_INK)).toBeLessThan(11.5);
  });

  it('does not care which color is first', () => {
    expect(contrastRatio('#123456', '#EEDDCC')).toBeCloseTo(contrastRatio('#EEDDCC', '#123456'), 10);
  });
});

describe('readableTextColor', () => {
  it('uses cream on dark grounds and ink on light ones', () => {
    expect(readableTextColor(SHARE_INK)).toBe(SHARE_CREAM);
    expect(readableTextColor('#1B1464')).toBe(SHARE_CREAM);
    expect(readableTextColor('#FFD700')).toBe(SHARE_INK);
    expect(readableTextColor('#F5F0E6')).toBe(SHARE_INK);
  });

  it('always picks the better of the two', () => {
    for (const ground of ['#777777', '#FF0000', '#00AA88', '#8844CC', '#FFFFFF', '#000000']) {
      const picked = readableTextColor(ground);
      const other = picked === SHARE_CREAM ? SHARE_INK : SHARE_CREAM;
      expect(contrastRatio(picked, ground)).toBeGreaterThanOrEqual(contrastRatio(other, ground));
    }
  });
});

describe('resolveSharePalette', () => {
  it('draws the posters exactly as they were before brand colors existed', () => {
    // These strings are the constants the poster used to hard code. A change
    // here would quietly recolor every poster of every team with no brand
    // colors, which is almost everyone.
    expect(resolveSharePalette(null)).toEqual({
      background: '#0D120E',
      text: '#F5F0E6',
      textMuted: 'rgba(245, 240, 230, 0.66)',
      textFaint: 'rgba(245, 240, 230, 0.44)',
      accent: '#7FD99A',
      accentText: '#7FD99A',
      isBrand: false,
    });
    expect(resolveSharePalette({ background: null, accent: null })).toEqual(resolveSharePalette(null));
  });

  it('uses the artist’s colors when they have them', () => {
    const palette = resolveSharePalette({ background: '#1b1464', accent: '#ffd700' });
    expect(palette.background).toBe('#1B1464');
    expect(palette.accent).toBe('#FFD700');
    expect(palette.accentText).toBe('#FFD700');
    expect(palette.text).toBe(SHARE_CREAM);
    expect(palette.isBrand).toBe(true);
  });

  it('turns the text dark on a light brand background, muted shades included', () => {
    const palette = resolveSharePalette({ background: '#FFD700', accent: '#1B1464' });
    expect(palette.text).toBe(SHARE_INK);
    expect(palette.textMuted).toBe('rgba(13, 18, 14, 0.66)');
    expect(palette.textFaint).toBe('rgba(13, 18, 14, 0.44)');
  });

  it('takes an accent too close to its background off the words, and keeps it on the lines', () => {
    const palette = resolveSharePalette({ background: '#123456', accent: '#1A3C5E' });
    expect(contrastRatio('#1A3C5E', '#123456')).toBeLessThan(MIN_ACCENT_CONTRAST);
    expect(palette.accent).toBe('#1A3C5E');
    expect(palette.accentText).toBe(palette.text);
  });

  it('never leaves words unreadable, whatever two colors somebody picks', () => {
    const samples = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#777777', '#FFD700', '#7FD99A'];
    for (const background of samples) {
      for (const accent of samples) {
        const palette = resolveSharePalette({ background, accent });
        expect(contrastRatio(palette.text, palette.background)).toBeGreaterThanOrEqual(3.9);
        expect(contrastRatio(palette.accentText, palette.background)).toBeGreaterThanOrEqual(
          Math.min(MIN_ACCENT_CONTRAST, contrastRatio(palette.text, palette.background))
        );
      }
    }
  });

  it('fills one slot from Urganize’s colors when only the other is set', () => {
    expect(resolveSharePalette({ background: '#FFD700', accent: null }).accent).toBe(SHARE_SPRING);
    expect(resolveSharePalette({ background: null, accent: '#FF3366' }).background).toBe(SHARE_INK);
  });

  it('ignores a malformed stored color rather than drawing it', () => {
    expect(resolveSharePalette({ background: 'not a color', accent: null })).toEqual(resolveSharePalette(null));
  });
});

describe('describeBrandColorWarning', () => {
  it('says nothing for Urganize’s colors or a readable pair', () => {
    expect(describeBrandColorWarning(null)).toBeNull();
    expect(describeBrandColorWarning({ background: '#1B1464', accent: '#FFD700' })).toBeNull();
  });

  it('warns exactly when the poster moves the accent off the words', () => {
    const pairs: Array<[string, string]> = [
      ['#123456', '#1A3C5E'],
      ['#FFFFFF', '#FFEE88'],
      ['#1B1464', '#FFD700'],
    ];
    for (const [background, accent] of pairs) {
      const palette = resolveSharePalette({ background, accent });
      const warning = describeBrandColorWarning({ background, accent });
      expect(Boolean(warning)).toBe(palette.accentText !== palette.accent);
    }
  });

  it('names the text it switched to, in plain words', () => {
    expect(describeBrandColorWarning({ background: '#123456', accent: '#1A3C5E' })).toMatch(/light text/);
    expect(describeBrandColorWarning({ background: '#FFFFFF', accent: '#FFEE88' })).toMatch(/dark text/);
  });
});

describe('sameBrandColors', () => {
  it('treats one color written two ways as the same', () => {
    expect(sameBrandColors({ background: '#abc', accent: null }, { background: '#AABBCC', accent: null })).toBe(true);
    expect(sameBrandColors({ background: '#AABBCC', accent: null }, { background: '#AABBCD', accent: null })).toBe(false);
  });
});

describe('parseBrandColorsInput', () => {
  it('accepts two colors, or none, and writes them the one way', () => {
    expect(parseBrandColorsInput({ background: '#1a2b3c', accent: 'fff' })).toEqual({
      ok: true,
      value: { background: '#1A2B3C', accent: '#FFFFFF' },
    });
    expect(parseBrandColorsInput({ background: null, accent: '' })).toEqual({
      ok: true,
      value: { background: null, accent: null },
    });
    expect(parseBrandColorsInput({})).toEqual({ ok: true, value: { background: null, accent: null } });
  });

  it('refuses a typo rather than saving it as no color', () => {
    const parsed = parseBrandColorsInput({ background: '#12345', accent: null });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/#1A2B3C/);
    expect(parseBrandColorsInput(null).ok).toBe(false);
    expect(parseBrandColorsInput('red').ok).toBe(false);
  });
});

describe('isBrandColorsEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on only when the flag says exactly true', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_BRAND_COLORS', 'true');
    expect(isBrandColorsEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_BRAND_COLORS', '1');
    expect(isBrandColorsEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_BRAND_COLORS', '');
    expect(isBrandColorsEnabled()).toBe(false);
  });
});
