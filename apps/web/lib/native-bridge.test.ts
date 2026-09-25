import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  buildDeliverScript,
  buildShellInfoScript,
  createShellDispatcher,
  cssColorToHex,
  parseAppearance,
  statusBarStyleFor,
  type BridgeHandlers,
  decodeInbound,
  decodeRequest,
  encodeEvent,
  encodeRequest,
  encodeResponse,
  isFirstPartyUrl,
  notificationPath,
  oauthRedirectToPath,
  parseShellInfo,
  safeShareFileName,
  shouldRetryAfterReconnect,
  type ShellInfo,
} from '@urganize/native-bridge';
import { BridgeTimeoutError, createBridgeClient } from './native-bridge';

const SHELL: ShellInfo = {
  platform: 'android',
  shellVersion: '1.41.0',
  protocol: 1,
  capabilities: ['openExternal', 'oauth', 'push.permission', 'push.register', 'shareFile'],
};

describe('parseShellInfo', () => {
  it('accepts a well-formed description', () => {
    expect(parseShellInfo(SHELL)).toEqual(SHELL);
  });

  it('treats anything malformed as "not in the shell"', () => {
    expect(parseShellInfo(undefined)).toBeNull();
    expect(parseShellInfo(null)).toBeNull();
    expect(parseShellInfo('android')).toBeNull();
    expect(parseShellInfo({ ...SHELL, platform: 'web' })).toBeNull();
    expect(parseShellInfo({ ...SHELL, protocol: 0 })).toBeNull();
    expect(parseShellInfo({ ...SHELL, protocol: '1' })).toBeNull();
  });

  it('drops capabilities it does not recognise instead of trusting them', () => {
    const info = parseShellInfo({ ...SHELL, capabilities: ['oauth', 'rm -rf', 42] });
    expect(info?.capabilities).toEqual(['oauth']);
  });

  it('builds an injected script that sets the global', () => {
    const script = buildShellInfoScript(SHELL);
    const sandbox: Record<string, unknown> = {};
    new Function('window', script)(sandbox);
    expect(parseShellInfo(sandbox.__URGANIZE_NATIVE__)).toEqual(SHELL);
  });
});

describe('request and response encoding', () => {
  it('round-trips a request', () => {
    const raw = encodeRequest('abc', 'openExternal', { url: 'https://x.test' });
    expect(decodeRequest(raw)).toEqual({
      v: BRIDGE_PROTOCOL_VERSION,
      id: 'abc',
      type: 'openExternal',
      payload: { url: 'https://x.test' },
    });
  });

  it('rejects requests that are not ours', () => {
    expect(decodeRequest('not json')).toBeNull();
    expect(decodeRequest(JSON.stringify({ v: 1, id: 'a', type: 'eval', payload: {} }))).toBeNull();
    expect(decodeRequest(JSON.stringify({ v: 2, id: 'a', type: 'ready' }))).toBeNull();
    expect(decodeRequest(JSON.stringify({ v: 1, id: '', type: 'ready' }))).toBeNull();
    expect(decodeRequest({ v: 1, id: 'a', type: 'ready' })).toBeNull();
  });

  it('round-trips responses and events', () => {
    expect(decodeInbound(encodeResponse('a', { ok: true, result: { token: 't' } }))).toEqual({
      kind: 'response',
      id: 'a',
      ok: true,
      result: { token: 't' },
    });
    expect(decodeInbound(encodeResponse('a', { ok: false, error: 'nope' }))).toEqual({
      kind: 'response',
      id: 'a',
      ok: false,
      error: 'nope',
    });
    expect(decodeInbound(encodeEvent('pushTap', { url: '/dashboard' }))).toEqual({
      kind: 'event',
      event: 'pushTap',
      data: { url: '/dashboard' },
    });
  });

  it('ignores inbound messages that are not ours', () => {
    expect(decodeInbound('{')).toBeNull();
    expect(decodeInbound(JSON.stringify({ v: 1, kind: 'event', event: 'reboot' }))).toBeNull();
    expect(decodeInbound(JSON.stringify({ v: 1, kind: 'response', id: 'a' }))).toBeNull();
    expect(decodeInbound(JSON.stringify({ kind: 'response', id: 'a', ok: true }))).toBeNull();
  });
});

describe('buildDeliverScript', () => {
  it('delivers the exact message, however hostile the payload', () => {
    const hostile = encodeEvent('pushTap', { url: "/x');alert(1);('  </script>" });
    const received: unknown[] = [];
    const win = { __urganizeBridgeReceive: (raw: unknown) => received.push(raw) };
    new Function('window', buildDeliverScript(hostile))(win);
    expect(received).toEqual([hostile]);
  });

  it('is a no-op when no receiver is installed yet', () => {
    expect(() => new Function('window', buildDeliverScript('{}'))({})).not.toThrow();
  });

  it('never puts a raw line or paragraph separator into the script', () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const message = encodeEvent('pushTap', { url: `/a${LS}b${PS}c` });
    const script = buildDeliverScript(message);
    // Older engines end a string literal at either character, so the script
    // must carry their escapes instead. The message itself must still arrive
    // exactly as sent.
    expect(script.includes(LS)).toBe(false);
    expect(script.includes(PS)).toBe(false);
    const received: unknown[] = [];
    new Function('window', script)({ __urganizeBridgeReceive: (raw: unknown) => received.push(raw) });
    expect(received).toEqual([message]);
  });
});

describe('isFirstPartyUrl', () => {
  it('allows only https urganize.app and its subdomains', () => {
    expect(isFirstPartyUrl('https://app.urganize.app/dashboard')).toBe(true);
    expect(isFirstPartyUrl('https://urganize.app/')).toBe(true);
    expect(isFirstPartyUrl('http://app.urganize.app/')).toBe(false);
    expect(isFirstPartyUrl('https://evilurganize.app/')).toBe(false);
    expect(isFirstPartyUrl('https://app.urganize.app.evil.test/')).toBe(false);
    expect(isFirstPartyUrl('https://checkout.paystack.com/x')).toBe(false);
    expect(isFirstPartyUrl('mailto:hi@urganize.app')).toBe(false);
    expect(isFirstPartyUrl('garbage')).toBe(false);
  });
});

describe('oauthRedirectToPath', () => {
  const PREFIX = 'com.urganize.app://';

  it('rewrites the scheme redirect into the same-origin callback path', () => {
    expect(oauthRedirectToPath(`${PREFIX}auth/callback?next=%2Fx#access_token=a`, PREFIX)).toBe(
      '/auth/callback?next=%2Fx#access_token=a'
    );
    expect(oauthRedirectToPath(`${PREFIX}auth/callback?code=c`, PREFIX)).toBe('/auth/callback?code=c');
  });

  it('refuses anything with a different prefix', () => {
    expect(oauthRedirectToPath('https://evil.test/auth/callback', PREFIX)).toBeNull();
  });

  it('cannot be turned into a protocol-relative URL', () => {
    expect(oauthRedirectToPath(`${PREFIX}//evil.test/x`, PREFIX)).toBe('/evil.test/x');
  });
});

describe('createBridgeClient', () => {
  function setup() {
    const posted: string[] = [];
    let id = 0;
    const client = createBridgeClient({ post: (m) => posted.push(m), newId: () => `id${(id += 1)}` });
    return { client, posted };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a request with the matching response', async () => {
    const { client, posted } = setup();
    const pending = client.request('push.register', {});
    expect(decodeRequest(posted[0])?.type).toBe('push.register');
    client.receive(encodeResponse('id1', { ok: true, result: { token: 'tok' } }));
    await expect(pending).resolves.toEqual({ token: 'tok' });
    expect(client.pendingCount()).toBe(0);
  });

  it('rejects with the native error message', async () => {
    const { client } = setup();
    const pending = client.request('openExternal', { url: 'https://x.test' });
    client.receive(encodeResponse('id1', { ok: false, error: 'No browser' }));
    await expect(pending).rejects.toThrow('No browser');
  });

  it('matches answers by id, not by arrival order', async () => {
    const { client } = setup();
    const first = client.request('push.permission', {});
    const second = client.request('push.register', {});
    client.receive(encodeResponse('id2', { ok: true, result: { token: 'b' } }));
    client.receive(encodeResponse('id1', { ok: true, result: { permission: 'granted' } }));
    await expect(first).resolves.toEqual({ permission: 'granted' });
    await expect(second).resolves.toEqual({ token: 'b' });
  });

  it('times out, and drops a late answer instead of delivering it twice', async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const pending = client.request('push.register', {}, { timeoutMs: 1000 });
    vi.advanceTimersByTime(1001);
    await expect(pending).rejects.toBeInstanceOf(BridgeTimeoutError);
    expect(client.pendingCount()).toBe(0);
    expect(() => client.receive(encodeResponse('id1', { ok: true, result: {} }))).not.toThrow();
  });

  it('ignores junk and answers to ids it never issued', async () => {
    const { client } = setup();
    const pending = client.request('push.permission', {});
    client.receive('garbage');
    client.receive(encodeResponse('someone-else', { ok: true, result: { permission: 'denied' } }));
    expect(client.pendingCount()).toBe(1);
    client.receive(encodeResponse('id1', { ok: true, result: { permission: 'default' } }));
    await expect(pending).resolves.toEqual({ permission: 'default' });
  });

  it('rejects immediately when posting throws', async () => {
    const client = createBridgeClient({
      post: () => {
        throw new Error('webview gone');
      },
    });
    await expect(client.request('push.permission', {})).rejects.toThrow('webview gone');
    expect(client.pendingCount()).toBe(0);
  });

  it('delivers events to subscribers until they unsubscribe', () => {
    const { client } = setup();
    const taps: string[] = [];
    const unsubscribe = client.subscribe('pushTap', ({ url }) => taps.push(url));
    client.receive(encodeEvent('pushTap', { url: '/a' }));
    client.receive(encodeEvent('pushToken', { token: 'ignored-by-this-listener' }));
    unsubscribe();
    client.receive(encodeEvent('pushTap', { url: '/b' }));
    expect(taps).toEqual(['/a']);
  });

  it('keeps delivering to other listeners when one throws', () => {
    const { client } = setup();
    const seen: string[] = [];
    client.subscribe('pushTap', () => {
      throw new Error('boom');
    });
    client.subscribe('pushTap', ({ url }) => seen.push(url));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    client.receive(encodeEvent('pushTap', { url: '/c' }));
    expect(seen).toEqual(['/c']);
  });
});

describe('platform detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load() {
    const platform = await import('./platform');
    const bridge = await import('./native-bridge');
    return { ...platform, ...bridge };
  }

  it('is web on the server', async () => {
    const { getPlatform, isNativePlatform, isInShell } = await load();
    expect(getPlatform()).toBe('web');
    expect(isNativePlatform()).toBe(false);
    expect(isInShell()).toBe(false);
  });

  it('is web in a browser with no shell globals', async () => {
    vi.stubGlobal('window', {});
    const { getPlatform, isNativePlatform, isIOSApp } = await load();
    expect(getPlatform()).toBe('web');
    expect(isNativePlatform()).toBe(false);
    expect(isIOSApp()).toBe(false);
  });

  it('needs BOTH the injected description and the post channel', async () => {
    vi.stubGlobal('window', { __URGANIZE_NATIVE__: SHELL });
    const onlyInfo = await load();
    expect(onlyInfo.isNativePlatform()).toBe(false);
    vi.resetModules();

    vi.stubGlobal('window', { ReactNativeWebView: { postMessage: () => {} } });
    const onlyChannel = await load();
    expect(onlyChannel.isNativePlatform()).toBe(false);
  });

  it('reports the shell platform synchronously', async () => {
    vi.stubGlobal('window', {
      __URGANIZE_NATIVE__: { ...SHELL, platform: 'ios' },
      ReactNativeWebView: { postMessage: () => {} },
    });
    const { getPlatform, isNativePlatform, isIOSApp, isAndroidApp, shellSupports } = await load();
    expect(getPlatform()).toBe('ios');
    expect(isNativePlatform()).toBe(true);
    expect(isIOSApp()).toBe(true);
    expect(isAndroidApp()).toBe(false);
    expect(shellSupports('oauth')).toBe(true);
    expect(shellSupports('push.request')).toBe(false);
  });

  it('request() refuses a capability the shell did not advertise, without posting', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { __URGANIZE_NATIVE__: SHELL, ReactNativeWebView: { postMessage } });
    const { request, UnsupportedRequestError } = await load();
    await expect(request('push.request', {})).rejects.toBeInstanceOf(UnsupportedRequestError);
    // Only the one-time 'ready' handshake went out.
    expect(postMessage.mock.calls.map(([raw]) => decodeRequest(raw)?.type)).toEqual(['ready']);
  });

  it('request() rejects outside the shell', async () => {
    vi.stubGlobal('window', {});
    const { request, NotInShellError } = await load();
    await expect(request('openExternal', { url: 'https://x.test' })).rejects.toBeInstanceOf(NotInShellError);
  });

  // On Android the description is injected as the page STARTS loading, which
  // is not guaranteed to be before its first script. The app's webview must
  // never be mistaken for a phone browser in that gap: that is what would put
  // a "Get the app" banner inside the app itself.
  it('never calls the app webview a phone browser, even before the description arrives', async () => {
    const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
    const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
    const { buildShellUserAgentSuffix } = await import('@urganize/native-bridge');

    vi.stubGlobal('window', { navigator: { userAgent: `${ANDROID_UA} ${buildShellUserAgentSuffix('1.43.1')}` } });
    expect((await load()).isAndroidBrowser()).toBe(false);
    vi.resetModules();

    vi.stubGlobal('window', { navigator: { userAgent: `${IOS_UA} ${buildShellUserAgentSuffix('1.43.1')}` } });
    expect((await load()).isIOSBrowser()).toBe(false);
    vi.resetModules();

    // And a real phone browser is still recognised.
    vi.stubGlobal('window', { navigator: { userAgent: ANDROID_UA } });
    expect((await load()).isAndroidBrowser()).toBe(true);
  });
});

describe('whenInShell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const channel = { postMessage: () => {} };

  it('runs at once when the shell has already described itself', async () => {
    vi.stubGlobal('window', { __URGANIZE_NATIVE__: SHELL, ReactNativeWebView: channel });
    const { whenInShell } = await import('./native-bridge');
    const ran = vi.fn();
    whenInShell(ran);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('never runs in a plain browser, and sets no timer there', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const { whenInShell } = await import('./native-bridge');
    const ran = vi.fn();
    whenInShell(ran);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ran).not.toHaveBeenCalled();
  });

  it('runs once the description arrives late, and only once', async () => {
    vi.useFakeTimers();
    const win: Record<string, unknown> = { ReactNativeWebView: channel };
    vi.stubGlobal('window', win);
    const { whenInShell } = await import('./native-bridge');
    const ran = vi.fn();
    whenInShell(ran);
    await vi.advanceTimersByTimeAsync(300);
    expect(ran).not.toHaveBeenCalled();
    win.__URGANIZE_NATIVE__ = SHELL;
    await vi.advanceTimersByTimeAsync(100);
    expect(ran).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up after a few seconds rather than polling forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { ReactNativeWebView: channel });
    const { whenInShell } = await import('./native-bridge');
    const ran = vi.fn();
    whenInShell(ran);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ran).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can be cancelled before the description arrives', async () => {
    vi.useFakeTimers();
    const win: Record<string, unknown> = { ReactNativeWebView: channel };
    vi.stubGlobal('window', win);
    const { whenInShell } = await import('./native-bridge');
    const ran = vi.fn();
    const cancel = whenInShell(ran);
    cancel();
    win.__URGANIZE_NATIVE__ = SHELL;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(ran).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createShellDispatcher (the shell side)', () => {
  const PAGE = 'https://app.urganize.app/dashboard';

  function handlers(overrides: Partial<BridgeHandlers> = {}): BridgeHandlers {
    return {
      openExternal: async () => ({ ok: true }),
      oauth: async () => ({ outcome: 'cancelled' }),
      'push.permission': async () => ({ permission: 'granted' }),
      'push.request': async () => ({ permission: 'granted' }),
      'push.register': async () => ({ token: 'fcm-token' }),
      shareFile: async () => ({ outcome: 'shared' }),
      shareText: async () => ({ outcome: 'shared' }),
      appearance: async () => ({ ok: true }),
      ...overrides,
    };
  }

  /** Runs delivered scripts against a fake page window and collects what arrives. */
  function page() {
    const received: unknown[] = [];
    const win = { __urganizeBridgeReceive: (raw: unknown) => received.push(decodeInbound(raw)) };
    const deliver = (script: string) => new Function('window', script)(win);
    return { received, deliver };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('answers a request from our own page', async () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({ deliver, handlers: handlers() });
    shell.onMessage(encodeRequest('a', 'push.register', {}), PAGE);
    await flush();
    expect(received).toEqual([{ kind: 'response', id: 'a', ok: true, result: { token: 'fcm-token' } }]);
  });

  it('ignores every message from a page that is not ours', async () => {
    const register = vi.fn(async () => ({ token: 'leaked' }));
    const { received, deliver } = page();
    const shell = createShellDispatcher({ deliver, handlers: handlers({ 'push.register': register }) });
    shell.onMessage(encodeRequest('a', 'push.register', {}), 'https://evil.test/');
    shell.onMessage(encodeRequest('b', 'push.register', {}), 'http://app.urganize.app/');
    await flush();
    expect(register).not.toHaveBeenCalled();
    expect(received).toEqual([]);
  });

  it('ignores junk without calling anything', async () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({ deliver, handlers: handlers() });
    shell.onMessage('not json', PAGE);
    shell.onMessage(JSON.stringify({ v: 1, id: 'x', type: 'eval', payload: {} }), PAGE);
    await flush();
    expect(received).toEqual([]);
  });

  it('turns a handler failure into an error response', async () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({
      deliver,
      handlers: handlers({
        shareFile: async () => {
          throw new Error('No share target');
        },
      }),
    });
    shell.onMessage(encodeRequest('s', 'shareFile', {}), PAGE);
    await flush();
    expect(received).toEqual([{ kind: 'response', id: 's', ok: false, error: 'No share target' }]);
  });

  it('answers a request it has no handler for with an error, rather than throwing', async () => {
    const { received, deliver } = page();
    const incomplete = { ...handlers() } as Partial<BridgeHandlers>;
    delete incomplete.appearance;
    const shell = createShellDispatcher({ deliver, handlers: incomplete as BridgeHandlers });
    expect(() =>
      shell.onMessage(encodeRequest('x', 'appearance', { background: '#ffffff', statusBar: 'dark' }), PAGE)
    ).not.toThrow();
    await flush();
    expect(received).toEqual([
      { kind: 'response', id: 'x', ok: false, error: 'This version of the Urganize app cannot do "appearance".' },
    ]);
  });

  it('turns a handler that throws before it awaits into an error response', async () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({
      deliver,
      handlers: handlers({
        openExternal: (() => {
          throw new Error('Bad link');
        }) as unknown as BridgeHandlers['openExternal'],
      }),
    });
    expect(() => shell.onMessage(encodeRequest('o', 'openExternal', { url: 'https://x.test' }), PAGE)).not.toThrow();
    await flush();
    expect(received).toEqual([{ kind: 'response', id: 'o', ok: false, error: 'Bad link' }]);
  });

  it('holds events until the page is ready, then delivers them in order', () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({ deliver, handlers: handlers() });
    shell.emit('pushTap', { url: '/a' });
    shell.emit('pushToken', { token: 't' });
    expect(received).toEqual([]);
    shell.onMessage(encodeRequest('r', 'ready', {}), PAGE);
    expect(received).toEqual([
      { kind: 'response', id: 'r', ok: true, result: { ok: true } },
      { kind: 'event', event: 'pushTap', data: { url: '/a' } },
      { kind: 'event', event: 'pushToken', data: { token: 't' } },
    ]);
    shell.emit('pushTap', { url: '/b' });
    expect(received.at(-1)).toEqual({ kind: 'event', event: 'pushTap', data: { url: '/b' } });
  });

  it('answers a text share like any other request', async () => {
    const { received, deliver } = page();
    const shell = createShellDispatcher({
      deliver,
      handlers: handlers({ shareText: async ({ text }) => ({ outcome: text ? 'shared' : 'cancelled' }) }),
    });
    shell.onMessage(encodeRequest('t', 'shareText', { text: 'Hey!' }), PAGE);
    await flush();
    expect(received).toEqual([{ kind: 'response', id: 't', ok: true, result: { outcome: 'shared' } }]);
  });

  it('round-trips end to end with the website client', async () => {
    let shell: ReturnType<typeof createShellDispatcher> | null = null;
    const client = createBridgeClient({ post: (m) => shell?.onMessage(m, PAGE) });
    const win = { __urganizeBridgeReceive: (raw: unknown) => client.receive(raw) };
    shell = createShellDispatcher({
      deliver: (script) => new Function('window', script)(win),
      handlers: handlers({
        oauth: async ({ url }) => ({ outcome: 'success', redirectUrl: `com.urganize.app://auth/callback?from=${url}` }),
      }),
    });
    await expect(client.request('oauth', { url: 'x', redirectPrefix: 'com.urganize.app://' })).resolves.toEqual({
      outcome: 'success',
      redirectUrl: 'com.urganize.app://auth/callback?from=x',
    });
  });
});

describe('shouldRetryAfterReconnect (the shell side)', () => {
  it('retries when a failed load sees the connection come back', () => {
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: false, reachable: true })).toBe(true);
    // "Not known yet" turning into "reachable" counts as coming back too.
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: null, reachable: true })).toBe(true);
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: undefined, reachable: true })).toBe(true);
  });

  it('does not reload in a loop when the load failed while online', () => {
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: true, reachable: true })).toBe(false);
  });

  it('does nothing while offline, or when nothing failed', () => {
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: false, reachable: false })).toBe(false);
    expect(shouldRetryAfterReconnect({ loadFailed: true, previous: false, reachable: null })).toBe(false);
    expect(shouldRetryAfterReconnect({ loadFailed: false, previous: false, reachable: true })).toBe(false);
  });
});

describe('safeShareFileName (the shell side)', () => {
  it('keeps an ordinary name as it is', () => {
    expect(safeShareFileName('midnight-rollout-post.png')).toBe('midnight-rollout-post.png');
    expect(safeShareFileName('Credits (Midnight) 2026.csv')).toBe('Credits (Midnight) 2026.csv');
  });

  it('can never climb out of the cache folder', () => {
    expect(safeShareFileName('../../secrets.txt')).not.toMatch(/[\\/]/);
    expect(safeShareFileName('../../secrets.txt').startsWith('.')).toBe(false);
    expect(safeShareFileName('a\\b/c.png')).toBe('a-b-c.png');
  });

  it('strips characters a file system refuses, and control characters', () => {
    expect(safeShareFileName('what?.png')).toBe('what-.png');
    expect(safeShareFileName(`line${String.fromCharCode(10)}break.txt`)).toBe('line-break.txt');
  });

  it('falls back to a real name when nothing usable is left', () => {
    expect(safeShareFileName('')).toBe('urganize-file');
    expect(safeShareFileName('...')).toBe('urganize-file');
  });

  it('caps the length but keeps the extension', () => {
    const name = safeShareFileName(`${'a'.repeat(300)}.png`);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.endsWith('.png')).toBe(true);
  });
});

describe('page colour for the status bar', () => {
  it('reads the colour token format the site uses', () => {
    expect(cssColorToHex('13 18 14')).toBe('#0d120e');
    expect(cssColorToHex(' 245 240 230 ')).toBe('#f5f0e6');
  });

  it('reads computed colours and hex', () => {
    expect(cssColorToHex('rgb(245, 240, 230)')).toBe('#f5f0e6');
    expect(cssColorToHex('rgba(13, 18, 14, 1)')).toBe('#0d120e');
    expect(cssColorToHex('rgb(13 18 14 / 100%)')).toBe('#0d120e');
    expect(cssColorToHex('#F5F0E6')).toBe('#f5f0e6');
    expect(cssColorToHex('#fff')).toBe('#ffffff');
  });

  it('refuses a colour it cannot see through or cannot read', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorToHex('transparent')).toBeNull();
    expect(cssColorToHex('')).toBeNull();
    expect(cssColorToHex('300 18 14')).toBeNull();
    expect(cssColorToHex('var(--x)')).toBeNull();
  });

  it('picks light status bar text on the dark ground and dark text on cream', () => {
    expect(statusBarStyleFor('#0d120e')).toBe('light');
    expect(statusBarStyleFor('#f5f0e6')).toBe('dark');
  });

  it('accepts only a well-formed appearance on the shell side', () => {
    expect(parseAppearance({ background: '#f5f0e6', statusBar: 'dark' })).toEqual({
      background: '#f5f0e6',
      statusBar: 'dark',
    });
    expect(parseAppearance({ background: 'red', statusBar: 'dark' })).toBeNull();
    expect(parseAppearance({ background: '#f5f0e6', statusBar: 'blue' })).toBeNull();
    expect(parseAppearance(null)).toBeNull();
  });
});

describe('notificationPath (the shell side)', () => {
  it('follows a same-origin path', () => {
    expect(notificationPath({ url: '/dashboard?release=abc' })).toBe('/dashboard?release=abc');
  });

  it('refuses anything that could leave the app', () => {
    expect(notificationPath({ url: 'https://evil.test/' })).toBeNull();
    expect(notificationPath({ url: '//evil.test/' })).toBeNull();
    expect(notificationPath({ url: '/\\evil.test/' })).toBeNull();
    expect(notificationPath({ url: 'javascript:alert(1)' })).toBeNull();
  });

  it('is null for a notification with no link', () => {
    expect(notificationPath(undefined)).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath({ url: 42 })).toBeNull();
  });
});
