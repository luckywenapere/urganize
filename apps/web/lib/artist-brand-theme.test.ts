import { describe, expect, it } from 'vitest';
import {
  ARTIST_BRAND_ATTR,
  MIN_PAGE_TEXT_CONTRAST,
  artistBrandCss,
  hexToRgb,
  mixRgb,
  quieterOn,
  readableOn,
  resolveArtistBrandTheme,
  rgbToHex,
} from './artist-brand-theme';
import { SHARE_CREAM, SHARE_INK, contrastRatio } from './social-share-colors';

const fromTriplet = (value: string) => rgbToHex(value.split(' ').map(Number) as [number, number, number]);

// The palettes from the founder-approved mocks (#1209), plus two hard ones:
// a pale pastel pair and a mid-tone pair whose accent barely differs.
const PALETTES = [
  { background: '#16243F', accent: '#D9A441' },
  { background: '#4A1D3F', accent: '#EF7B62' },
  { background: '#A5492A', accent: '#1F3D33' },
  { background: '#C9E2EF', accent: '#1B4F8C' },
  { background: '#F7D6E0', accent: '#FFF1A8' },
  { background: '#7A7A7A', accent: '#808080' },
];

describe('resolveArtistBrandTheme', () => {
  it('gives an artist with no colors nothing, so their page is the house page', () => {
    expect(resolveArtistBrandTheme(null)).toBeNull();
    expect(resolveArtistBrandTheme({ background: null, accent: null })).toBeNull();
    expect(resolveArtistBrandTheme({ background: 'not a color', accent: '' })).toBeNull();
  });

  it('builds a whole page from one color', () => {
    const onlyAccent = resolveArtistBrandTheme({ background: null, accent: '#4A1D3F' });
    expect(onlyAccent?.band).toBe('#4A1D3F');
    const onlyBackground = resolveArtistBrandTheme({ background: '#4A1D3F', accent: null });
    expect(onlyBackground?.band).toBe('#4A1D3F');
  });

  it('never lets the person pick a text color: every surface gets cream or ink', () => {
    for (const palette of PALETTES) {
      const theme = resolveArtistBrandTheme(palette)!;
      for (const text of [theme.onBand, theme.onDeep, theme.onBandAccent]) {
        expect([SHARE_CREAM, SHARE_INK]).toContain(text);
      }
      expect(contrastRatio(theme.onBand, theme.band)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.onDeep, theme.deep)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the page link color readable on the page ground in both themes', () => {
    for (const palette of PALETTES) {
      const theme = resolveArtistBrandTheme(palette)!;
      for (const tokens of [theme.light, theme.dark]) {
        const ratio = contrastRatio(fromTriplet(tokens.brand), fromTriplet(tokens.base));
        expect(ratio).toBeGreaterThanOrEqual(MIN_PAGE_TEXT_CONTRAST);
      }
    }
  });

  it('keeps the button label readable on its brand fill', () => {
    for (const palette of PALETTES) {
      const theme = resolveArtistBrandTheme(palette)!;
      for (const tokens of [theme.light, theme.dark]) {
        expect(contrastRatio(fromTriplet(tokens.inverse), fromTriplet(tokens.brand))).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(theme.onBandAccent, theme.bandAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the accent on the band when it reads there, and band text when it does not', () => {
    expect(resolveArtistBrandTheme({ background: '#16243F', accent: '#D9A441' })!.bandAccent).toBe('#D9A441');
    const muddy = resolveArtistBrandTheme({ background: '#7A7A7A', accent: '#808080' })!;
    expect(muddy.bandAccent).toBe(muddy.onBand);
  });

  it('only tints the page ground, so it stays close to the house cream', () => {
    const theme = resolveArtistBrandTheme({ background: '#16243F', accent: '#D9A441' })!;
    // Ink body text must still read at body-text contrast on the tinted ground.
    expect(contrastRatio(SHARE_INK, fromTriplet(theme.light.base))).toBeGreaterThanOrEqual(12);
    expect(contrastRatio('#F2F2F0', fromTriplet(theme.dark.base))).toBeGreaterThanOrEqual(12);
  });

  it('puts the Up next card on the darker of the two colors', () => {
    const light = resolveArtistBrandTheme({ background: '#C9E2EF', accent: '#1B4F8C' })!;
    expect(contrastRatio(light.deep, '#000000')).toBeLessThan(contrastRatio('#C9E2EF', '#000000'));
  });
});

describe('readableOn', () => {
  it('steps a near miss toward the text color before giving up', () => {
    const ground = hexToRgb('#F5F0E6');
    const paleAccent = hexToRgb('#EF7B62');
    const picked = readableOn(ground, [paleAccent], hexToRgb('#1A1611'), [0, 0, 0], 4.5);
    expect(picked).not.toEqual([0, 0, 0]);
    expect(contrastRatio(rgbToHex(picked), '#F5F0E6')).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back when nothing reads', () => {
    const ground = hexToRgb('#808080');
    expect(readableOn(ground, [ground], ground, [1, 2, 3], 4.5)).toEqual([1, 2, 3]);
  });
});

describe('quieterOn', () => {
  it('never drops below 4.5:1', () => {
    for (const band of ['#A5492A', '#16243F', '#C9E2EF', '#7A7A7A']) {
      const ground = hexToRgb(band);
      const text = hexToRgb(contrastRatio(SHARE_CREAM, band) >= contrastRatio(SHARE_INK, band) ? SHARE_CREAM : SHARE_INK);
      const quiet = quieterOn(ground, text, 0.3);
      const ratio = contrastRatio(rgbToHex(quiet), band);
      expect(ratio >= 4.5 || quiet.join() === text.join()).toBe(true);
    }
  });
});

describe('artistBrandCss', () => {
  it('scopes the page tokens to the artist page and the band tokens to the band', () => {
    const css = artistBrandCss(resolveArtistBrandTheme({ background: '#16243F', accent: '#D9A441' })!);
    expect(css).toContain(`html[data-theme='light']:has([${ARTIST_BRAND_ATTR}])`);
    expect(css).toContain(`:root:not([data-theme='light']):has([${ARTIST_BRAND_ATTR}])`);
    expect(css).toContain('.artist-brand-band');
    expect(css).toContain('--artist-deep:');
  });

  it('only ever writes normalized colors, never what was typed', () => {
    const css = artistBrandCss(resolveArtistBrandTheme({ background: '#abc', accent: 'D9A441' })!);
    expect(css).not.toMatch(/[<>"{}]\s*script/i);
    expect(css).toContain('#AABBCC');
  });
});

describe('mixRgb', () => {
  it('runs from one color to the other', () => {
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0)).toEqual([0, 0, 0]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 1)).toEqual([200, 100, 50]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  });
});
