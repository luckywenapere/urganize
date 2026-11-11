// Browser Supabase client, slimmed for first load (URG-314, v1.147.8).
//
// Every page used to ship the whole of @supabase/supabase-js (~170 KB
// minified): auth, PostgREST, Realtime, Storage and Functions. In the browser
// the app talks to Supabase through auth (session, sign-in, sign-out) and a
// handful of PostgREST calls on the user's own profile; everything else goes
// through our own /api routes. So the shared bundle now holds the auth client
// plus a bare PostgREST client (`supabase.from`), and Realtime (only the
// notifications bell uses it) loads on demand via getSupabaseRealtime().
// Storage and Functions are never used from the browser.
//
// The auth client is configured exactly as createClient() configured it
// (same storage key, flow type, headers), so existing signed-in sessions in
// localStorage keep working. Keep it that way: changing storageKey signs
// everybody out. lib/supabase/client.test.ts pins the options.
//
// Import AuthClient and PostgrestClient from their own packages, never from
// @supabase/supabase-js: a static value import of supabase-js anywhere on the
// shared chain pulls the whole client back into every page.
import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local and restart the dev server.'
  );
}

// Must match the installed @supabase/supabase-js. @supabase/auth-js and
// @supabase/postgrest-js are pinned to the same version in package.json.
const SUPABASE_JS_VERSION = '2.101.0';

/** The options supabase-js createClient() would hand its auth client. */
export function authClientOptions(url: string, anonKey: string) {
  const base = new URL(url.trim().endsWith('/') ? url.trim() : `${url.trim()}/`);
  const jsEnv = typeof document !== 'undefined' ? 'web' : 'node';
  return {
    url: new URL('auth/v1', base).href,
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'X-Client-Info': `supabase-js-${jsEnv}/${SUPABASE_JS_VERSION}`,
    },
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit' as const,
    hasCustomAuthorizationHeader: false,
  };
}

type BrowserAuthClient = InstanceType<typeof AuthClient>;

const authOptions = authClientOptions(supabaseUrl, supabaseAnonKey);
const auth: BrowserAuthClient = new AuthClient(authOptions);

/**
 * fetch that sends the signed-in user's access token (anon key when signed
 * out), the same as supabase-js's fetchWithAuth, so RLS sees the same user.
 */
// A query that already carries an Authorization header (.setHeader) skips the
// getSession() call, so it does not queue on auth-js's session lock; the auth
// store uses that to read the profile while getUser() is still in flight.
async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('apikey')) headers.set('apikey', supabaseAnonKey as string);
  if (!headers.has('Authorization')) {
    const { data } = await auth.getSession();
    headers.set('Authorization', `Bearer ${data.session?.access_token ?? supabaseAnonKey}`);
  }
  return fetch(input, { ...init, headers });
}

const rest = new PostgrestClient(
  new URL('rest/v1', `${supabaseUrl.trim().replace(/\/+$/, '')}/`).href,
  {
    headers: { 'X-Client-Info': authOptions.headers['X-Client-Info'] },
    schema: 'public',
    fetch: fetchWithAuth,
  }
);

/**
 * The browser Supabase client: `auth` and `from` behave exactly as they did
 * on the full supabase-js client. For Realtime channels call
 * `getSupabaseRealtime()`.
 */
export const supabase = {
  auth,
  from: ((relation: string) => rest.from(relation)) as PostgrestClient['from'],
};

let realtimeClient: Promise<SupabaseClient> | null = null;

/**
 * Full supabase-js client, for Realtime channels. Loaded on first use (its
 * own chunk, never on first paint). It carries the signed-in user's access
 * token from `supabase.auth`, so RLS sees the same user, and it never
 * touches the session itself (no second auth client, no storage writes).
 */
export function getSupabaseRealtime(): Promise<SupabaseClient> {
  if (!realtimeClient) {
    const url = supabaseUrl as string;
    const key = supabaseAnonKey as string;
    realtimeClient = import('@supabase/supabase-js')
      .then(({ createClient }) => {
        const client = createClient(url, key, {
          accessToken: async () => {
            const { data } = await auth.getSession();
            return data.session?.access_token ?? null;
          },
        });
        // createClient with accessToken does not watch auth events, so pass
        // refreshed tokens and sign-outs on to Realtime ourselves, the same
        // way supabase-js does for its own auth client.
        let lastToken: string | undefined;
        auth.onAuthStateChange((event, session) => {
          const token = session?.access_token;
          if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && token && token !== lastToken) {
            lastToken = token;
            void client.realtime.setAuth(token);
          } else if (event === 'SIGNED_OUT') {
            lastToken = undefined;
            void client.realtime.setAuth();
          }
        });
        return client;
      })
      .catch((error) => {
        realtimeClient = null;
        throw error;
      });
  }
  return realtimeClient;
}

// Profile type used by analytics and auth contexts.
export type Profile = {
  id: string;
  name: string;
  email: string;
  country?: string | null;
  locale?: string | null;
  timezone?: string | null;
  // 'curator' is the playlist-pitching account type: invited, teamless, and
  // never able to see a release. It routes to /curator instead of /dashboard
  // (see resolveHomePath in lib/home-path.ts).
  role: 'artist' | 'manager' | 'artist-team' | 'artist-manager' | 'team-member' | 'viewer' | 'curator';
  artist_name?: string | null;
  onboarding_completed?: boolean;
  onboarding_step?: number;
  onboarding_completed_at?: string | null;
  onboarding_role?: 'artist' | 'manager' | 'label' | 'other' | null;
  onboarding_persona?:
    | 'independent_artist'
    | 'music_manager'
    | 'label_ar'
    | 'producer_beatmaker'
    | 'other'
    | null;
  onboarding_release_process?:
    | 'spreadsheets_or_notes'
    | 'group_chats_and_dms'
    | 'nothing_structured_yet'
    | 'another_tool'
    | null;
  onboarding_biggest_headache?:
    | 'keeping_team_aligned'
    | 'tracking_whats_done_and_whats_next'
    | 'collecting_credits_and_metadata'
    | 'managing_multiple_releases_at_once'
    | null;
  onboarding_release_id?: string | null;
  onboarding_task_id?: string | null;
  /** "Ask me after tasks" — gates the post-completion outcome sheet.
   * Default true; undefined (pre-migration rows) counts as on. */
  ask_after_tasks?: boolean;
  /** "Send me motivational nudges" — gates the weekly motivational push
   * (lib/motivation-server.ts). Default true; undefined (pre-migration
   * rows) counts as on. */
  motivational_nudges?: boolean;
  /** The morning brief's off switch (#1207). Undefined counts as on. */
  morning_brief?: boolean;
  /** The Settings view override (URG-260, lib/role-views.ts). Null or missing
   * (rows before the column existed) = automatic, from the persona and role. */
  role_view?: 'artist_manager' | 'label' | 'solo_artist' | 'artist_team' | 'other' | null;
  created_at: string;
  updated_at: string;
  is_subscribed?: boolean; 
};

// Helper function to handle Supabase errors
export function handleSupabaseError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  if (message) {
    // User-friendly error messages
    if (message.includes('duplicate key')) {
      return 'This email is already registered';
    }
    if (message.includes('Invalid login credentials')) {
      return 'Invalid email or password';
    }
    if (message.includes('Email not confirmed')) {
      return 'Please verify your email before logging in';
    }
    return message;
  }
  return 'An unexpected error occurred';
}
