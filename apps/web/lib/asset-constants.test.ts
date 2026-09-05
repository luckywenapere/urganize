import { describe, expect, it } from 'vitest';
import { ASSET_SIZE_LIMITS, MAX_WORKSPACE_LOGO_BYTES,
  MAX_PRESS_PHOTO_BYTES,
} from './asset-constants';
import { MAX_CURATOR_PHOTO_BYTES } from './pitching';

const MIB = 1024 * 1024;

/**
 * Two small avatars used to read their size ceiling from
 * ASSET_SIZE_LIMITS.cover_art. When cover art was raised to 25 MiB to fit the
 * square 3000x3000 image DSPs require, both silently started accepting a 25 MiB
 * upload — a 96px workspace logo and a 64px curator photo.
 *
 * A comment cannot stop that happening a third time; these assertions can.
 */
describe('avatar size limits do not track cover art', () => {
  it('caps the workspace logo at 5 MiB', () => {
    expect(MAX_WORKSPACE_LOGO_BYTES).toBe(5 * MIB);
  });

  it('keeps both avatar limits well under the cover art limit', () => {
    for (const [name, limit] of [
      ['workspace logo', MAX_WORKSPACE_LOGO_BYTES],
      ['curator photo', MAX_CURATOR_PHOTO_BYTES],
      ['press photo', MAX_PRESS_PHOTO_BYTES],
    ] as const) {
      expect(limit, name).not.toBe(ASSET_SIZE_LIMITS.cover_art);
      expect(limit, name).toBeLessThan(ASSET_SIZE_LIMITS.cover_art);
    }
  });

  it('still leaves cover art room for a real DSP-sized image', () => {
    // The other half of the same trade-off: tightening cover art back down to
    // fix these two would re-break the artwork upload.
    expect(ASSET_SIZE_LIMITS.cover_art).toBeGreaterThanOrEqual(20 * MIB);
  });
});

/**
 * A press photo is the third thing that could have aliased the cover art
 * limit, and the first that would have been wrong in the other direction:
 * promo_image's 5 MiB rejects the 3000px file a magazine actually asks for.
 * So it needs its own number, above promo_image and below cover art.
 */
describe('the press photo limit', () => {
  it('is its own literal, not the cover art limit', () => {
    expect(MAX_PRESS_PHOTO_BYTES).not.toBe(ASSET_SIZE_LIMITS.cover_art);
    expect(MAX_PRESS_PHOTO_BYTES).toBeLessThan(ASSET_SIZE_LIMITS.cover_art);
  });

  it('leaves room for a real print-resolution photo', () => {
    expect(MAX_PRESS_PHOTO_BYTES).toBeGreaterThan(ASSET_SIZE_LIMITS.promo_image);
  });
});
