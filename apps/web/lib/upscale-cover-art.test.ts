import { describe, expect, it } from 'vitest';
import { coverArtUpscaleTarget } from './upscale-cover-art';
import { gradeCoverArt } from './cover-art-dsp';

describe('coverArtUpscaleTarget', () => {
  it('enlarges a square file under 3000 to exactly 3000 x 3000', () => {
    expect(coverArtUpscaleTarget({ width: 1500, height: 1500 })).toEqual({ width: 3000, height: 3000 });
    expect(coverArtUpscaleTarget({ width: 640, height: 640 })).toEqual({ width: 3000, height: 3000 });
    expect(coverArtUpscaleTarget({ width: 2999, height: 2999 })).toEqual({ width: 3000, height: 3000 });
  });

  it('leaves a file that is already 3000 or bigger alone', () => {
    expect(coverArtUpscaleTarget({ width: 3000, height: 3000 })).toBeNull();
    expect(coverArtUpscaleTarget({ width: 4000, height: 4000 })).toBeNull();
  });

  it('does not touch files the picker blocks', () => {
    expect(coverArtUpscaleTarget({ width: 1920, height: 1080 })).toBeNull();
    expect(coverArtUpscaleTarget({ width: 639, height: 639 })).toBeNull();
    expect(coverArtUpscaleTarget(null)).toBeNull();
  });

  it('produces a file that grades ready for stores', () => {
    const target = coverArtUpscaleTarget({ width: 800, height: 800 });
    expect(gradeCoverArt({ ...target!, mimeType: 'image/jpeg' }).verdict).toBe('ready');
  });
});
