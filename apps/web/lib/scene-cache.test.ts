import { describe, expect, it } from 'vitest';
import {
  SCENE_CACHE_MAX_RELEASES,
  SCENE_FRESH_MS,
  SCENE_HARD_EXPIRY_MS,
  SCENE_NAMES,
  SCENE_PERSIST_MAX_BYTES,
  SCENE_PREFETCH_ORDER,
  isCacheableScene,
  isSceneCachePayload,
  isSceneFresh,
  isSceneRenderable,
  releaseIdFromEntryKey,
  sceneEntryKey,
  shouldPersistScene,
  trimSceneCacheEntries,
  withinPersistBudget,
  type SceneCacheEntry,
} from './scene-cache';

const entry = (savedAt: number, data: unknown = { ok: true }): SceneCacheEntry => ({
  savedAt,
  data,
});

describe('sceneEntryKey / releaseIdFromEntryKey', () => {
  it('round-trips a release id', () => {
    const key = sceneEntryKey('rel-1', 'metadata');
    expect(key).toBe('rel-1:metadata');
    expect(releaseIdFromEntryKey(key)).toBe('rel-1');
  });

  it('survives a uuid-shaped release id', () => {
    const id = '3f1a9c2e-77b4-4a1e-9d2f-0c5b8e6a1d33';
    expect(releaseIdFromEntryKey(sceneEntryKey(id, 'calendar'))).toBe(id);
  });

  it('returns empty for a malformed key rather than guessing', () => {
    expect(releaseIdFromEntryKey('nonsense')).toBe('');
    expect(releaseIdFromEntryKey(':metadata')).toBe('');
  });
});

describe('persist policy', () => {
  it('never persists the files scene — its payload carries signed URLs', () => {
    expect(shouldPersistScene('files')).toBe(false);
  });

  it('never persists the capture scene — its payload carries fans’ emails', () => {
    // Different reason from `files` (expiring credentials) and worth pinning
    // separately: this one is other people's contact details, and localStorage
    // outlives sign-out on a shared machine.
    expect(shouldPersistScene('capture')).toBe(false);
  });

  it('persists the three credential-free scenes', () => {
    expect(shouldPersistScene('metadata')).toBe(true);
    expect(shouldPersistScene('epk')).toBe(true);
    expect(shouldPersistScene('calendar')).toBe(true);
  });

  it('covers every scene name', () => {
    for (const scene of SCENE_NAMES) {
      expect(typeof shouldPersistScene(scene)).toBe('boolean');
    }
  });

  it('prefetches every cacheable scene exactly once', () => {
    // Every scene the cache layer can fetch is warmed, and none twice. The
    // plan scene is deliberately not one of them: it is an editable document
    // rather than a snapshot, so it owns its own reads and writes. The
    // calendar joins the list only when its flag is on — with it off, its API
    // routes 404, so prefetching would burn a guaranteed-404 per release.
    const contentCalendarEnabled = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
    const captureEnabled = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';
    const songUploadEnabled = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';
    const cacheable = [...SCENE_NAMES]
      .filter(isCacheableScene)
      .filter((scene) => scene !== 'calendar' || contentCalendarEnabled)
      .filter((scene) => scene !== 'capture' || captureEnabled)
      .filter((scene) => scene !== 'song' || songUploadEnabled);
    expect([...SCENE_PREFETCH_ORDER].sort()).toEqual([...cacheable].sort());
    expect(new Set(SCENE_PREFETCH_ORDER).size).toBe(SCENE_PREFETCH_ORDER.length);
  });

  it('keeps the plan scene out of the cache entirely', () => {
    // Both halves matter: not prefetched, and not persisted. A cached copy of a
    // plan somebody is editing could overwrite newer text with older.
    expect(isCacheableScene('plan')).toBe(false);
    expect(shouldPersistScene('plan')).toBe(false);
    expect((SCENE_PREFETCH_ORDER as readonly string[]).includes('plan')).toBe(false);
  });
});

describe('isSceneFresh', () => {
  const now = 1_000_000;

  it('is fresh inside the window', () => {
    expect(isSceneFresh(now - (SCENE_FRESH_MS - 1), now)).toBe(true);
  });

  it('is stale at and past the window', () => {
    expect(isSceneFresh(now - SCENE_FRESH_MS, now)).toBe(false);
    expect(isSceneFresh(now - SCENE_FRESH_MS * 10, now)).toBe(false);
  });
});

describe('isSceneRenderable', () => {
  const now = 1_000_000_000;
  const filesExpiry = SCENE_HARD_EXPIRY_MS.files as number;

  it('refuses to paint a files payload past its signed-URL margin', () => {
    expect(isSceneRenderable('files', now - (filesExpiry - 1), now)).toBe(true);
    expect(isSceneRenderable('files', now - filesExpiry, now)).toBe(false);
  });

  it('leaves the margin below the 1h signed-URL TTL', () => {
    expect(filesExpiry).toBeLessThan(60 * 60 * 1000);
  });

  it('paints the credential-free scenes at any age (they revalidate behind)', () => {
    const ancient = now - 30 * 24 * 60 * 60 * 1000;
    expect(isSceneRenderable('metadata', ancient, now)).toBe(true);
    expect(isSceneRenderable('epk', ancient, now)).toBe(true);
    expect(isSceneRenderable('calendar', ancient, now)).toBe(true);
  });
});

describe('isSceneCachePayload', () => {
  it('accepts a well-formed payload', () => {
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:epk': entry(5) } })
    ).toBe(true);
  });

  it('accepts an empty entry map', () => {
    expect(isSceneCachePayload({ userId: 'u1', entries: {} })).toBe(true);
  });

  it('rejects a payload with no user id — cached scenes must be attributable', () => {
    expect(isSceneCachePayload({ userId: '', entries: {} })).toBe(false);
    expect(isSceneCachePayload({ entries: {} })).toBe(false);
  });

  it('rejects malformed entries', () => {
    expect(isSceneCachePayload({ userId: 'u1', entries: { 'r1:epk': null } })).toBe(false);
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:epk': { data: 1 } } })
    ).toBe(false);
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:epk': { savedAt: 'soon' } } })
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isSceneCachePayload(null)).toBe(false);
    expect(isSceneCachePayload('cache')).toBe(false);
    expect(isSceneCachePayload(undefined)).toBe(false);
  });
});

describe('trimSceneCacheEntries', () => {
  it('leaves a payload under the limit untouched', () => {
    const entries = { 'r1:epk': entry(1), 'r1:metadata': entry(2), 'r2:epk': entry(3) };
    expect(trimSceneCacheEntries(entries, 4)).toBe(entries);
  });

  it('evicts the least-recently-saved releases', () => {
    const entries = {
      'old:epk': entry(1),
      'mid:epk': entry(50),
      'new:epk': entry(100),
    };
    const trimmed = trimSceneCacheEntries(entries, 2);
    expect(Object.keys(trimmed).sort()).toEqual(['mid:epk', 'new:epk']);
  });

  it('keeps a surviving release WHOLE — never half its scenes', () => {
    const entries = {
      'keep:epk': entry(90),
      'keep:metadata': entry(10),
      'keep:calendar': entry(20),
      'drop:epk': entry(5),
    };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed).sort()).toEqual(['keep:calendar', 'keep:epk', 'keep:metadata']);
  });

  it('ranks a release by its NEWEST entry, not its oldest', () => {
    const entries = {
      'a:epk': entry(1),
      'a:metadata': entry(999),
      'b:epk': entry(500),
    };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed).sort()).toEqual(['a:epk', 'a:metadata']);
  });

  it('drops malformed keys instead of keeping them forever', () => {
    const entries = { garbage: entry(1000), 'r1:epk': entry(5), 'r2:epk': entry(6) };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed)).not.toContain('garbage');
  });

  it('defaults to the configured release ceiling', () => {
    const entries: Record<string, SceneCacheEntry> = {};
    for (let i = 0; i < SCENE_CACHE_MAX_RELEASES + 3; i += 1) {
      entries[`r${i}:epk`] = entry(i);
    }
    expect(Object.keys(trimSceneCacheEntries(entries))).toHaveLength(SCENE_CACHE_MAX_RELEASES);
  });
});

describe('withinPersistBudget', () => {
  it('allows a normal payload', () => {
    expect(withinPersistBudget(JSON.stringify({ userId: 'u1', entries: {} }))).toBe(true);
  });

  it('rejects one large enough to threaten the origin storage budget', () => {
    expect(withinPersistBudget('x'.repeat(SCENE_PERSIST_MAX_BYTES + 1))).toBe(false);
  });

  it('allows exactly the limit', () => {
    expect(withinPersistBudget('x'.repeat(SCENE_PERSIST_MAX_BYTES))).toBe(true);
  });
});
