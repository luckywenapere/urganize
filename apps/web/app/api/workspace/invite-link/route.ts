import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInviteUrl,
  buildJoinUrl,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import {
  INVITE_LINK_TTL_DAYS,
  generateInviteLinkCode,
  mintInviteLinkToken,
} from '@/lib/invite-link';
import {
  MAX_ACTIVE_TEAM_LOGINS,
  TEAM_LOGINS_ENABLED,
  normalizeLoginLabel,
  resolveLoginState,
} from '@/lib/team-logins';
import { checkSeatAllowance, recordLimitHit } from '@/lib/seats-server';
import {
  INVITE_LINKS_TABLE,
  INVITE_LINK_COLUMNS,
  isMissingTeamLoginColumn,
  loadReleaseTitles,
  requireLinkManager,
  toTeamLogin,
  type InviteLinkRow,
} from './_shared';

/**
 * GET — list this workspace's sign-in links, newest first (the "team logins"
 * surface, founder request 2026-08-16).
 *
 * FLAG-GATED, unlike the POST below. The mint endpoint has been live since
 * 2026-07-23 and Settings → Teammates calls it today; 404-ing it behind a new
 * flag would break a shipped feature. Listing and revoking are the new
 * surfaces, so they are what the flag covers.
 */
export async function GET(request: NextRequest) {
  if (!TEAM_LOGINS_ENABLED) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  try {
    const access = await requireLinkManager(adminClient, auth.user);
    if ('error' in access) return access.error;

    const result = await adminClient
      .from(INVITE_LINKS_TABLE)
      .select(INVITE_LINK_COLUMNS)
      .eq('workspace_id', access.workspaceId)
      .order('created_at', { ascending: false })
      .limit(MAX_ACTIVE_TEAM_LOGINS * 2);

    if (result.error) {
      // Table or columns not migrated yet — an empty list is the honest
      // answer, and it keeps the section renderable instead of erroring.
      console.warn('[invite-link] list failed:', result.error.message);
      return NextResponse.json({ logins: [], degraded: true });
    }

    const rows = (result.data || []) as InviteLinkRow[];
    const releaseTitles = await loadReleaseTitles(adminClient, rows);

    return NextResponse.json({
      logins: rows.map((row) => toTeamLogin(row, releaseTitles)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load team logins.' },
      { status: 500 }
    );
  }
}

/**
 * POST — mint a shareable workspace invite LINK (founder request,
 * 2026-07-23): the Linear-style "anyone with this link joins" flow for when
 * the manager doesn't have the person's email. Owner/admin only. The link
 * points at the same /invite/accept page as email invites; whoever opens it
 * signs in (or up) and joins the workspace as a member. Stateless HMAC
 * token, valid for INVITE_LINK_TTL_DAYS — see lib/invite-link.ts.
 *
 * NOT flag-gated — see the GET above. `label` and `releaseId` (2026-08-16)
 * are additive and optional, so the pre-existing caller in Settings →
 * Teammates keeps working unchanged.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  try {
    const access = await requireLinkManager(adminClient, auth.user);
    if ('error' in access) return access.error;
    const { workspaceId } = access;

    const body = (await request.json().catch(() => ({}))) as {
      artistId?: unknown;
      label?: unknown;
      releaseId?: unknown;
    };

    // Optional ARTIST scope (founder decision, 2026-07-23): an artist link
    // admits the joiner with visibility limited to that artist's releases.
    const artistScopeId = String(body?.artistId || '').trim().slice(0, 100) || null;
    const label = normalizeLoginLabel(body?.label);
    const releaseId = String(body?.releaseId || '').trim().slice(0, 100) || null;

    // Runaway guard, not a product limit — "unlimited" is the promise, and
    // revoking frees a slot immediately. Counted rather than enforced by a
    // constraint so the message can say what to do about it.
    const liveCount = await countActiveLinks(adminClient, workspaceId);
    if (liveCount !== null && liveCount >= MAX_ACTIVE_TEAM_LOGINS) {
      return NextResponse.json(
        {
          error: `You have ${MAX_ACTIVE_TEAM_LOGINS} live logins. Revoke one you're no longer using to create another.`,
        },
        { status: 409 }
      );
    }

    // SEAT CEILING, added 2026-09-01. Redemption has always been the real
    // enforcement point (`joinWorkspaceViaLink` — one link, many redeemers, so
    // that is the only place a total can be held), and it stays. This is the
    // second half, and it exists so the refusal reaches the RIGHT PERSON.
    //
    // Without it, a team at its ceiling mints a link that is guaranteed to fail,
    // and the failure surfaces to whoever clicks it — someone who cannot fix it,
    // and who has to go back and tell the manager. The manager, meanwhile, saw a
    // successful copy-to-clipboard. Checking here means the person who can
    // upgrade reads the message at the moment they act.
    //
    // Placed AFTER the runaway guard, so "revoke a link you're not using" (which
    // they can act on immediately, alone) is offered before "upgrade your plan".
    // Fails open on an unreadable count or tier, like every other cap.
    const seats = await checkSeatAllowance(adminClient, workspaceId);
    if (!seats.allowed) {
      await recordLimitHit(adminClient, {
        workspaceId,
        actorUserId: auth.user.id,
        key: seats.key,
        limit: seats.limit,
        current: seats.current,
      });
      return NextResponse.json({ error: seats.message, limitKey: seats.key, upgradeTo: seats.upgradeTo }, { status: 409 });
    }

    // A release id is only provenance, but it is a foreign key — so confirm
    // it belongs to this workspace's owner before writing it. A bad id would
    // otherwise fail the whole insert at the Postgres boundary and cost the
    // user their link.
    const verifiedReleaseId = releaseId
      ? await verifyReleaseOwnership(adminClient, releaseId, auth.user.id)
      : null;

    // Preferred form: a SHORT /join/<code> link backed by
    // workspace_invite_links (presentable, Linear-style, revocable later).
    // If the table isn't migrated yet, fall back to the stateless wl.*
    // token so the feature never hard-fails.
    const code = generateInviteLinkCode();
    const expiresAtIso = new Date(
      Date.now() + INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const basePayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      code,
      role: 'member',
      artist_scope_id: artistScopeId,
      created_by: auth.user.id,
      expires_at: expiresAtIso,
    };

    let insertResult = await adminClient.from(INVITE_LINKS_TABLE).insert({
      ...basePayload,
      label,
      release_id: verifiedReleaseId,
    });

    // Retry without the 2026-08-16 columns if this environment predates that
    // migration: the link itself is what matters, the label is decoration.
    if (insertResult.error && isMissingTeamLoginColumn(insertResult.error)) {
      insertResult = await adminClient.from(INVITE_LINKS_TABLE).insert(basePayload);
    }

    if (!insertResult.error) {
      return NextResponse.json({
        ok: true,
        inviteUrl: buildJoinUrl(code),
        expiresAt: expiresAtIso,
        ttlDays: INVITE_LINK_TTL_DAYS,
        artistScopeId,
        label,
      });
    }

    console.warn(
      '[invite-link] short-code insert failed (table not migrated yet?):',
      insertResult.error.message
    );
    const { token, expiresAt } = mintInviteLinkToken(workspaceId, artistScopeId);
    return NextResponse.json({
      ok: true,
      inviteUrl: buildInviteUrl(token),
      expiresAt,
      ttlDays: INVITE_LINK_TTL_DAYS,
      artistScopeId,
      label,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create invite link.' },
      { status: 500 }
    );
  }
}

/** Live (neither revoked nor expired) link count. Null when the table can't
 * be read, which the caller treats as "don't block" — a runaway guard must
 * never be the reason a first link can't be minted. */
async function countActiveLinks(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<number | null> {
  try {
    const result = await adminClient
      .from(INVITE_LINKS_TABLE)
      .select('id,expires_at,revoked_at')
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null);
    if (result.error || !result.data) return null;
    return (result.data as { expires_at: string | null; revoked_at: string | null }[]).filter(
      (row) => resolveLoginState({ revokedAt: row.revoked_at, expiresAt: row.expires_at }) === 'active'
    ).length;
  } catch {
    return null;
  }
}

/** Confirm a release belongs to the caller before recording it on a link. */
async function verifyReleaseOwnership(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<string | null> {
  try {
    const result = await adminClient
      .from('releases')
      .select('id')
      .eq('id', releaseId)
      .eq('owner_user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (result.error || !result.data) return null;
    return releaseId;
  } catch {
    return null;
  }
}
