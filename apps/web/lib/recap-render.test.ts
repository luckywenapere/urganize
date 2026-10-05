import { describe, expect, it } from 'vitest';
import { ImageResponse } from 'next/og';
import { RECAP_CARD_DIMENSIONS, renderRecapCard } from './recap-card';
import { loadRecapFonts } from './recap-fonts';
import type { RecapCardSize } from './recap-copy';

// Guards the two ways this feature fails silently rather than loudly:
//
//  1. A font that does not load. Satori falls back to a default face instead of
//     throwing, so a broken .ttf path ships a wrong-looking poster, not an
//     error. Asserting the files parse as TrueType catches it here.
//  2. A wrong canvas. The story and square sizes are fixed by where they get
//     posted, so a transposed width/height is a real defect that no type check
//     would catch.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Read the dimensions out of a PNG's IHDR chunk, which always leads the file. */
function readPngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const sampleStats = [
  { key: 'tasksCompleted', value: '64', label: 'tasks completed' },
  { key: 'daysOfWork', value: '77', label: 'days of work' },
  { key: 'teamSize', value: '3', label: 'people on the team' },
  { key: 'pitchesSent', value: '18', label: 'playlist pitches sent' },
];

async function renderPng(size: RecapCardSize, overrides: Partial<Parameters<typeof renderRecapCard>[0]> = {}) {
  const fonts = await loadRecapFonts();
  const { width, height } = RECAP_CARD_DIMENSIONS[size];
  const image = new ImageResponse(
    renderRecapCard({
      size,
      title: 'Free',
      artistName: 'Bortlen',
      releaseDateLabel: 'August 9, 2026',
      stats: sampleStats,
      highlight: null,
      ...overrides,
    }),
    { width, height, fonts }
  );
  return Buffer.from(await image.arrayBuffer());
}

describe('recap fonts', () => {
  it('loads all four static cuts as parseable TrueType', async () => {
    const fonts = await loadRecapFonts();
    expect(fonts).toHaveLength(4);
    for (const font of fonts) {
      // 0x00010000 is the TrueType version tag. A woff2 (which satori cannot
      // read) would start with 'wOF2' instead.
      expect(font.data.readUInt32BE(0)).toBe(0x00010000);
      expect(font.data.length).toBeGreaterThan(1000);
    }
    expect(fonts.map((font) => `${font.name}:${font.weight}`).sort()).toEqual([
      'Space Grotesk:400',
      'Space Grotesk:500',
      'Space Mono:400',
      'Young Serif:400',
    ]);
  });
});

describe('renderRecapCard', () => {
  it('renders the story card at 1080x1920', async () => {
    const png = await renderPng('story');
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(readPngSize(png)).toEqual({ width: 1080, height: 1920 });
  }, 30_000);

  it('renders the square card at 1080x1080', async () => {
    const png = await renderPng('square');
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(readPngSize(png)).toEqual({ width: 1080, height: 1080 });
  }, 30_000);

  it('renders the announcement layout when there is nothing to count', async () => {
    const png = await renderPng('story', { stats: [] });
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(readPngSize(png)).toEqual({ width: 1080, height: 1920 });
  }, 30_000);

  it('renders a long title and a highlight without throwing', async () => {
    const png = await renderPng('square', {
      title: 'An Extremely Long Release Title That Will Certainly Need Truncating',
      highlight: 'Sold out the release show, twice',
      releaseDateLabel: null,
    });
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  }, 30_000);
});
