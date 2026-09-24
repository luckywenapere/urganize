import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// withFirstShareOffer decides whether a create flow's continuation runs now or
// after the once-only share sheet. The property worth pinning is that the offer
// is only SPENT when a sheet actually showed it: the sheet is a lazy chunk, so
// a very quick first create on a slow connection can finish before it mounts,
// and marking the offer used then would burn it on a sheet nobody saw.
//
// Lives under lib/ only because that is where vitest looks. The auth store is
// mocked because importing the real one pulls in the Supabase client, which
// refuses to load without its env.

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) },
}));

import { withFirstShareOffer } from '@/components/share/withFirstShareOffer';
import { hasOfferedFirstShare, readPendingFirstShare } from './social-share-offer';
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
  vi.stubGlobal('window', { sessionStorage: memoryStorage(), localStorage: memoryStorage() });
  vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'true');
  useShareStore.setState({ request: null, mounted: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('withFirstShareOffer', () => {
  it('opens the sheet first on a first rollout, and runs the rest when it closes', () => {
    const unregister = useShareStore.getState().registerSheet();
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();

    expect(useShareStore.getState().request?.releaseId).toBe('rel-1');
    expect(useShareStore.getState().request?.source).toBe('first_release');
    expect(then).not.toHaveBeenCalled();
    expect(hasOfferedFirstShare('user-1')).toBe(true);

    useShareStore.getState().close();
    expect(then).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not spend the offer when no sheet is mounted, and leaves it pending instead', () => {
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();

    // The flow never waits on a sheet that is not there...
    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();
    // ...and the once-only offer survives, handed to the sheet for later.
    expect(hasOfferedFirstShare('user-1')).toBe(false);
    expect(readPendingFirstShare()).toBe('rel-1');
  });

  it('offers once: a second first-rollout signal carries straight on', () => {
    const unregister = useShareStore.getState().registerSheet();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then: () => {} })();
    useShareStore.getState().close();

    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-2', firstRelease: true, then })();
    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();
    unregister();
  });

  it('is the continuation, untouched, for any rollout that is not the first', () => {
    const unregister = useShareStore.getState().registerSheet();
    for (const firstRelease of [false, undefined]) {
      const then = vi.fn();
      withFirstShareOffer({ releaseId: 'rel-1', firstRelease, then })();
      expect(then).toHaveBeenCalledTimes(1);
      expect(useShareStore.getState().request).toBeNull();
    }
    expect(hasOfferedFirstShare('user-1')).toBe(false);
    unregister();
  });

  it('is the continuation, untouched, with the feature switched off', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'false');
    const unregister = useShareStore.getState().registerSheet();
    const then = vi.fn();
    withFirstShareOffer({ releaseId: 'rel-1', firstRelease: true, then })();
    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();
    expect(readPendingFirstShare()).toBeNull();
    unregister();
  });
});
