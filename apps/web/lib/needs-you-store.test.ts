import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #1039: focus and tab changes call load() often, and each call is a Vercel
// function run. A second load inside NEEDS_YOU_FRESH_MS must not reach the
// server; a forced load must.

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  },
}));

describe('useNeedsYouStore.load', () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ notifications: [] }), { status: 200 }));

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks the server once for two loads in quick succession', async () => {
    const { useNeedsYouStore } = await import('@/stores/useNeedsYouStore');
    await useNeedsYouStore.getState().load();
    await useNeedsYouStore.getState().load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again when forced', async () => {
    const { useNeedsYouStore } = await import('@/stores/useNeedsYouStore');
    await useNeedsYouStore.getState().load();
    await useNeedsYouStore.getState().load({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks again once the window has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { useNeedsYouStore, NEEDS_YOU_FRESH_MS } = await import('@/stores/useNeedsYouStore');
    await useNeedsYouStore.getState().load();
    vi.setSystemTime(Date.now() + NEEDS_YOU_FRESH_MS + 1);
    await useNeedsYouStore.getState().load();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
