import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_INVITES_TABLE,
  CURATOR_PROFILES_TABLE,
  createAdminClient,
  flagOffResponse,
  getAuthenticatedUser,
  isPitchingFeatureEnabled,
} from '../../_shared';
import {
  canResumeCuratorInviteClaim,
  looksLikeCuratorInviteCode,
  resolveCuratorInviteState,
} from '@/lib/curator-invites';
import { MAX_CURATOR_DISPLAY_NAME_LENGTH } from '@/lib/pitching';

// Turning an invite link into a curator account.
//
// GET is public and says only how the link stands. POST does the work and is
// where the two rules that matter live:
//
//   1. SINGLE USE. The invite is consumed by a conditional update
//      (where used_at is null and revoked_at is null), so two people opening
//      the same link at the same time cannot both become curators. The row is
//      the lock; there is no read-then-write window.
//
//   2. A TEAM ACCOUNT IS NOT CONVERTED, IT GAINS A SIDE. Being a curator is the
//      existence of a curator_profiles row, so an account that already runs
//      releases keeps its team role untouched and simply becomes dual: inbox at
//      /curator, workspace still at /dashboard. Only an account with no team
//      footprint at all is written as role='curator', which means "curator-only,
//      team side never activated" and is undone by POST /api/curator/activate-team.
//      Flipping a footprinted account to 'curator' would strand its releases
//      behind a role that cannot see them, so that write is what we skip.

const INVITE_COLUMNS = 'id,code,expires_at,revoked_at,used_at';

// The POST needs one more column than the public GET: whether THIS user is the
// one who already consumed the link (see the resume branch below). Deliberately
// a separate constant rather than widening INVITE_COLUMNS — the GET is
// unauthenticated, and used_by is somebody's user id.
const JOIN_INVITE_COLUMNS = `${INVITE_COLUMNS},used_by`;

/** How the link stands. Nothing else leaks, so this is safe to call unauthenticated. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const { code } = await context.params;
  if (!code || !looksLikeCuratorInviteCode(code)) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: invite, error } = await adminClient
    .from(CURATOR_INVITES_TABLE)
    .select(INVITE_COLUMNS)
    .eq('code', code)
    .maybeSingle();

  if (error) {
    // This endpoint is public and its message is rendered to an invited
    // stranger, so the database's own wording never goes out — it lands in the
    // server log instead. (An unapplied migration surfaces here first.)
    console.error('[curator-join] invite lookup failed:', error.message);
    return NextResponse.json({ error: 'Could not check this link right now.' }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  return NextResponse.json({ status: resolveCuratorInviteState(invite) });
}

/** Consumes the invite for the signed-in account and makes it a curator. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { code } = await context.params;
  if (!code || !looksLikeCuratorInviteCode(code)) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const userId = auth.user.id;

  // Already a curator? Then this is a resumed flow (a reload, or an OAuth
  // round trip that landed twice). Report success and let the client move on.
  const { data: existingProfile } = await adminClient
    .from(CURATOR_PROFILES_TABLE)
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingProfile?.user_id) {
    return NextResponse.json({ ok: true, alreadyCurator: true });
  }

  // Does this account already run releases? That decides whether the profiles
  // row gets role='curator' below, not whether the join is allowed. Read before
  // the invite is consumed so a failed check does not burn the link.
  const teamCheck = await hasTeamFootprint(adminClient, userId);
  if ('error' in teamCheck) return teamCheck.error;

  const { data: invite, error: inviteError } = await adminClient
    .from(CURATOR_INVITES_TABLE)
    .select(JOIN_INVITE_COLUMNS)
    .eq('code', code)
    .maybeSingle();

  if (inviteError) {
    console.error('[curator-join] invite lookup failed:', inviteError.message);
    return NextResponse.json({ error: 'Could not check this link right now.' }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  const state = resolveCuratorInviteState(invite);

  // Resume: this user already consumed this link, but setup did not finish, so
  // they have no curator_profiles row (the early return above would have caught
  // them otherwise). Without this branch they are stranded permanently — the
  // link reads as 'used', a fresh one cannot be self-served, and if the profiles
  // write below already landed then role='curator' also keeps them out of the
  // team side. Letting the ORIGINAL claimant finish opens no race: a different
  // user still gets the 409, and the consume step is skipped rather than redone.
  //
  // The predicate is pure and unit tested in lib/curator-invites.ts, including
  // the revoked-but-reports-used case.
  const isResumingOwnClaim = canResumeCuratorInviteClaim({
    state,
    revokedAt: invite.revoked_at,
    usedBy: invite.used_by,
    userId,
  });

  if (state !== 'active' && !isResumingOwnClaim) {
    return NextResponse.json({ error: inviteStateMessage(state), status: state }, { status: 409 });
  }

  if (!isResumingOwnClaim) {
    // Consume it. The where-clause is the lock: a second request racing this one
    // updates zero rows and is told the link is used.
    const { data: consumed, error: consumeError } = await adminClient
      .from(CURATOR_INVITES_TABLE)
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();

    if (consumeError) {
      console.error('[curator-join] invite consume failed:', consumeError.message);
      return NextResponse.json({ error: 'Could not use this link right now.' }, { status: 500 });
    }
    if (!consumed?.id) {
      return NextResponse.json(
        { error: inviteStateMessage('used'), status: 'used' },
        { status: 409 }
      );
    }
  }

  const displayName = resolveDisplayName(payload.displayName, auth.user);

  // An account that already runs releases keeps its team role: it is becoming a
  // dual account, and it necessarily already has a profiles row. Only a fresh
  // account is marked curator-only, and that write is unconditional (NOT
  // ignoreDuplicates) because the OAuth callback may have just created a
  // fallback row with role 'artist-manager', which has to become 'curator' or
  // the account lands on the team dashboard instead of the curator surface.
  if (!teamCheck.hasFootprint) {
    const { error: profileError } = await adminClient.from('profiles').upsert(
      {
        id: userId,
        name: displayName,
        role: 'curator',
        ...(auth.user.email ? { email: auth.user.email } : {}),
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      // The invite is already consumed at this point, and it stays that way:
      // releasing it would let a second person claim the link. The resume branch
      // above is what makes this recoverable instead of terminal — this user can
      // retry the same link and pick up exactly here.
      console.error('[curator-join] profile upsert failed after consuming invite:', profileError.message);
      return NextResponse.json(
        { error: 'Could not finish setting up your account. Try again.' },
        { status: 500 }
      );
    }
  }

  // Upsert, not insert: a resumed claim (or two requests racing through the
  // resume branch) must not 500 on the primary key. ignoreDuplicates leaves an
  // existing row alone, so a curator who has since edited their display name
  // does not get it reset to the invite-time default by a retry.
  const { error: curatorProfileError } = await adminClient
    .from(CURATOR_PROFILES_TABLE)
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        invite_id: invite.id,
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  if (curatorProfileError) {
    // The invite stays consumed by THIS user, which is what makes the resume
    // branch above able to recover them on a retry.
    console.error('[curator-join] curator profile upsert failed:', curatorProfileError.message);
    return NextResponse.json(
      { error: 'Could not finish setting up your account. Try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

function inviteStateMessage(state: string): string {
  if (state === 'used') return 'This link has already been used. Ask for a new one.';
  if (state === 'revoked') return 'This link was turned off. Ask for a new one.';
  if (state === 'expired') return 'This link has expired. Ask for a new one.';
  return 'This link no longer works. Ask for a new one.';
}

function resolveDisplayName(value: unknown, user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const fromPayload = typeof value === 'string' ? value.trim() : '';
  if (fromPayload) return fromPayload.slice(0, MAX_CURATOR_DISPLAY_NAME_LENGTH);
  const fromMetadata = user.user_metadata?.full_name;
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata.trim().slice(0, MAX_CURATOR_DISPLAY_NAME_LENGTH);
  }
  const handle = String(user.email || '').split('@')[0];
  return (handle || 'Playlist owner').slice(0, MAX_CURATOR_DISPLAY_NAME_LENGTH);
}

/**
 * Does this account already look like a team account? Either check is enough:
 * owning a release, or holding a workspace membership that was not removed.
 *
 * A footprint means the account is in use on the team side, so its role is left
 * alone. Its absence is the "unused account" signal that makes role='curator'
 * safe to write: an organic signup has a lazily provisioned workspace after its
 * first dashboard load, and an invited teammate always has a members row.
 */
async function hasTeamFootprint(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<{ error: NextResponse } | { hasFootprint: boolean }> {
  const { count: releaseCount, error: releaseError } = await adminClient
    .from('releases')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId);

  if (releaseError) {
    return {
      error: NextResponse.json(
        { error: releaseError.message || 'Could not check your account.' },
        { status: 500 }
      ),
    };
  }
  if ((releaseCount || 0) > 0) return { hasFootprint: true };

  const { count: memberCount, error: memberError } = await adminClient
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('status', 'removed');

  if (memberError) {
    return {
      error: NextResponse.json(
        { error: memberError.message || 'Could not check your account.' },
        { status: 500 }
      ),
    };
  }

  return { hasFootprint: (memberCount || 0) > 0 };
}
