import { describe, expect, it } from 'vitest';
import {
  COLD_LOAD_BAR_ID,
  COLD_LOAD_BOOT_SCRIPT,
  COLD_LOAD_WATCHDOG_MS,
  HYDRATED_ATTRIBUTE,
} from './cold-load';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_MAX_ATTEMPTS,
  CHUNK_RELOAD_STORAGE_KEY,
  shouldReload,
} from './chunk-recovery';

// The boot script is a string that runs before React, so these tests run the
// real string against a small fake browser, the way appearance.test.ts does.

type Listener = (event: unknown) => void;

class FakeEl {
  id = '';
  style = { cssText: '' };
  children: FakeEl[] = [];
  firstChild: { nodeValue: string } | null = null;
  attrs: Record<string, string> = {};
  onclick: (() => void) | null = null;
  tagName = '';
  value = '';
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  appendChild(child: FakeEl | { nodeValue: string }) {
    if (child instanceof FakeEl) this.children.push(child);
    else if (!this.firstChild) this.firstChild = child;
    return child;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  hasAttribute(k: string) {
    return k in this.attrs;
  }
  text(): string {
    return [this.firstChild?.nodeValue ?? '', ...this.children.map((c) => c.text())].join(' ');
  }
}

type Env = {
  path?: string;
  hostname?: string;
  search?: string;
  hash?: string;
  local?: Record<string, string> | 'throws';
  session?: Record<string, string>;
  ua?: string;
  hydrated?: boolean;
  hidden?: boolean;
  noFetch?: boolean;
  noPromise?: boolean;
  native?: boolean;
};

function run(env: Env = {}) {
  const root = new FakeEl('html');
  if (env.hydrated) root.attrs[HYDRATED_ATTRIBUTE] = '1';
  const doc = Object.assign(new FakeEl('doc'), {
    documentElement: root,
    body: new FakeEl('body'),
    hidden: !!env.hidden,
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (text: string) => ({ nodeValue: text }),
    getElementById: (id: string) => root.children.find((c) => c.id === id) ?? null,
    addEventListener: () => {},
  });
  const calls = { replace: [] as string[], reload: 0 };
  const timers: { fn: () => void; ms: number }[] = [];
  const listeners: Record<string, { fn: Listener; capture: boolean }[]> = {};
  const localData = env.local && env.local !== 'throws' ? env.local : {};
  const sessionData: Record<string, string> = { ...(env.session ?? {}) };
  const localStorage =
    env.local === 'throws'
      ? new Proxy(
          {},
          {
            get() {
              throw new Error('blocked');
            },
          }
        )
      : {
          get length() {
            return Object.keys(localData).length;
          },
          key: (i: number) => Object.keys(localData)[i] ?? null,
          getItem: (k: string) => localData[k] ?? null,
        };
  const win: Record<string, unknown> = {
    location: {
      pathname: env.path ?? '/dashboard',
      hostname: env.hostname ?? 'team.urganize.app',
      search: env.search ?? '',
      hash: env.hash ?? '',
      href: `https://${env.hostname ?? 'team.urganize.app'}${env.path ?? '/dashboard'}`,
      replace: (u: string) => calls.replace.push(u),
      reload: () => {
        calls.reload += 1;
      },
    },
    navigator: { userAgent: env.ua ?? 'Mozilla/5.0' },
    localStorage,
    sessionStorage: {
      getItem: (k: string) => sessionData[k] ?? null,
      setItem: (k: string, v: string) => {
        sessionData[k] = v;
      },
    },
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
    addEventListener: (type: string, fn: Listener, capture: boolean) => {
      (listeners[type] ??= []).push({ fn, capture });
    },
    fetch: env.noFetch ? undefined : () => {},
    Promise: env.noPromise ? undefined : Promise,
    URL,
    Symbol,
    Map,
    __URGANIZE_NATIVE__: env.native ? { platform: 'ios' } : undefined,
  };
  new Function('window', 'document', COLD_LOAD_BOOT_SCRIPT)(win, doc);
  return {
    root,
    calls,
    timers,
    listeners,
    session: sessionData,
    bar: () => doc.getElementById(COLD_LOAD_BAR_ID),
    fireErrors: (event: unknown) => (listeners.error ?? []).forEach((l) => l.fn(event)),
    runTimers: () => timers.splice(0).forEach((t) => t.fn()),
  };
}

const staleChunk = { target: { tagName: 'SCRIPT', src: 'https://team.urganize.app/_next/static/chunks/abc.js' } };

describe('unsupported engines', () => {
  it('shows the update notice when fetch is missing, and nothing else runs', () => {
    const r = run({ noFetch: true, path: '/auth' });
    expect(r.bar()?.text()).toContain('too old');
    expect(r.timers).toHaveLength(0);
    expect(r.listeners.error).toBeUndefined();
  });

  it('shows the notice when Object.hasOwn is missing (iOS before 15.4)', () => {
    const original = Object.hasOwn;
    // @ts-expect-error simulating an engine without it
    delete Object.hasOwn;
    try {
      const r = run({ path: '/auth' });
      expect(r.bar()?.text()).toContain('too old');
    } finally {
      Object.hasOwn = original;
    }
  });

  it('shows the notice when Promise is missing', () => {
    const r = run({ path: '/auth', noPromise: true });
    expect(r.bar()?.text()).toContain('too old');
  });

  it('shows nothing on a modern engine', () => {
    expect(run({ path: '/auth' }).bar()).toBeNull();
  });
});

describe('signed-out visitor on a workspace route', () => {
  it('leaves for /auth when the browser holds no sign of a session', () => {
    const r = run({ path: '/dashboard', local: {} });
    expect(r.calls.replace).toEqual(['/auth']);
    expect(r.timers).toHaveLength(0);
  });

  it('covers /settings and nested dashboard pages too', () => {
    expect(run({ path: '/settings' }).calls.replace).toEqual(['/auth']);
    expect(run({ path: '/dashboard/artists' }).calls.replace).toEqual(['/auth']);
  });

  it('stays when a Supabase session is stored', () => {
    expect(run({ local: { 'sb-abcd-auth-token': '{}' } }).calls.replace).toEqual([]);
  });

  it('stays when the auth store says signed in', () => {
    const state = JSON.stringify({ state: { isAuthenticated: true } });
    expect(run({ local: { 'urganize-auth': state } }).calls.replace).toEqual([]);
  });

  it('leaves when the auth store says signed out and no session exists', () => {
    const state = JSON.stringify({ state: { isAuthenticated: false } });
    expect(run({ local: { 'urganize-auth': state } }).calls.replace).toEqual(['/auth']);
  });

  it('lets the app decide when storage is corrupt or blocked', () => {
    expect(run({ local: { 'urganize-auth': '{nope' } }).calls.replace).toEqual([]);
    expect(run({ local: 'throws' }).calls.replace).toEqual([]);
  });

  it('never leaves on the old hosts, in the phone app, or mid sign-in link', () => {
    expect(run({ hostname: 'app.urganize.app' }).calls.replace).toEqual([]);
    expect(run({ native: true }).calls.replace).toEqual([]);
    expect(run({ ua: 'Mozilla UrganizeApp/1.2' }).calls.replace).toEqual([]);
    expect(run({ hash: '#access_token=abc' }).calls.replace).toEqual([]);
    expect(run({ search: '?code=abc' }).calls.replace).toEqual([]);
  });

  it('does not touch public and front-door routes', () => {
    for (const path of ['/auth', '/onboarding', '/music', '/epk/x', '/invite/abc']) {
      expect(run({ path }).calls.replace).toEqual([]);
    }
  });
});

describe('hydration watchdog', () => {
  it('arms a 10 second timer on the front doors and the dashboard skeleton', () => {
    for (const path of ['/auth', '/onboarding', '/invite/abc', '/join/abc', '/curator/join/abc']) {
      const r = run({ path });
      expect(r.timers.map((t) => t.ms)).toEqual([COLD_LOAD_WATCHDOG_MS]);
    }
    const r = run({ path: '/dashboard', local: { 'sb-x-auth-token': '1' } });
    expect(r.timers.map((t) => t.ms)).toEqual([COLD_LOAD_WATCHDOG_MS]);
  });

  it('stays off public pages and the sign-in machine steps', () => {
    for (const path of ['/music', '/epk/x', '/auth/callback', '/auth/handoff', '/pitch/x']) {
      expect(run({ path }).timers).toHaveLength(0);
    }
  });

  it('shows the Retry bar when the page never hydrated', () => {
    const r = run({ path: '/auth' });
    r.runTimers();
    const bar = r.bar();
    expect(bar?.text()).toContain('taking long');
    expect(bar?.text()).toContain('Retry');
    expect(bar?.text()).toContain('Copy link');
  });

  it('shows nothing once the page has hydrated', () => {
    const r = run({ path: '/auth' });
    r.root.attrs[HYDRATED_ATTRIBUTE] = '1';
    r.runTimers();
    expect(r.bar()).toBeNull();
  });

  it('waits while the tab is in the background', () => {
    const r = run({ path: '/auth', hidden: true });
    r.runTimers();
    expect(r.bar()).toBeNull();
    expect(r.timers.map((t) => t.ms)).toEqual([5000]);
  });
});

describe('a first load that names missing chunks', () => {
  it('reloads once, however many chunks fail at the same time', () => {
    const r = run({ path: '/music' });
    r.fireErrors(staleChunk);
    r.fireErrors(staleChunk);
    r.fireErrors(staleChunk);
    r.runTimers();
    expect(r.calls.reload).toBe(1);
    // The extra failures of the same page must not read as a spent budget.
    expect(r.bar()).toBeNull();
    expect(JSON.parse(r.session[CHUNK_RELOAD_STORAGE_KEY]).attempts).toBe(1);
  });

  it('treats an HTML 404 parsed as a script the same way', () => {
    const r = run({ path: '/music' });
    r.fireErrors({
      message: "Unexpected token '<'",
      filename: 'https://team.urganize.app/_next/static/chunks/abc.js',
    });
    r.runTimers();
    expect(r.calls.reload).toBe(1);
  });

  it('ignores scripts and errors that are not the app bundle', () => {
    const r = run({ path: '/music' });
    r.fireErrors({ target: { tagName: 'SCRIPT', src: 'https://cdn.example.com/widget.js' } });
    r.fireErrors({ target: { tagName: 'IMG', src: 'https://team.urganize.app/_next/static/x.png' } });
    r.fireErrors({ message: 'boom', filename: 'https://team.urganize.app/_next/static/a.js' });
    r.runTimers();
    expect(r.calls.reload).toBe(0);
    expect(r.bar()).toBeNull();
  });

  it('leaves a failure after hydration to ChunkRecoveryBridge', () => {
    const r = run({ path: '/music', hydrated: true });
    r.fireErrors(staleChunk);
    r.runTimers();
    expect(r.calls.reload).toBe(0);
  });

  it('listens in the capture phase, since resource errors do not bubble', () => {
    expect(run({ path: '/music' }).listeners.error?.[0].capture).toBe(true);
  });

  it('follows the same budget as lib/chunk-recovery for every state', () => {
    const now = new Date().getTime();
    const ages = [1_000, CHUNK_RELOAD_COOLDOWN_MS - 1_000, CHUNK_RELOAD_COOLDOWN_MS + 1_000, 10 * CHUNK_RELOAD_COOLDOWN_MS];
    for (let attempts = 0; attempts <= CHUNK_RELOAD_MAX_ATTEMPTS + 1; attempts++) {
      for (const age of [null, ...ages]) {
        const record = age === null ? { at: 0, attempts } : { at: now - age, attempts };
        const r = run({
          path: '/music',
          session: { [CHUNK_RELOAD_STORAGE_KEY]: JSON.stringify(record) },
        });
        r.fireErrors(staleChunk);
        r.runTimers();
        const allowed = shouldReload(record, now);
        expect(r.calls.reload, JSON.stringify({ attempts, age })).toBe(allowed ? 1 : 0);
        expect(!!r.bar(), JSON.stringify({ attempts, age })).toBe(!allowed);
      }
    }
  });

  it('never reloads more than twice in a session, whatever happens', () => {
    const session: Record<string, string> = {};
    let reloads = 0;
    for (let load = 0; load < 6; load++) {
      const r = run({ path: '/music', session });
      r.fireErrors(staleChunk);
      r.runTimers();
      Object.assign(session, r.session);
      reloads += r.calls.reload;
      // Pretend each reload took longer than the cooldown.
      const rec = JSON.parse(session[CHUNK_RELOAD_STORAGE_KEY]);
      session[CHUNK_RELOAD_STORAGE_KEY] = JSON.stringify({ ...rec, at: rec.at - 2 * CHUNK_RELOAD_COOLDOWN_MS });
    }
    expect(reloads).toBe(CHUNK_RELOAD_MAX_ATTEMPTS);
  });
});
