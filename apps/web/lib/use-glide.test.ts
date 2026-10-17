import { describe, expect, it } from 'vitest';
import { glideDelta } from './use-glide';

describe('glideDelta', () => {
  it('is the distance from the new spot back to the old one', () => {
    expect(glideDelta({ left: 20, top: 800 }, { left: 14, top: 752 })).toEqual({ dx: 6, dy: 48 });
  });

  it('is null when the element did not move', () => {
    expect(glideDelta({ left: 20, top: 800 }, { left: 20.3, top: 799.8 })).toBeNull();
  });
});
