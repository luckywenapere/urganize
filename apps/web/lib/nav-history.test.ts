import { afterEach, describe, expect, it } from 'vitest';
import { nextNavigationStack, readPreviousLocation, recordNavigation } from './nav-history';

// The per-tab navigation trail. Its only consumer is now the Settings back
// button (the workspace arrow stopped reading history on 2026-08-30 — see
// WorkspaceView's goBack), and these are worth pinning hard because none of it
// can be exercised without an authenticated browser session, and because the
// pair-shaped version this replaced made back non-terminating for long enough
// that a user reported it as stuck.

const RELEASE = '9c08ce0a-d9c4-4fe6-a98b-6f28475ec89f';
const OTHER_RELEASE = '11111111-2222-3333-4444-555555555555';

// ---------------------------------------------------------------------------
// The trail itself (2026-08-29). These exist because the OLD shape — a
// `current` + `previous` pair — made both back buttons non-terminating: a back
// press refilled the slot with the page it had just left, so the next press
// returned there. The founder reported it as "this back button gets stuck a
// lot, I can't even go back".
// ---------------------------------------------------------------------------

describe('nextNavigationStack', () => {
  it('pushes a forward move', () => {
    expect(nextNavigationStack([], '/dashboard')).toEqual(['/dashboard']);
    expect(nextNavigationStack(['/dashboard'], '/settings')).toEqual(['/dashboard', '/settings']);
  });

  it('ignores a re-render of the same URL', () => {
    // useSearchParams hands NavigationTracker's effect a new object identity on
    // every render, so this fires far more often than the user navigates.
    expect(nextNavigationStack(['/a', '/b'], '/b')).toEqual(['/a', '/b']);
  });

  // THE FIX. Without this the trail only ever grows, and the entry beneath the
  // top is always the page you just came back from.
  it('pops when returning to the entry directly beneath the top', () => {
    expect(nextNavigationStack(['/dashboard', '/settings'], '/dashboard')).toEqual(['/dashboard']);
  });

  it('pops for a browser back or an edge swipe too — it cannot tell them apart, and must not', () => {
    const trail = ['/dashboard', `/dashboard?release=${RELEASE}`, '/settings'];
    expect(nextNavigationStack(trail, `/dashboard?release=${RELEASE}`)).toEqual(trail.slice(0, -1));
  });

  it('does not pop a one-entry trail, which has nothing beneath it', () => {
    expect(nextNavigationStack(['/dashboard'], '/dashboard')).toEqual(['/dashboard']);
  });

  it('pushes a match that is deeper than one step down', () => {
    // Only "one step back" is a pop. A jump to an older entry is a forward
    // move as far as this is concerned — bounded by the cap, and the trail
    // stays honest about where the user actually is.
    expect(nextNavigationStack(['/a', '/b', '/c'], '/a')).toEqual(['/a', '/b', '/c', '/a']);
  });

  it('caps the trail, dropping the oldest', () => {
    const long = Array.from({ length: 20 }, (_, index) => `/p${index}`);
    const next = nextNavigationStack(long, '/new');
    expect(next).toHaveLength(20);
    expect(next[0]).toBe('/p1');
    expect(next[19]).toBe('/new');
  });

  it('refuses to record anything that is not a same-origin relative path', () => {
    for (const url of ['https://evil.example/x', '//evil.example', 'dashboard', '']) {
      expect(nextNavigationStack(['/dashboard'], url)).toEqual(['/dashboard']);
    }
  });

  // The regression that started this. Every back press must shrink the trail,
  // so the loop below has to reach a floor instead of oscillating forever.
  it('terminates the release <-> Settings loop the founder was trapped in', () => {
    const release = `/dashboard?release=${RELEASE}`;
    let trail = ['/dashboard'];
    trail = nextNavigationStack(trail, release);
    trail = nextNavigationStack(trail, '/settings');

    // Settings back -> the release. Its own "previous" must now be the
    // catalog again, NOT Settings; under the old shape it was Settings, and
    // that is precisely what made the next tap come straight back here.
    trail = nextNavigationStack(trail, release);
    expect(trail).toEqual(['/dashboard', release]);
    expect(trail[trail.length - 2]).toBe('/dashboard');

    // Workspace back -> the catalog, and there the trail is exhausted.
    trail = nextNavigationStack(trail, '/dashboard');
    expect(trail).toEqual(['/dashboard']);
    expect(trail[trail.length - 2]).toBeUndefined();
  });

  it('terminates a two-release loop, which AI and note chips can both start', () => {
    const a = `/dashboard?release=${RELEASE}`;
    const b = `/dashboard?release=${OTHER_RELEASE}`;
    let trail = nextNavigationStack(nextNavigationStack(['/dashboard'], a), b);
    trail = nextNavigationStack(trail, a);
    expect(trail).toEqual(['/dashboard', a]);
    trail = nextNavigationStack(trail, '/dashboard');
    expect(trail).toEqual(['/dashboard']);
  });
});

/**
 * A Map-backed sessionStorage. vitest runs in the `node` environment by config,
 * so there is no window; the module reaches for it behind a
 * `typeof window !== 'undefined'` guard, so this is the whole surface it needs.
 * Same approach as lib/credit-prefill.test.ts.
 */
function stubSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  (globalThis as { window?: unknown }).window = { sessionStorage };
  return { store, sessionStorage };
}

describe('recordNavigation / readPreviousLocation', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('round-trips a trail', () => {
    stubSessionStorage();
    expect(readPreviousLocation()).toBeNull();

    recordNavigation('/dashboard');
    expect(readPreviousLocation()).toBeNull();

    recordNavigation(`/dashboard?release=${RELEASE}`);
    expect(readPreviousLocation()).toBe('/dashboard');

    recordNavigation('/settings');
    expect(readPreviousLocation()).toBe(`/dashboard?release=${RELEASE}`);

    // Back to the release: previous is the catalog again, not Settings.
    recordNavigation(`/dashboard?release=${RELEASE}`);
    expect(readPreviousLocation()).toBe('/dashboard');
  });

  it('survives a junk or legacy value instead of throwing', () => {
    const { store } = stubSessionStorage();
    for (const junk of ['not json', '{"current":"/dashboard"}', '[1,2,3]', '["//evil.example"]']) {
      store.set('urganize.nav.stack', junk);
      expect(readPreviousLocation()).toBeNull();
      expect(() => recordNavigation('/dashboard')).not.toThrow();
    }
  });

  it('is inert when storage throws, which is private mode', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    (globalThis as { window?: unknown }).window = { sessionStorage: throwing };
    expect(readPreviousLocation()).toBeNull();
    expect(() => recordNavigation('/dashboard')).not.toThrow();
  });

  it('does nothing at all on the server', () => {
    expect(readPreviousLocation()).toBeNull();
    expect(() => recordNavigation('/dashboard')).not.toThrow();
  });
});
