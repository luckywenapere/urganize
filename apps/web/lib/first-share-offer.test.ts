import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// withFirstShareOffer runs a create flow's continuation and, when this was the
// person's first rollout, saves the once-only share offer for the NEXT visit.
// The property worth pinning (2026-10-13): it never opens the sheet straight
// after a create any more, even when a sheet is mounted and ready. Opening it
// there asked people to announce a rollout before it had a plan.
//
// Lives under lib/ only because that is where vitest looks. The auth store is
// mocked because importing the real one pulls in the Supabase client, which
// refuses to load without its env.

let currentUserId: string | null = 'user-1';
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: { getState: () => ({ user: currentUserId ? { id: currentUserId } : null }) },
}));

import { deferFirstShareOffer, withFirstShareOffer } from '@/components/share/withFirstShareOffer';
import {
  hasOfferedFirstShare,
  markFirstShareOffered,
  readDeferredFirstShare,
} from './social-share-offer';
import { useShareStore } from '@/stores/useShareStore';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

beforeEach(() => {
  currentUserId = 'user-1';
  vi.stubGlobal('window', { sessionStorage: memoryStorage(), localStorage: memoryStorage() });
  vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'true');
  useShareStore.setState({ request: null, mounted: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('withFirstShareOffer', () => {
  it('runs the rest of the flow straight away and opens no sheet, even with one mounted', () => {
    const unregister = useShareStore.getState().registerSheet();
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();

    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();
    unregister();
  });

  it('saves the offer for the next visit, for this person and rollout, without spending it', () => {
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then: () => {} })();

    const saved = readDeferredFirstShare();
    expect(saved?.releaseId).toBe('rel-1');
    expect(saved?.userId).toBe('user-1');
    // Spent only when the sheet actually shows it, on a later visit.
    expect(hasOfferedFirstShare('user-1')).toBe(false);
  });

  it('saves nothing for a rollout that is not the first', () => {
    for (const firstRelease of [false, undefined]) {
      const then = vi.fn();
      withFirstShareOffer({ releaseId: 'rel-1', firstRelease, then })();
      expect(then).toHaveBeenCalledTimes(1);
    }
    expect(readDeferredFirstShare()).toBeNull();
  });

  it('saves nothing once the offer has been made', () => {
    markFirstShareOffered('user-1');
    withFirstShareOffer({ releaseId: 'rel-2', firstRelease: true, then: () => {} })();
    expect(readDeferredFirstShare()).toBeNull();
  });

  it('saves nothing with the feature switched off', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'false');
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();
    expect(then).toHaveBeenCalledTimes(1);
    expect(readDeferredFirstShare()).toBeNull();
  });

  it('saves nothing without a signed-in person, and still runs the flow', () => {
    currentUserId = null;
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();
    expect(then).toHaveBeenCalledTimes(1);
    expect(readDeferredFirstShare()).toBeNull();
  });

  it('decides when it runs, not when it is built (the team-login step sits between)', () => {
    const run = withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then: () => {} });
    markFirstShareOffered('user-1');
    run();
    expect(readDeferredFirstShare()).toBeNull();
  });
});

describe('deferFirstShareOffer (UrgAns create_release, and a reply that lands late)', () => {
  it('follows the same rules as the create flows', () => {
    deferFirstShareOffer('rel-9', true);
    expect(readDeferredFirstShare()?.releaseId).toBe('rel-9');
    expect(useShareStore.getState().request).toBeNull();
  });

  it('never throws on a blocked store', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {},
      },
      localStorage: memoryStorage(),
    });
    expect(() => deferFirstShareOffer('rel-1', true)).not.toThrow();
  });
});
