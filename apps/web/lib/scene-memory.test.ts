import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetSceneForCurrentRelease,
  recallScene,
  rememberScene,
  resetSceneMemory,
} from './scene-memory';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

let storage: ReturnType<typeof createMemoryStorage>;

function stubSession(userId: string) {
  storage.setItem('urganize-auth', JSON.stringify({ state: { user: { id: userId } } }));
}

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recallScene', () => {
  it('is null for a release with nothing remembered', () => {
    stubSession('user-1');
    expect(recallScene('release-1')).toBeNull();
  });

  it('is null with no session (logged out, or nothing to key by)', () => {
    expect(recallScene('release-1')).toBeNull();
  });

  it('is null for an empty release id', () => {
    stubSession('user-1');
    expect(recallScene('')).toBeNull();
  });
});

describe('rememberScene / recallScene round trip', () => {
  it('recalls what was remembered for the same session', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    expect(recallScene('release-1')).toBe('metadata');
  });

  it('keeps each release independent', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');
    expect(recallScene('release-1')).toBe('metadata');
    expect(recallScene('release-2')).toBe('calendar');
  });

  it('overwrites a release\'s prior memory with its latest scene', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-1', 'coverart');
    expect(recallScene('release-1')).toBe('coverart');
  });

  it('remembering null (Activities) clears any existing entry', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-1', null);
    expect(recallScene('release-1')).toBeNull();
  });

  it('remembering null for a release with nothing stored is a no-op', () => {
    stubSession('user-1');
    rememberScene('release-1', null);
    expect(recallScene('release-1')).toBeNull();
  });

  it('does not persist anything with no active session', () => {
    rememberScene('release-1', 'metadata');
    expect(storage.getItem('urganize.cache.scene-memory')).toBeNull();
  });

  it('ignores an empty release id', () => {
    stubSession('user-1');
    rememberScene('', 'metadata');
    expect(storage.getItem('urganize.cache.scene-memory')).toBeNull();
  });
});

describe('session isolation', () => {
  // One active session's memory occupies the single urganize.cache.* slot at
  // a time — the same "current session wins, a mismatch just misses"
  // contract every other urganize.cache.* key in this codebase follows
  // (stores/useSceneDataStore.ts, useReleaseStore.ts, etc.). Concurrently
  // remembering two different accounts' scenes in one tab was never a
  // requirement; only "a different session never sees a stale one's
  // memory" is.
  it('a different session (userId mismatch) sees no memory', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubSession('user-2');
    expect(recallScene('release-1')).toBeNull();
  });

  it('a later session writing under its own id does not corrupt reads for that id', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubSession('user-2');
    rememberScene('release-1', 'calendar');
    expect(recallScene('release-1')).toBe('calendar');
  });
});

describe('resetSceneMemory', () => {
  it('wipes every release\'s remembered scene', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');

    resetSceneMemory();

    expect(recallScene('release-1')).toBeNull();
    expect(recallScene('release-2')).toBeNull();
  });

  it('a fresh login after reset starts at Activities, even for the same account', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    resetSceneMemory();
    stubSession('user-1');

    expect(recallScene('release-1')).toBeNull();
  });

  it('is a no-op when nothing was ever stored', () => {
    expect(() => resetSceneMemory()).not.toThrow();
  });
});

// The shared "leave this release" step, used by all four exits that are plain
// <Link>s to /dashboard and so never reach setScope: the workspace back arrow's
// sibling controls — MobileNavBar's Home tab, the side menu's Catalog row and
// the topbar's Catalog icon. It reads the live url rather than a render-time
// copy, which is the part worth pinning: every caller is a click handler in
// layout chrome that does not re-render on a scope change.
describe('forgetSceneForCurrentRelease', () => {
  function stubLocation(search: string) {
    vi.stubGlobal('window', { localStorage: storage, location: { search } });
  }

  it('forgets the scene of the release the url has scoped', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    expect(recallScene('release-1')).toBe('metadata');

    stubLocation('?release=release-1&scene=metadata');
    forgetSceneForCurrentRelease();
    expect(recallScene('release-1')).toBeNull();
  });

  it('leaves every OTHER release alone', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');

    stubLocation('?release=release-1');
    forgetSceneForCurrentRelease();
    expect(recallScene('release-1')).toBeNull();
    expect(recallScene('release-2')).toBe('calendar');
  });

  it('is a no-op when no release is scoped — the catalog, Notes, Settings', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubLocation('');
    expect(() => forgetSceneForCurrentRelease()).not.toThrow();
    expect(recallScene('release-1')).toBe('metadata');
  });

  it('is a no-op for an empty release param', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubLocation('?release=');
    forgetSceneForCurrentRelease();
    expect(recallScene('release-1')).toBe('metadata');
  });

  it('does not throw on the server, where there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(() => forgetSceneForCurrentRelease()).not.toThrow();
  });
});

describe('no window (server-side / logged out before hydration)', () => {
  it('recallScene returns null without throwing', () => {
    vi.stubGlobal('window', undefined);
    expect(recallScene('release-1')).toBeNull();
  });

  it('rememberScene does not throw', () => {
    vi.stubGlobal('window', undefined);
    expect(() => rememberScene('release-1', 'metadata')).not.toThrow();
  });

  it('resetSceneMemory does not throw', () => {
    vi.stubGlobal('window', undefined);
    expect(() => resetSceneMemory()).not.toThrow();
  });
});


// decideIncomingScene consults resolveActiveScene, which reads its flags at
// MODULE scope — so each case re-imports with the flags it wants, the same
// pattern scene-cache.test.ts uses. Nothing here touches storage: the rule is
// pure, which is the point of it living apart from recallScene.
const SCENE_FLAGS = [
  'NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR',
  'NEXT_PUBLIC_FEATURE_CAPTURE',
  'NEXT_PUBLIC_FEATURE_COVER_ART',
  'NEXT_PUBLIC_FEATURE_TIMELINE',
  'NEXT_PUBLIC_FEATURE_METADATA',
  'NEXT_PUBLIC_FEATURE_FILES',
  'NEXT_PUBLIC_FEATURE_PITCHING',
  'NEXT_PUBLIC_FEATURE_RELEASE_PLANNER',
] as const;

async function loadDecider(flagsOn: boolean) {
  vi.resetModules();
  for (const flag of SCENE_FLAGS) {
    vi.stubEnv(flag, flagsOn ? 'true' : 'false');
  }
  const mod = await import('./scene-memory');
  return mod.decideIncomingScene;
}

/**
 * The rule behind the founder's 2026-09-08 report: tapping "Review your draft
 * plan" landed on Metadata. Memory was overriding an explicitly requested
 * scene; it is a DEFAULT now, and these are the assertions whose absence let
 * that ship — nothing anywhere asserted that a requested scene survived a
 * scope change.
 */
describe('decideIncomingScene', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Scoping from nothing: a bare /dashboard, a deep link, or the
  // single-release auto-scope. Anything in the URL was written for the release
  // about to be scoped.
  const fromNothing = { previousReleaseId: null };
  // Switching between two releases: the URL's scene belongs to the one being
  // left, so it must NOT survive.
  const fromRelease = { previousReleaseId: 'release-a' };

  it('lets an explicit request beat a remembered scene', async () => {
    const decide = await loadDecider(true);
    expect(
      decide({ ...fromRelease, urlScene: null, requested: 'coverart', remembered: 'metadata' })
    ).toBe('coverart');
  });

  it('treats an explicit null as "no scene", not as "no opinion"', async () => {
    const decide = await loadDecider(true);
    expect(
      decide({ ...fromNothing, urlScene: 'coverart', requested: null, remembered: 'metadata' })
    ).toBeNull();
  });

  it('falls through to memory when the caller passes no opinion at all', async () => {
    // Absent and null are different answers — the whole reason the field is
    // tested with `in`. Omitting it must resume, not clear.
    const decide = await loadDecider(true);
    expect(decide({ ...fromRelease, urlScene: null, remembered: 'metadata' })).toBe('metadata');
  });

  it('KEEPS a scene already in the URL when scoping from no release', async () => {
    // THE BUG, in one line. The single-release auto-scope runs setScope on
    // arrival, and this used to overwrite the URL's scene with whatever that
    // release was last showing — which is how a tap into the (since-removed)
    // plan review scene landed on Metadata (founder report, 2026-09-08).
    // `coverart` stands in for that scene here now; the rule under test is
    // about ANY scene the URL names, not about which one it used to be.
    const decide = await loadDecider(true);
    expect(decide({ ...fromNothing, urlScene: 'coverart', remembered: 'metadata' })).toBe(
      'coverart'
    );
  });

  it('does NOT carry the URL scene across when switching between releases', async () => {
    // The other half, and the regression this fix must not cause: release A's
    // open scene leaking onto release B is the leak scene memory exists to
    // stop. B resumes its OWN memory, not A's scene.
    const decide = await loadDecider(true);
    expect(decide({ ...fromRelease, urlScene: 'coverart', remembered: 'metadata' })).toBe(
      'metadata'
    );
    expect(decide({ ...fromRelease, urlScene: 'coverart', remembered: null })).toBeNull();
  });

  it('uses memory only when the URL names no usable scene', async () => {
    const decide = await loadDecider(true);
    expect(decide({ ...fromNothing, urlScene: null, remembered: 'metadata' })).toBe('metadata');
    expect(decide({ ...fromNothing, urlScene: '', remembered: 'metadata' })).toBe('metadata');
    expect(decide({ ...fromNothing, urlScene: 'bogus', remembered: 'metadata' })).toBe('metadata');
    // Case is not normalized anywhere else either — a near-miss is a
    // hand-typed URL and reads as no scene.
    expect(decide({ ...fromNothing, urlScene: 'Metadata', remembered: 'metadata' })).toBe(
      'metadata'
    );
  });

  it('answers null when there is neither a URL scene nor a memory', async () => {
    const decide = await loadDecider(true);
    expect(decide({ ...fromNothing, urlScene: null, remembered: null })).toBeNull();
  });

  it('never resumes a remembered scene whose flag is now off', async () => {
    // A remembered scene outlives the flag that allowed it. Resuming one would
    // put `scene=calendar` in the address bar while the panel renders the main
    // view, and light a pill for something that is not on screen.
    const decide = await loadDecider(false);
    expect(decide({ ...fromRelease, urlScene: null, remembered: 'calendar' })).toBeNull();
    expect(decide({ ...fromRelease, urlScene: null, remembered: 'metadata' })).toBeNull();
  });

  it('never preserves a URL scene whose flag is off', async () => {
    const decide = await loadDecider(false);
    expect(decide({ ...fromNothing, urlScene: 'calendar', remembered: null })).toBeNull();
  });

  it('honours an explicit request even for a flag-gated scene', async () => {
    // Deliberate: `requested` is the caller stating intent in code, not a
    // string off the wire. Its own gate is the control that produced it, and
    // resolveActiveScene still nulls it at render, so the panel cannot show a
    // switched-off scene either way.
    const decide = await loadDecider(false);
    expect(
      decide({ ...fromNothing, urlScene: null, requested: 'coverart', remembered: null })
    ).toBe('coverart');
  });

  it('resumes a scene other than metadata like any other (2026-09-08)', async () => {
    // scene-memory had ZERO coverage of anything but 'metadata' before this —
    // every assertion in this file used it — which is part of why the report
    // took a full trace to reproduce. (The scene actually involved, the plan
    // review, was removed 2026-09-15; 'coverart' stands in for it here.)
    const decide = await loadDecider(true);
    expect(decide({ ...fromRelease, urlScene: null, remembered: 'coverart' })).toBe('coverart');
    expect(decide({ ...fromNothing, urlScene: 'coverart', remembered: null })).toBe('coverart');
  });
});
