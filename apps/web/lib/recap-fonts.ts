import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Font loading for the release recap card renderer (server only).
//
// Satori, which backs next/og's ImageResponse, needs raw font binaries and
// cannot read next/font's CSS variables. It also does not support variable
// fonts or woff2, which is why these are STATIC ttf cuts checked into the repo
// rather than anything pulled from Google at build time. Young Serif ships
// as its one regular cut; Space Grotesk stays for the card's body text because
// Instrument Sans is only published as a variable font, which satori cannot read.
//
// Vercel's output tracing cannot see a runtime readFile, so
// next.config.js declares outputFileTracingIncludes for this route. If a
// deployed generate fails with ENOENT on a .ttf, that entry is what is wrong.

export type RecapFont = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600;
  style: 'normal';
};

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

const FONT_FILES: Array<{ file: string; name: string; weight: 400 | 500 | 600 }> = [
  { file: 'YoungSerif-Regular.ttf', name: 'Young Serif', weight: 400 },
  { file: 'SpaceGrotesk-Regular.ttf', name: 'Space Grotesk', weight: 400 },
  { file: 'SpaceGrotesk-Medium.ttf', name: 'Space Grotesk', weight: 500 },
  { file: 'SpaceMono-Regular.ttf', name: 'Space Mono', weight: 400 },
];

// Module-level cache: a warm lambda reads these off disk exactly once, which
// keeps a regenerate well inside the generation budget.
let cached: Promise<RecapFont[]> | null = null;

export function loadRecapFonts(): Promise<RecapFont[]> {
  if (!cached) {
    cached = Promise.all(
      FONT_FILES.map(async ({ file, name, weight }) => ({
        name,
        data: await readFile(path.join(FONT_DIR, file)),
        weight,
        style: 'normal' as const,
      }))
    ).catch((error) => {
      // Never cache a failure: a cold-start blip would otherwise poison the
      // lambda for its whole life.
      cached = null;
      throw error;
    });
  }
  return cached;
}
