import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldShowPhoto } from './profile-face';

describe('shouldShowPhoto', () => {
  it('shows a photo that has not failed', () => {
    expect(shouldShowPhoto('https://x/a.jpg', null)).toBe(true);
  });
  it('falls back to initials when that url failed', () => {
    expect(shouldShowPhoto('https://x/a.jpg', 'https://x/a.jpg')).toBe(false);
  });
  it('tries again when the url changes', () => {
    expect(shouldShowPhoto('https://x/b.jpg', 'https://x/a.jpg')).toBe(true);
  });
  it('shows initials with no photo', () => {
    expect(shouldShowPhoto(null, null)).toBe(false);
    expect(shouldShowPhoto('', null)).toBe(false);
  });
});

describe('ProfileFace source', () => {
  const src = readFileSync('components/shared/ProfileFace.tsx', 'utf8');
  it('wires onError to the fallback and has no gradient', () => {
    expect(src).toContain('onError={() => setFailedUrl(photoUrl)}');
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/gradient/i);
  });
});
