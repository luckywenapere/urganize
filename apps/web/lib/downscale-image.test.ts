import { describe, expect, it } from 'vitest';

import {
  MAX_AVATAR_IMAGE_EDGE_PX,
  fitWithinEdge,
  renameForMimeType,
  targetMimeType,
} from './downscale-image';

// Only the pure half is covered here. The decode/canvas path touches
// createImageBitmap, Image and canvas.toBlob, none of which exist in the
// vitest environment — the same split lib/cover-art-image.ts already draws,
// and the reason the geometry lives in its own function at all.

describe('fitWithinEdge', () => {
  it('leaves an image that already fits completely alone', () => {
    expect(fitWithinEdge(512, 512, 1024)).toEqual({ width: 512, height: 512 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithinEdge(64, 32, 1024)).toEqual({ width: 64, height: 32 });
  });

  it('treats an image exactly on the limit as fitting', () => {
    expect(fitWithinEdge(1024, 1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('shrinks the file that caused this bug to something decodable', () => {
    // 12500x12500, 156 megapixels, ~596 MB decoded. Uploaded, stored, and then
    // never painted by any browser.
    const fitted = fitWithinEdge(12500, 12500, MAX_AVATAR_IMAGE_EDGE_PX);
    expect(fitted).toEqual({ width: 1024, height: 1024 });
    // The point of the exercise: comfortably inside every engine's ceiling.
    expect((fitted.width * fitted.height) / 1e6).toBeLessThan(2);
  });

  it('preserves aspect ratio when the long edge is horizontal', () => {
    expect(fitWithinEdge(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
  });

  it('preserves aspect ratio when the long edge is vertical', () => {
    expect(fitWithinEdge(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
  });

  it('keeps a sliver of an extremely thin image rather than rounding it to zero', () => {
    // A 20000x3 banner scales its short edge below 1. A zero-height canvas
    // cannot be drawn into, so the clamp is what stops this returning a file
    // that fails at encode time instead of decode time.
    const fitted = fitWithinEdge(20000, 3, 1024);
    expect(fitted.width).toBe(1024);
    expect(fitted.height).toBe(1);
  });
});

describe('targetMimeType', () => {
  it('keeps JPEG as JPEG', () => {
    expect(targetMimeType('image/jpeg')).toBe('image/jpeg');
  });

  it('keeps PNG as PNG, so a transparent logo keeps its alpha', () => {
    expect(targetMimeType('image/png')).toBe('image/png');
  });

  it('folds WebP into PNG rather than trusting uneven canvas WebP encoding', () => {
    expect(targetMimeType('image/webp')).toBe('image/png');
  });

  it('falls back to PNG for anything unrecognised', () => {
    expect(targetMimeType('')).toBe('image/png');
    expect(targetMimeType('application/octet-stream')).toBe('image/png');
  });
});

describe('renameForMimeType', () => {
  it('follows the bytes when a WebP is re-encoded as PNG', () => {
    expect(renameForMimeType('logo.webp', 'image/png')).toBe('logo.png');
  });

  it('normalises a JPEG extension to jpg', () => {
    expect(renameForMimeType('headshot.jpeg', 'image/jpeg')).toBe('headshot.jpg');
  });

  it('keeps the stem intact when it contains dots and spaces', () => {
    expect(renameForMimeType('SOundRIse transparent-01.png', 'image/png')).toBe(
      'SOundRIse transparent-01.png'
    );
    expect(renameForMimeType('my.logo.v2.png', 'image/jpeg')).toBe('my.logo.v2.jpg');
  });

  it('appends an extension when the name has none', () => {
    expect(renameForMimeType('logo', 'image/png')).toBe('logo.png');
  });

  it('does not treat a leading dot as an extension', () => {
    expect(renameForMimeType('.logo', 'image/png')).toBe('.logo.png');
  });
});
