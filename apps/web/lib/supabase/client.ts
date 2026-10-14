import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local and restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
