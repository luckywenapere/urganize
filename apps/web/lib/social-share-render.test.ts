import { describe, expect, it } from 'vitest';
import { ImageResponse } from 'next/og';
import { renderShareCard, type ShareCardProps } from './social-share-card';
import { loadRecapFonts } from './recap-fonts';
import { SHARE_FORMAT_DIMENSIONS, type ShareFormat } from './social-share';

// Renders every poster layout to a real PNG through the same satori + fonts
// path the route uses. Guards the two ways an image fails silently: a layout
// satori refuses (it throws on a div with several children and no explicit
// flex, which only shows up at render time), and a canvas at the wrong size.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// A real, tiny PNG (a 4x4 spring-green square, generated with zlib and a CRC,
// not typed by hand) so the cover-art layouts decode an actual image rather
// than a placeholder string.
const TINY_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR4nGOovzkLjhiI4wAAJ/EfIb+1BEgAAAAASUVORK5CYII=';

const base: Omit<ShareCardProps, 'format'> = {
  releaseType: 'single',
  title: 'Lagos Nights',
  artistName: 'Dorian',
  timing: { kind: 'upcoming', label: 'October 3', shortLabel: 'OCT 3' },
  extraLine: 'Featuring Tems',
  coverArtDataUrl: null,
};

async function renderPng(format: ShareFormat, overrides: Partial<ShareCardProps> = {}) {
  const fonts = await loadRecapFonts();
  const { width, height } = SHARE_FORMAT_DIMENSIONS[format];
  const image = new ImageResponse(renderShareCard({ ...base, format, ...overrides }), {
    width,
    height,
    fonts,
  });
  return Buffer.from(await image.arrayBuffer());
}

describe('renderShareCard', () => {
  for (const format of ['post', 'status'] as const) {
    const { width, height } = SHARE_FORMAT_DIMENSIONS[format];

    it(`renders the ${format} poster without cover art at ${width}x${height}`, async () => {
      const png = await renderPng(format);
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(readPngSize(png)).toEqual({ width, height });
    }, 30_000);

    it(`renders the ${format} poster with cover art`, async () => {
      const png = await renderPng(format, { coverArtDataUrl: TINY_COVER });
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(readPngSize(png)).toEqual({ width, height });
    }, 30_000);

    it(`renders the ${format} poster with no title, no artist and nothing to add`, async () => {
      const png = await renderPng(format, {
        title: null,
        artistName: '',
        extraLine: '',
        timing: { kind: 'soon' },
      });
      expect(readPngSize(png)).toEqual({ width, height });
    }, 30_000);

    it(`renders the ${format} poster with a very long title and emoji`, async () => {
      const png = await renderPng(format, {
        title: 'A Very Long Title That Keeps On Going Well Past Forty Characters 🌙',
        extraLine: 'Produced by Sarz, mixed in Lagos ❤️‍🔥',
        timing: { kind: 'out' },
      });
      expect(readPngSize(png)).toEqual({ width, height });
    }, 30_000);
  }
});
