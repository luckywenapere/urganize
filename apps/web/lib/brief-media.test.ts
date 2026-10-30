import { describe, expect, it } from 'vitest';
import {
  BRIEF_CAPTION_MAX,
  BRIEF_IMAGE_MAX_BYTES,
  BRIEF_NOTE_MAX,
  briefImagePath,
  isBriefImagePath,
  mayChangeBriefItem,
  parseCaption,
  parseNoteText,
  pickPalette,
  validateBriefImage,
} from './brief-media';

describe('parseCaption', () => {
  it('trims and keeps an empty caption', () => {
    expect(parseCaption({ caption: '  Golden hour  ' })).toEqual({ ok: true, value: 'Golden hour' });
    expect(parseCaption({ caption: '' })).toEqual({ ok: true, value: '' });
  });

  it('refuses a caption over the limit or not text', () => {
    expect(parseCaption({ caption: 'x'.repeat(BRIEF_CAPTION_MAX + 1) }).ok).toBe(false);
    expect(parseCaption({ caption: 4 }).ok).toBe(false);
    expect(parseCaption(null).ok).toBe(false);
  });
});

describe('parseNoteText', () => {
  it('needs some words, within the limit', () => {
    expect(parseNoteText({ text: ' Shoot at dusk ' })).toEqual({ ok: true, value: 'Shoot at dusk' });
    expect(parseNoteText({ text: '   ' }).ok).toBe(false);
    expect(parseNoteText({ text: 'x'.repeat(BRIEF_NOTE_MAX + 1) }).ok).toBe(false);
  });
});

describe('validateBriefImage', () => {
  it('takes photos up to 10 MB', () => {
    expect(validateBriefImage({ mimeType: 'image/jpeg', size: 2_000_000 }).ok).toBe(true);
    expect(validateBriefImage({ mimeType: 'image/png', size: BRIEF_IMAGE_MAX_BYTES }).ok).toBe(true);
    expect(validateBriefImage({ mimeType: 'image/webp', size: 10 }).ok).toBe(true);
  });

  it('refuses other files and big ones', () => {
    expect(validateBriefImage({ mimeType: 'audio/mpeg', size: 10 }).ok).toBe(false);
    expect(validateBriefImage({ mimeType: 'image/gif', size: 10 }).ok).toBe(false);
    expect(validateBriefImage({ mimeType: 'image/jpeg', size: BRIEF_IMAGE_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validateBriefImage({ mimeType: 'image/jpeg', size: 0 }).ok).toBe(false);
  });
});

describe('brief image paths', () => {
  const release = '00000000-0000-4000-a000-000000000030';

  it('lives under the rollout’s brief folder', () => {
    const path = briefImagePath(release, 'abc-123', 'image/png');
    expect(path).toBe(`brief/${release}/abc-123.png`);
    expect(isBriefImagePath(release, path)).toBe(true);
  });

  it('refuses another rollout’s folder or a path that climbs out', () => {
    expect(isBriefImagePath(release, 'brief/other/abc.png')).toBe(false);
    expect(isBriefImagePath(release, `brief/${release}/../x.png`)).toBe(false);
    expect(isBriefImagePath(release, `brief/${release}/sub/x.png`)).toBe(false);
    expect(isBriefImagePath(release, 42)).toBe(false);
  });
});

describe('mayChangeBriefItem', () => {
  it('lets the person who added it, or a lead, change or remove it', () => {
    expect(mayChangeBriefItem({ createdBy: 'u1', userId: 'u1', isLead: false })).toBe(true);
    expect(mayChangeBriefItem({ createdBy: 'u1', userId: 'u2', isLead: true })).toBe(true);
    expect(mayChangeBriefItem({ createdBy: 'u1', userId: 'u2', isLead: false })).toBe(false);
    expect(mayChangeBriefItem({ createdBy: null, userId: 'u2', isLead: false })).toBe(false);
  });
});

/** RGBA pixels: `n` pixels of each colour, in order. */
function pixels(...runs: [number, number, number, number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [r, g, b, n] of runs) for (let i = 0; i < n; i += 1) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

describe('pickPalette', () => {
  it('returns the most used colours first', () => {
    const palette = pickPalette(pixels([196, 97, 42, 60], [233, 165, 60, 30], [58, 36, 23, 10]), 3);
    expect(palette).toHaveLength(3);
    expect(palette[0]).toMatch(/^#C[0-9A-F]6/);
    expect(palette[2]).toMatch(/^#3/);
  });

  it('skips colours too close to one already picked', () => {
    const palette = pickPalette(pixels([200, 100, 40, 50], [204, 102, 44, 40], [20, 20, 120, 10]), 5);
    expect(palette).toHaveLength(2);
  });

  it('ignores see-through pixels and copes with an empty image', () => {
    const clear = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 0]);
    expect(pickPalette(clear, 5)).toEqual([]);
    expect(pickPalette(new Uint8ClampedArray(), 5)).toEqual([]);
  });
});
