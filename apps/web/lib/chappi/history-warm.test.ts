import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// URG-314 option C: AppShell warms the history list and the Home chat right
// after sign-in; the history store takes each warmed response once.

const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSessionMock() } },
}));

const USER = '7b0c6a52-1d1e-4c11-9a77-2f6a3c0d9e11';
let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import('./history-warm');
}

beforeEach(() => {
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ url }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('warmChappiHistory', () => {
  it('fires the list and the Home chat request once, as background requests', async () => {
    const { warmChappiHistory, takeWarmedHistory } = await load();
    warmChappiHistory(USER);
    warmChappiHistory(USER);
    await takeWarmedHistory(USER, 'list');
    await takeWarmedHistory(USER, 'home');
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls.sort()).toEqual(['/api/urgans/conversations', `/api/urgans/conversations/${USER}`]);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.Authorization).toBe('Bearer tok');
      expect(call[1].headers['x-urganize-prefetch']).toBe('1');
    }
  });

  it('hands each warmed response out once', async () => {
    const { warmChappiHistory, takeWarmedHistory } = await load();
    warmChappiHistory(USER);
    const first = await takeWarmedHistory(USER, 'list');
    expect(first?.status).toBe(200);
    expect(takeWarmedHistory(USER, 'list')).toBeNull();
    expect(await takeWarmedHistory(USER, 'home')).not.toBeNull();
  });

  it('never hands one account another account\'s history', async () => {
    const { warmChappiHistory, takeWarmedHistory } = await load();
    warmChappiHistory(USER);
    expect(takeWarmedHistory('someone-else', 'list')).toBeNull();
    expect(takeWarmedHistory('someone-else', 'home')).toBeNull();
  });

  it('ignores a stale warm and warms again for a later sign-in', async () => {
    vi.useFakeTimers();
    const { warmChappiHistory, takeWarmedHistory } = await load();
    warmChappiHistory(USER);
    vi.advanceTimersByTime(25_000);
    expect(takeWarmedHistory(USER, 'list')).toBeNull();
    warmChappiHistory(USER);
    expect(takeWarmedHistory(USER, 'list')).not.toBeNull();
  });

  it('sends nothing without a session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { warmChappiHistory, takeWarmedHistory } = await load();
    warmChappiHistory(USER);
    expect(await takeWarmedHistory(USER, 'list')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
