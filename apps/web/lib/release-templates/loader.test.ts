import { afterEach, describe, expect, it, vi } from 'vitest';

import { EP_RELEASE_TEMPLATE } from './ep';
import {
  getAuthoredTemplate,
  getAvailableReleaseTypes,
  getTemplate,
  getTemplateStats,
  isEpAlbumTemplatesEnabled,
  TemplateNotAvailableError,
} from './loader';

// The loader is the ONE gate for EP and album. Everything downstream (the
// onboarding picker, the modal picker, the create and schedule routes, the
// planner's per-type template) derives from getTemplate and
// getAvailableReleaseTypes, so these assertions are what guarantee the flag
// cannot be half-applied.
//
// The flag is read at CALL time, so unlike the intent-router tests there is no
// need to re-import the module per case — stubbing env is enough. It is stubbed
// explicitly in both directions rather than read from the ambient environment:
// vitest does not load .env.local, and leaving it to chance would make these
// depend on whoever ran them.
function setFlag(enabled: boolean) {
  vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', enabled ? 'true' : 'false');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isEpAlbumTemplatesEnabled', () => {
  it('is off unless the value is exactly "true"', () => {
    setFlag(false);
    expect(isEpAlbumTemplatesEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', '');
    expect(isEpAlbumTemplatesEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', '1');
    expect(isEpAlbumTemplatesEnabled()).toBe(false);
    setFlag(true);
    expect(isEpAlbumTemplatesEnabled()).toBe(true);
  });
});

describe('getAvailableReleaseTypes', () => {
  it('offers single only when the flag is off', () => {
    setFlag(false);
    expect(getAvailableReleaseTypes()).toEqual(['single']);
  });

  it('offers single, ep and album when the flag is on', () => {
    setFlag(true);
    expect(getAvailableReleaseTypes()).toEqual(['single', 'ep', 'album']);
  });

  it('never offers music_video, which the database enum cannot store', () => {
    setFlag(true);
    expect(getAvailableReleaseTypes()).not.toContain('music_video');
  });
});

describe('getTemplate', () => {
  it('resolves single in both flag states', () => {
    setFlag(false);
    expect(getTemplate('single').id).toBe('single_v0.3');
    setFlag(true);
    expect(getTemplate('single').id).toBe('single_v0.3');
  });

  it('throws for ep and album while the flag is off', () => {
    setFlag(false);
    expect(() => getTemplate('ep')).toThrow(TemplateNotAvailableError);
    expect(() => getTemplate('album')).toThrow(TemplateNotAvailableError);
  });

  it('resolves ep and album once the flag is on', () => {
    setFlag(true);
    expect(getTemplate('ep').id).toBe('ep_v0.1');
    expect(getTemplate('album').id).toBe('album_v0.1');
  });

  it('throws for music_video regardless of the flag', () => {
    setFlag(true);
    expect(() => getTemplate('music_video')).toThrow(TemplateNotAvailableError);
  });

  it('reports which release type failed', () => {
    setFlag(false);
    try {
      getTemplate('ep');
      expect.unreachable('getTemplate should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateNotAvailableError);
      expect((error as TemplateNotAvailableError).releaseType).toBe('ep');
    }
  });
});

describe('getAuthoredTemplate', () => {
  // This is what stops a mid-draft flag rollback from destroying a manager's
  // edits: an EP draft generated while the flag was on still validates its own
  // task ids against the EP playbook after the flag goes off.
  it('returns the ep template even while the flag is off', () => {
    setFlag(false);
    expect(getAuthoredTemplate('ep')).toBe(EP_RELEASE_TEMPLATE);
    expect(getAuthoredTemplate('album')?.id).toBe('album_v0.1');
  });

  it('returns null only for a type with no authored playbook', () => {
    setFlag(true);
    expect(getAuthoredTemplate('music_video')).toBeNull();
  });
});

describe('getTemplateStats', () => {
  it('reports the single playbook numbers', () => {
    setFlag(false);
    const stats = getTemplateStats('single');
    expect(stats.activityCount).toBe(64);
    expect(stats.leadWeeks).toBe(8);
    expect(stats.spanWeeks).toBe(11);
  });

  it('falls back to single numbers for a type that is gated off, never throwing', () => {
    setFlag(false);
    expect(getTemplateStats('ep')).toEqual(getTemplateStats('single'));
    expect(getTemplateStats('music_video')).toEqual(getTemplateStats('single'));
  });

  it('reports the real ep and album numbers once the flag is on', () => {
    setFlag(true);
    const ep = getTemplateStats('ep');
    expect(ep.leadWeeks).toBe(13);
    expect(ep.activityCount).toBe(EP_RELEASE_TEMPLATE.tasks.length);

    const album = getTemplateStats('album');
    expect(album.leadWeeks).toBe(17);
    // The copy these numbers feed ("plans ~N weeks") has to grow with the
    // release type, which is the whole reason components take a type now.
    expect(album.spanWeeks).toBeGreaterThan(ep.spanWeeks);
    expect(ep.spanWeeks).toBeGreaterThan(getTemplateStats('single').spanWeeks);
  });
});
