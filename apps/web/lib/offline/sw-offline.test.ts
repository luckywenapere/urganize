import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * public/sw-offline.js is a plain script meant to run in the service-worker
 * global scope, not a module — it has no exports to import. To unit test
 * its routing decisions without a browser, this loads the file's source
 * text into a `new Function` body: such a function's identifiers resolve
 * against the real global object, so stubbing `self`, `caches`,
 * `importScripts`, and `fetch` on `globalThis` before evaluating it is
 * equivalent to loading the file as an actual service worker script.
 */

const SW_SOURCE = readFileSync(join(__dirname, '../../public/sw-offline.js'), 'utf8');

type FakeSwEvent = {
  request?: ReturnType<typeof fakeRequest>;
  respondWith?: (promise: Promise<FakeResponse>) => void;
  waitUntil?: (promise: Promise<unknown>) => unknown;
};
type Listener = (event: FakeSwEvent) => unknown;

/**
 * jsdom's Request/Response implementations are stricter than a service
 * worker's real environment needs here: `mode: 'navigate'` is rejected by
 * the Request constructor (browser-only), and `ok`/`type` are read-only
 * getters on a real Response, so a mocked network response can't fake
 * `type: 'basic'` by assignment. Plain objects carrying exactly the shape
 * sw-offline.js actually reads (`url`, `method`, `mode` / `ok`, `type`,
 * `clone()`, `text()`) sidestep both restrictions without weakening what
 * the routing logic itself is asked to do.
 */
function fakeRequest(url: string, options: { method?: string; mode?: string } = {}) {
  return { url, method: options.method || 'GET', mode: options.mode };
}

type FakeResponse = {
  ok: boolean;
  type: string;
  url: string | undefined;
  clone(): FakeResponse;
  text(): Promise<string>;
};

function fakeResponse(body: string, options: { ok?: boolean; type?: string } = {}): FakeResponse {
  const ok = options.ok ?? true;
  const type = options.type ?? 'basic';
  return {
    ok,
    type,
    url: undefined,
    clone(): FakeResponse {
      return fakeResponse(body, { ok, type });
    },
    async text() {
      return body;
    },
  };
}

// The real Cache API resolves a relative URL string against the current
// origin before matching (e.g. caches.match('/dashboard') matches an entry
// keyed by 'https://app.urganize.app/dashboard') — sw-offline.js relies on
// exactly that when it looks up the cached app shell by the relative path
// '/dashboard'. This fake mirrors that resolution rather than doing plain
// string equality, so the test proves the SAME behavior the browser gives.
const FAKE_ORIGIN = 'https://app.urganize.app';
function resolveCacheKey(request: { url: string } | string): string {
  const raw = typeof request === 'string' ? request : request.url;
  return new URL(raw, FAKE_ORIGIN).href;
}

function createFakeCacheStorage() {
  const stores = new Map<string, Map<string, ReturnType<typeof fakeResponse>>>();

  const cacheStorage = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(request: { url: string } | string) {
          return store.get(resolveCacheKey(request));
        },
        async put(request: { url: string } | string, response: ReturnType<typeof fakeResponse>) {
          store.set(resolveCacheKey(request), response);
        },
        async keys() {
          return Array.from(store.keys()).map((key) => fakeRequest(key));
        },
        async delete(request: { url: string } | string) {
          return store.delete(resolveCacheKey(request));
        },
      };
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: { url: string } | string) {
      const key = resolveCacheKey(request);
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key);
      }
      return undefined;
    },
  };

  return { cacheStorage, stores };
}

function loadServiceWorker(fetchImpl: typeof fetch, search = '') {
  const listeners: Record<string, Listener[]> = {};
  const { cacheStorage } = createFakeCacheStorage();

  const fakeSelf = {
    location: { origin: 'https://app.urganize.app', search },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };

  const globalScope = globalThis as unknown as {
    self: unknown;
    caches: unknown;
    importScripts: unknown;
    fetch: unknown;
  };
  globalScope.self = fakeSelf;
  globalScope.caches = cacheStorage;
  globalScope.importScripts = vi.fn();
  globalScope.fetch = fetchImpl;

  // This IS the point — see the file header.
  new Function(SW_SOURCE)();

  return { listeners, fakeSelf, cacheStorage };
}

async function dispatchFetch(listeners: Record<string, Listener[]>, request: ReturnType<typeof fakeRequest>) {
  let respondedWith: Promise<ReturnType<typeof fakeResponse>> | undefined;
  const event = {
    request,
    respondWith(promise: Promise<ReturnType<typeof fakeResponse>>) {
      respondedWith = promise;
    },
    waitUntil: vi.fn(),
  };
  for (const listener of listeners.fetch || []) {
    listener(event);
  }
  return respondedWith;
}

describe('sw-offline.js routing', () => {
  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.self;
    delete globalScope.caches;
    delete globalScope.importScripts;
    delete globalScope.fetch;
    vi.restoreAllMocks();
  });

  it('imports the shared push handlers', () => {
    loadServiceWorker(vi.fn());
    expect((globalThis as unknown as { importScripts: unknown }).importScripts).toHaveBeenCalledWith('/sw-push.js');
  });

  it('never intercepts /api/* requests', async () => {
    const fetchImpl = vi.fn();
    const { listeners } = loadServiceWorker(fetchImpl);
    const request = fakeRequest('https://app.urganize.app/api/command-center');
    const responded = await dispatchFetch(listeners, request);
    expect(responded).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never intercepts a non-GET request', async () => {
    const fetchImpl = vi.fn();
    const { listeners } = loadServiceWorker(fetchImpl);
    const request = fakeRequest('https://app.urganize.app/dashboard', { method: 'POST' });
    const responded = await dispatchFetch(listeners, request);
    expect(responded).toBeUndefined();
  });

  it('never intercepts a cross-origin request', async () => {
    const fetchImpl = vi.fn();
    const { listeners } = loadServiceWorker(fetchImpl);
    const request = fakeRequest('https://example-project.supabase.co/storage/v1/object/foo');
    const responded = await dispatchFetch(listeners, request);
    expect(responded).toBeUndefined();
  });

  it('serves /_next/static/* cache-first', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse('body-v1'));
    const { listeners } = loadServiceWorker(fetchImpl);
    const url = 'https://app.urganize.app/_next/static/chunks/main.js';

    const first = await dispatchFetch(listeners, fakeRequest(url));
    await first;
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Second request for the same content-hashed URL must NOT hit the
    // network again — that is the entire point of cache-first for
    // immutable, hashed assets.
    const second = await dispatchFetch(listeners, fakeRequest(url));
    await second;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to a cached exact page when a navigation goes offline', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse('<html>settings</html>'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);
    const request = () => fakeRequest('https://app.urganize.app/settings', { mode: 'navigate' });

    const firstResponse = await (await dispatchFetch(listeners, request()))!;
    expect(await firstResponse.text()).toBe('<html>settings</html>');

    const secondResponse = await (await dispatchFetch(listeners, request()))!;
    expect(await secondResponse.text()).toBe('<html>settings</html>');
  });

  it('precaches the pages it is told to, so they open offline without a prior visit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse('<html>notes</html>'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);

    let work: Promise<unknown> | undefined;
    for (const listener of listeners.message || []) {
      listener({
        data: { type: 'precache-routes', paths: ['/dashboard/notes', '//evil.test', '/api/x'] },
        waitUntil: (p: Promise<unknown>) => {
          work = p;
        },
      } as never);
    }
    await work;
    // Only the one safe path was fetched: protocol-relative and /api/ refused.
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const offline = await (await dispatchFetch(
      listeners,
      fakeRequest('https://app.urganize.app/dashboard/notes', { mode: 'navigate' })
    ))!;
    expect(await offline.text()).toBe('<html>notes</html>');
  });

  it('serves a cached in-app navigation payload when the network fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse('rsc-payload'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);
    const url = 'https://app.urganize.app/dashboard/notes?_rsc=abc';

    await (await dispatchFetch(listeners, fakeRequest(url)))!;
    const offline = await (await dispatchFetch(listeners, fakeRequest(url)))!;
    expect(await offline.text()).toBe('rsc-payload');
  });

  it('falls back to the cached dashboard shell for an uncached app-chrome path', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse('<html>dashboard-shell</html>'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);

    // Prime the dashboard shell in the cache.
    const dashboardResponse = await (await dispatchFetch(
      listeners,
      fakeRequest('https://app.urganize.app/dashboard', { mode: 'navigate' })
    ))!;
    expect(await dashboardResponse.text()).toBe('<html>dashboard-shell</html>');

    // A DIFFERENT, never-visited app-chrome URL, offline this time, must
    // still resolve to the app shell rather than a dead end.
    const scopedResponse = await (await dispatchFetch(
      listeners,
      fakeRequest('https://app.urganize.app/dashboard?release=abc', { mode: 'navigate' })
    ))!;
    expect(await scopedResponse.text()).toBe('<html>dashboard-shell</html>');
  });

  it('NEVER falls back to app chrome for a public token page — only the generic offline page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse('<html>dashboard-shell</html>'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);

    // Prime the dashboard shell so a bug that DID fall back to it would be
    // observable rather than accidentally matching an empty cache.
    await (await dispatchFetch(
      listeners,
      fakeRequest('https://app.urganize.app/dashboard', { mode: 'navigate' })
    ))!;

    const publicPaths = [
      '/epk/some-token',
      '/credits/some-token',
      '/capture/some-token',
      '/curator',
      '/curator/join/abc',
      '/auth',
      '/join/abc',
      '/invite/accept',
    ];

    for (const path of publicPaths) {
      const response = await (await dispatchFetch(
        listeners,
        fakeRequest(`https://app.urganize.app${path}`, { mode: 'navigate' })
      ))!;
      const body = await response.text();
      expect(body).not.toContain('dashboard-shell');
      expect(body).toContain("You're offline");
    }
  });

  it('shows the generic offline page for an uncached, non-chrome path with no dashboard shell available', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl);

    const response = await (await dispatchFetch(
      listeners,
      fakeRequest('https://app.urganize.app/some/random/path', { mode: 'navigate' })
    ))!;
    const body = await response.text();
    expect(body).toContain("You're offline");
  });

  it('cleans up stale-version offline caches on activate', async () => {
    const { listeners, cacheStorage } = loadServiceWorker(vi.fn());
    await cacheStorage.open('urganize-offline-html-v0');
    await cacheStorage.open('urganize-offline-assets-v1');
    await cacheStorage.open('some-unrelated-cache');

    const event = { waitUntil: (promise: Promise<unknown>) => promise };
    for (const listener of listeners.activate || []) {
      await listener(event);
    }

    const remaining = await cacheStorage.keys();
    expect(remaining).not.toContain('urganize-offline-html-v0');
    expect(remaining).toContain('urganize-offline-assets-v1');
    expect(remaining).toContain('some-unrelated-cache');
  });
});

describe('sw-offline.js stale-while-revalidate shell (URG-314)', () => {
  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.self;
    delete globalScope.caches;
    delete globalScope.importScripts;
    delete globalScope.fetch;
    vi.restoreAllMocks();
  });

  function stamped(body: string, headers: Record<string, string>): FakeResponse & { headers: { get(n: string): string | null } } {
    const base = fakeResponse(body);
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const withHeaders = {
      ...base,
      headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
      clone: () => stamped(body, headers),
    };
    return withHeaders;
  }
  const nav = (path: string) => fakeRequest(`https://app.urganize.app${path}`, { mode: 'navigate' });
  const STATIC_B1 = { 'x-nextjs-prerender': '1', 'x-urg-build': 'b1' };

  it('answers a static app page from the device and refreshes it in the background', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(stamped('<html>first</html>', STATIC_B1))
      .mockResolvedValueOnce(stamped('<html>second</html>', STATIC_B1));
    const { listeners } = loadServiceWorker(fetchImpl as unknown as typeof fetch, '?v=b1');

    const first = await (await dispatchFetch(listeners, nav('/dashboard')))!;
    expect(await first.text()).toBe('<html>first</html>');

    const second = await (await dispatchFetch(listeners, nav('/dashboard')))!;
    // Served the cached copy instantly, while the network refresh ran.
    expect(await second.text()).toBe('<html>first</html>');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never serves a cached page stamped by another build', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(stamped('<html>old build</html>', { 'x-nextjs-prerender': '1', 'x-urg-build': 'b0' }))
      .mockResolvedValueOnce(stamped('<html>net</html>', STATIC_B1));
    const { listeners } = loadServiceWorker(fetchImpl as unknown as typeof fetch, '?v=b1');
    await (await dispatchFetch(listeners, nav('/dashboard')))!;
    const second = await (await dispatchFetch(listeners, nav('/dashboard')))!;
    expect(await second.text()).toBe('<html>net</html>');
  });

  it('keeps dynamic pages and /auth network-first', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => stamped('<html>live</html>', { 'x-urg-build': 'b1' }));
    const { listeners } = loadServiceWorker(fetchImpl as unknown as typeof fetch, '?v=b1');
    await (await dispatchFetch(listeners, nav('/dashboard/releases/abc')))!;
    await (await dispatchFetch(listeners, nav('/dashboard/releases/abc')))!;
    await (await dispatchFetch(listeners, nav('/auth')))!;
    await (await dispatchFetch(listeners, nav('/auth')))!;
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('never stores a private or no-store response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(stamped('<html>mine</html>', { ...STATIC_B1, 'cache-control': 'private, no-store' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { listeners } = loadServiceWorker(fetchImpl as unknown as typeof fetch, '?v=b1');
    await (await dispatchFetch(listeners, nav('/settings')))!;
    const offline = await (await dispatchFetch(listeners, nav('/settings')))!;
    expect(await offline.text()).toContain("You're offline");
  });

  it('versions its caches by build and clears everything on clear-all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(stamped('<html>x</html>', STATIC_B1));
    const { listeners, cacheStorage } = loadServiceWorker(fetchImpl as unknown as typeof fetch, '?v=b1');
    await (await dispatchFetch(listeners, nav('/dashboard')))!;
    expect(await cacheStorage.keys()).toContain('urganize-offline-html-b1');
    await cacheStorage.open('some-unrelated-cache');

    let pending: Promise<unknown> = Promise.resolve();
    for (const listener of listeners.message || []) {
      listener({ data: { type: 'clear-all' }, waitUntil: (p: Promise<unknown>) => (pending = p) } as unknown as FakeSwEvent);
    }
    await pending;
    const remaining = await cacheStorage.keys();
    expect(remaining.filter((n: string) => n.startsWith('urganize-offline-'))).toEqual([]);
    expect(remaining).toContain('some-unrelated-cache');
  });
});
