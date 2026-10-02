import { afterEach, describe, expect, it, vi } from 'vitest';
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
  shouldRevalidateOnLoad,
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
    expect(shouldPersistScene('calendar')).toBe(true);
    // Was 'epk' until that scene was retired. Pitch is the third: its rows
    // carry a song link the pitcher typed, not a signed one, so nothing in it
    // expires on disk.
    expect(shouldPersistScene('pitch')).toBe(true);
  });

  it('covers every scene name', () => {
    for (const scene of SCENE_NAMES) {
      expect(typeof shouldPersistScene(scene)).toBe('boolean');
    }
  });

  it('prefetches every cacheable scene exactly once', () => {
    // Every scene the cache layer can fetch is warmed, and none twice. The
    // calendar joins the list only when its flag is on — with it off, its API
    // routes 404, so prefetching would burn a guaranteed-404 per release.
    // Every cacheable scene is gated on its own flag now — files and pitch
    // joined the rest on 2026-09-08. They had been unconditional, which meant
    // that with those flags off the prefetch spent a guaranteed 404 per scoped
    // release and then threw, since readJson rejects a non-ok response.
    const flagFor: Partial<Record<string, string>> = {
      metadata: 'NEXT_PUBLIC_FEATURE_METADATA',
      calendar: 'NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR',
      capture: 'NEXT_PUBLIC_FEATURE_CAPTURE',
      song: 'NEXT_PUBLIC_FEATURE_SONG_UPLOAD',
      coverart: 'NEXT_PUBLIC_FEATURE_COVER_ART',
      files: 'NEXT_PUBLIC_FEATURE_FILES',
      pitch: 'NEXT_PUBLIC_FEATURE_PITCHING',
      chat: 'NEXT_PUBLIC_FEATURE_RELEASE_CHAT',
      pitchkit: 'NEXT_PUBLIC_FEATURE_PITCH_KIT',
    };
    const cacheable = [...SCENE_NAMES].filter(isCacheableScene).filter((scene) => {
      const flag = flagFor[scene];
      return !flag || process.env[flag] === 'true';
    });
    expect([...SCENE_PREFETCH_ORDER].sort()).toEqual([...cacheable].sort());
    expect(new Set(SCENE_PREFETCH_ORDER).size).toBe(SCENE_PREFETCH_ORDER.length);
  });

  it('has no plan scene any more (2026-09-15)', async () => {
    // The review scene was the one scene that edited its payload, and it was
    // kept out of the cache for that reason. It is gone: the plan is built
    // straight into activities, so a stale `?scene=plan` in a bookmark or an
    // old UrgAns transcript has to resolve to no scene rather than to a header
    // with nothing under it — in every flag state, since 'plan' is gone from
    // SCENE_NAMES itself rather than merely gated.
    expect((SCENE_NAMES as readonly string[]).includes('plan')).toBe(false);
    expect((SCENE_PREFETCH_ORDER as readonly string[]).includes('plan')).toBe(false);
    const { resolveActiveScene } = await loadResolver(true);
    expect(resolveActiveScene('plan')).toBeNull();
  });

  it('keeps the timeline scene out of the cache entirely', () => {
    // This one fetches NOTHING. It is
    // laid out from activities TasksPanel already has in props, so there is no
    // payload to cache and a fetcher for it would have to invent a request that
    // does not exist.
    expect(isCacheableScene('timeline')).toBe(false);
    expect(shouldPersistScene('timeline')).toBe(false);
    expect((SCENE_PREFETCH_ORDER as readonly string[]).includes('timeline')).toBe(false);
  });
});

describe('shouldRevalidateOnLoad', () => {
  it('always revalidates metadata — a public form writes into it', () => {
    // Collaborators submit credits through /credits/[token], so a
    // fresh-looking cache entry can be missing an answer the owner is
    // specifically looking for.
    expect(shouldRevalidateOnLoad('metadata')).toBe(true);
  });

  it('leaves every other scene on the plain freshness window', () => {
    // Deliberately narrow: the point of the cache is that tapping between
    // scenes costs nothing, and every scene here changes only when the owner
    // changes it. Adding one is a behaviour change, so this fails on purpose.
    for (const scene of SCENE_NAMES) {
      if (scene === 'metadata') continue;
      expect(shouldRevalidateOnLoad(scene)).toBe(false);
    }
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
    expect(isSceneRenderable('calendar', ancient, now)).toBe(true);
    expect(isSceneRenderable('pitch', ancient, now)).toBe(true);
  });
});

describe('isSceneCachePayload', () => {
  it('accepts a well-formed payload', () => {
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:files': entry(5) } })
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
    expect(isSceneCachePayload({ userId: 'u1', entries: { 'r1:files': null } })).toBe(false);
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:files': { data: 1 } } })
    ).toBe(false);
    expect(
      isSceneCachePayload({ userId: 'u1', entries: { 'r1:files': { savedAt: 'soon' } } })
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
    const entries = { 'r1:files': entry(1), 'r1:metadata': entry(2), 'r2:files': entry(3) };
    expect(trimSceneCacheEntries(entries, 4)).toBe(entries);
  });

  it('evicts the least-recently-saved releases', () => {
    const entries = {
      'old:files': entry(1),
      'mid:files': entry(50),
      'new:files': entry(100),
    };
    const trimmed = trimSceneCacheEntries(entries, 2);
    expect(Object.keys(trimmed).sort()).toEqual(['mid:files', 'new:files']);
  });

  it('keeps a surviving release WHOLE — never half its scenes', () => {
    const entries = {
      'keep:files': entry(90),
      'keep:metadata': entry(10),
      'keep:calendar': entry(20),
      'drop:files': entry(5),
    };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed).sort()).toEqual(['keep:calendar', 'keep:files', 'keep:metadata']);
  });

  it('ranks a release by its NEWEST entry, not its oldest', () => {
    const entries = {
      'a:files': entry(1),
      'a:metadata': entry(999),
      'b:files': entry(500),
    };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed).sort()).toEqual(['a:files', 'a:metadata']);
  });

  it('drops malformed keys instead of keeping them forever', () => {
    const entries = { garbage: entry(1000), 'r1:files': entry(5), 'r2:files': entry(6) };
    const trimmed = trimSceneCacheEntries(entries, 1);
    expect(Object.keys(trimmed)).not.toContain('garbage');
  });

  it('defaults to the configured release ceiling', () => {
    const entries: Record<string, SceneCacheEntry> = {};
    for (let i = 0; i < SCENE_CACHE_MAX_RELEASES + 3; i += 1) {
      entries[`r${i}:files`] = entry(i);
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

// resolveActiveScene reads its feature flags at MODULE scope (the
// NEXT_PUBLIC_* inlining pattern), so stubbing env after an import would be too
// late — each case re-imports with the flags it wants. Every flag is stubbed
// explicitly rather than read from the ambient environment: vitest does not load
// .env.local, and leaving any of them to chance would make these assertions
// depend on whoever ran them.
//
// The list grew from five to nine on 2026-09-08, when metadata / files / pitch
// / plan gained the URL-level gate the other five always had, back to eight
// on 2026-09-15 when the plan review scene was removed, and to nine again
// with the release chat scene (Release & Task Chat, Phase 1).
const SCENE_FLAGS = [
  'NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR',
  'NEXT_PUBLIC_FEATURE_CAPTURE',
  'NEXT_PUBLIC_FEATURE_SONG_UPLOAD',
  'NEXT_PUBLIC_FEATURE_COVER_ART',
  'NEXT_PUBLIC_FEATURE_TIMELINE',
  'NEXT_PUBLIC_FEATURE_METADATA',
  'NEXT_PUBLIC_FEATURE_FILES',
  'NEXT_PUBLIC_FEATURE_PITCHING',
  'NEXT_PUBLIC_FEATURE_RELEASE_CHAT',
  'NEXT_PUBLIC_FEATURE_PITCH_KIT',
] as const;

async function loadResolver(flagsOn: boolean) {
  vi.resetModules();
  for (const flag of SCENE_FLAGS) {
    vi.stubEnv(flag, flagsOn ? 'true' : 'false');
  }
  return import('./scene-cache');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveActiveScene', () => {
  it('returns null for no param, an unknown name, and near-misses', async () => {
    const { resolveActiveScene } = await loadResolver(true);
    expect(resolveActiveScene(null)).toBeNull();
    expect(resolveActiveScene('')).toBeNull();
    expect(resolveActiveScene('bogus')).toBeNull();
    // Case and whitespace are NOT normalized: the app only ever writes these
    // params itself, so a near-miss is a hand-typed URL and reads as no scene.
    expect(resolveActiveScene('Metadata')).toBeNull();
    expect(resolveActiveScene(' metadata')).toBeNull();
  });

  it('resolves every scene name when its flag is on', async () => {
    const { resolveActiveScene, SCENE_NAMES: names } = await loadResolver(true);
    for (const scene of names) {
      expect(resolveActiveScene(scene)).toBe(scene);
    }
  });

  it('treats the five flag-gated scenes as closed when their flags are off', async () => {
    const { resolveActiveScene } = await loadResolver(false);
    for (const scene of ['calendar', 'capture', 'song', 'coverart', 'timeline']) {
      expect(resolveActiveScene(scene)).toBeNull();
    }
  });

  it('gates metadata, files and pitch too (2026-09-08)', async () => {
    // These (with the since-removed plan scene) had NO url-level gate anywhere. The old comment here claimed
    // they "gate themselves inside ReleaseScenePanel"; that file reads no flag
    // at all and never has, so a stale bookmark or a shared link opened a
    // header with a dead fetch under it. Files has been off in production
    // since v0.16.4, so ?scene=files was that empty page for anyone holding an
    // old link. Founder call: land on the release instead.
    const { resolveActiveScene } = await loadResolver(false);
    for (const scene of ['metadata', 'files', 'pitch']) {
      expect(resolveActiveScene(scene)).toBeNull();
    }
  });

  it('gates the release chat scene too (Release & Task Chat, Phase 1)', async () => {
    const { resolveActiveScene } = await loadResolver(false);
    expect(resolveActiveScene('chat')).toBeNull();
  });

  it('leaves activities open in every flag state', async () => {
    // The one genuinely ungated name, and it has to stay that way: it is
    // resolveMainView's fallback, so a rollback that gated it would leave the
    // panel blank.
    for (const flagsOn of [true, false]) {
      const { resolveActiveScene } = await loadResolver(flagsOn);
      expect(resolveActiveScene('activities')).toBe('activities');
    }
  });
});

// ---------------------------------------------------------------------------
// The main view
// ---------------------------------------------------------------------------

describe('resolveMainView', () => {
  it('is the timeline when the flag is on', async () => {
    const { resolveMainView } = await loadResolver(true);
    expect(resolveMainView()).toBe('timeline');
  });

  it('is the activity list when the flag is off', async () => {
    const { resolveMainView } = await loadResolver(false);
    expect(resolveMainView()).toBe('activities');
  });
});

describe('resolvePanelBody', () => {
  it('falls back to the main view when no scene is asked for', async () => {
    const on = await loadResolver(true);
    expect(on.resolvePanelBody(null)).toBe('timeline');
    const off = await loadResolver(false);
    expect(off.resolvePanelBody(null)).toBe('activities');
  });

  // The whole point of the change: with the flag on, the buckets are still
  // reachable — they just stop being what you land on.
  it('opens the activity list on request, in either flag state', async () => {
    const on = await loadResolver(true);
    expect(on.resolvePanelBody('activities')).toBe('activities');
    const off = await loadResolver(false);
    expect(off.resolvePanelBody('activities')).toBe('activities');
  });

  it('passes a real scene through untouched', async () => {
    const { resolvePanelBody } = await loadResolver(true);
    expect(resolvePanelBody('metadata')).toBe('metadata');
    expect(resolvePanelBody('calendar')).toBe('calendar');
    expect(resolvePanelBody('pitch')).toBe('pitch');
  });

  it('resolves every scene name to itself with the flags on', async () => {
    const { resolvePanelBody, SCENE_NAMES: names } = await loadResolver(true);
    for (const scene of names) {
      expect(resolvePanelBody(scene)).toBe(scene);
    }
  });

  // A stale bookmark to ?scene=timeline after a rollback must not render a
  // blank panel: an unresolvable scene means "no scene", which means the main
  // view — which with the flag off is the bucket list.
  it('lands a rolled-back timeline URL on the activity list', async () => {
    const { resolvePanelBody } = await loadResolver(false);
    expect(resolvePanelBody('timeline')).toBe('activities');
  });

  it('lands a hand-typed nonsense scene on the main view', async () => {
    const on = await loadResolver(true);
    expect(on.resolvePanelBody('bogus')).toBe('timeline');
    const off = await loadResolver(false);
    expect(off.resolvePanelBody('bogus')).toBe('activities');
  });

  // With the flag on, ?scene=timeline and no param are the same screen. Both
  // resolving to 'timeline' is what lets one body switch handle either.
  it('treats an explicit timeline param and no param alike when it is the main view', async () => {
    const { resolvePanelBody } = await loadResolver(true);
    expect(resolvePanelBody('timeline')).toBe(resolvePanelBody(null));
  });
});

describe('the activity list as a scene', () => {
  it('is never cached or persisted: it renders from props already in hand', async () => {
    const { isCacheableScene, shouldPersistScene, SCENE_PREFETCH_ORDER: order } =
      await loadResolver(true);
    expect(isCacheableScene('activities')).toBe(false);
    expect(shouldPersistScene('activities')).toBe(false);
    expect(order as readonly string[]).not.toContain('activities');
  });

  it('is not flag-gated — it is the fallback, so it must always resolve', async () => {
    const { resolveActiveScene } = await loadResolver(false);
    expect(resolveActiveScene('activities')).toBe('activities');
  });
});
