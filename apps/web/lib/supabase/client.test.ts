import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The browser client (lib/supabase/client.ts) builds its own AuthClient and
// PostgrestClient instead of calling createClient(), to keep the rest of
// supabase-js out of the shared bundle (URG-314). These tests pin the parts
// that would silently break things if they drifted from what createClient()
// does: the storage key (a different key signs every user out), the auth
// options, and the package versions.

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const require = createRequire(import.meta.url);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijkl.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('authClientOptions', () => {
  it('matches what supabase-js createClient() gives its auth client', async () => {
    const { authClientOptions } = await import('./client');
    const opts = authClientOptions('https://abcdefghijkl.supabase.co', 'anon-key');
    expect(opts.url).toBe('https://abcdefghijkl.supabase.co/auth/v1');
    expect(opts.storageKey).toBe('sb-abcdefghijkl-auth-token');
    expect(opts.headers.apikey).toBe('anon-key');
    expect(opts.headers.Authorization).toBe('Bearer anon-key');
    expect(opts).toMatchObject({
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    });
  });

  it('handles a trailing slash on the project url', async () => {
    const { authClientOptions } = await import('./client');
    const opts = authClientOptions('https://abcdefghijkl.supabase.co/', 'k');
    expect(opts.url).toBe('https://abcdefghijkl.supabase.co/auth/v1');
    expect(opts.storageKey).toBe('sb-abcdefghijkl-auth-token');
  });

  it('uses the same storage key as a real createClient()', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const real = createClient('https://abcdefghijkl.supabase.co', 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as { storageKey: string; authUrl: URL };
    const { authClientOptions } = await import('./client');
    const opts = authClientOptions('https://abcdefghijkl.supabase.co', 'anon-key');
    expect(opts.storageKey).toBe(real.storageKey);
    expect(opts.url).toBe(real.authUrl.href);
  });
});

describe('supabase browser client', () => {
  it('exposes auth and from, and from() builds a PostgREST query', async () => {
    const { supabase } = await import('./client');
    expect(typeof supabase.auth.getSession).toBe('function');
    const builder = supabase.from('profiles').select('*').eq('id', 'u1');
    expect(String((builder as unknown as { url: URL }).url)).toBe(
      'https://abcdefghijkl.supabase.co/rest/v1/profiles?select=*&id=eq.u1'
    );
  });

  it('sends the session token, or skips the session read when the query brings its own', async () => {
    const { supabase } = await import('./client');
    const seen: Array<{ url: string; auth: string | null; apikey: string | null }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: String(input), auth: headers.get('Authorization'), apikey: headers.get('apikey') });
      return new Response(JSON.stringify({ id: 'u1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const getSession = vi.spyOn(supabase.auth, 'getSession');
    try {
      // Signed out: falls back to the anon key, via one session read.
      await supabase.from('profiles').select('*').eq('id', 'u1').single();
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(seen[0]).toMatchObject({ auth: 'Bearer anon-key', apikey: 'anon-key' });

      // Own token: used as is, and no session read (no auth lock).
      const query = supabase.from('profiles').select('*').eq('id', 'u1');
      query.setHeader('Authorization', 'Bearer user-token');
      const result = await query.single();
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(seen[1]).toMatchObject({ auth: 'Bearer user-token', apikey: 'anon-key' });
      expect(result.data).toEqual({ id: 'u1' });
    } finally {
      getSession.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('never value-imports @supabase/supabase-js statically', () => {
    const src = readFileSync(here('./client.ts'), 'utf8');
    const staticValueImports = src
      .split('\n')
      .filter((l) => /^import\s+(?!type\b)/.test(l) && l.includes("'@supabase/supabase-js'"));
    expect(staticValueImports).toEqual([]);
  });

  it('pins auth-js and postgrest-js to the installed supabase-js version', () => {
    const pkg = JSON.parse(readFileSync(here('../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const installed = (require('@supabase/supabase-js/package.json') as { version: string }).version;
    expect(pkg.dependencies['@supabase/auth-js']).toBe(installed);
    expect(pkg.dependencies['@supabase/postgrest-js']).toBe(installed);
    const src = readFileSync(here('./client.ts'), 'utf8');
    expect(src).toContain(`const SUPABASE_JS_VERSION = '${installed}';`);
  });
});
