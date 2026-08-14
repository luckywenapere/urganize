import { createClient } from '@supabase/supabase-js';
import {
  looksLikeCuratorInviteCode,
  resolveCuratorInviteState,
  type CuratorInviteRow,
} from '@/lib/curator-invites';
import type { CuratorInviteState } from '@/types/pitching';

// Server-side resolution of an invite link's standing, so /curator/join/<code>
// can render its REAL content in the server HTML instead of a loading skeleton.
//
// Why this exists (2026-08-14): the join page used to resolve the invite from a
// client useEffect, which meant nothing at all rendered until ~1MB of JS across
// 18 chunks had downloaded AND hydrated AND a further round trip completed. A
// real invited curator on weak Nigerian mobile data sat on "Loading" forever
// with no error and nothing to tap — the same dead end "The front door is
// server-rendered" fixed for /auth and /onboarding, which never covered this
// page because pitching was flag-off at the time.
//
// Shaped after lib/epk-server.ts:loadPublicEpk: it NEVER throws, and every
// failure (flag off, malformed code, missing row, unapplied migration, network
// blip) collapses to a single 'unavailable' answer. The page is public, so it
// must not leak whether a code merely never existed, and it must not 500.

export type CuratorInviteLookup =
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; state: CuratorInviteState };

const INVITE_COLUMNS = 'id,code,expires_at,revoked_at,used_at';

/** The copy a stranger sees when the link cannot be resolved at all. */
const NOT_FOUND_MESSAGE = 'We could not find this link.';

export async function loadCuratorInviteState(code: string): Promise<CuratorInviteLookup> {
  if (process.env.NEXT_PUBLIC_FEATURE_PITCHING !== 'true') {
    return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
  }
  if (!code || !looksLikeCuratorInviteCode(code)) {
    return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await adminClient
      .from('curator_invites')
      .select(INVITE_COLUMNS)
      .eq('code', code)
      .maybeSingle();

    if (error) {
      // The database's own wording never goes out on a public page; it lands in
      // the server log instead (an unapplied migration surfaces here first).
      console.error('[curator-join] server invite lookup failed:', error.message);
      return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
    }
    if (!data) {
      return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
    }

    return { kind: 'ready', state: resolveCuratorInviteState(data as CuratorInviteRow) };
  } catch (lookupError) {
    console.error(
      '[curator-join] server invite lookup threw:',
      lookupError instanceof Error ? lookupError.message : lookupError
    );
    return { kind: 'unavailable', message: NOT_FOUND_MESSAGE };
  }
}
