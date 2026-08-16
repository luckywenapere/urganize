import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { TEAM_LOGINS_ENABLED } from '@/lib/team-logins';
import {
  INVITE_LINKS_TABLE,
  isMissingTeamLoginColumn,
  requireLinkManager,
} from '../_shared';

/**
 * DELETE — revoke a sign-in link (founder request, 2026-08-16).
 *
 * SOFT, matching the teammate-removal route one directory over: the row stays
 * so the list can show "Revoked" rather than silently losing an entry the
 * manager remembers creating, and so `revoked_by` is a real audit trail. The
 * revoked_at column has existed since the table shipped in 2026-07 with the
 * note "no UI for that yet, but the column is ready" — this is that UI's
 * backend.
 *
 * Revocation is IMMEDIATE and total: /api/invites/[token] already refuses any
 * code whose row carries revoked_at, on both the metadata GET and the accept
 * POST. Someone mid-signup with the link open cannot complete the join.
 * Anyone who ALREADY joined keeps their membership — this kills the link, not
 * the people who used it. Removing a teammate is Settings → Teammates.
 *
 * Flag-gated, like the list endpoint (the mint POST is not — see route.ts).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!TEAM_LOGINS_ENABLED) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: 'Missing login id.' }, { status: 400 });
  }

  try {
    const access = await requireLinkManager(adminClient, auth.user);
    if ('error' in access) return access.error;

    // Scope the lookup to the caller's workspace so an id from another team
    // resolves to "not found" rather than being revocable.
    const existing = await adminClient
      .from(INVITE_LINKS_TABLE)
      .select('id,revoked_at')
      .eq('id', id)
      .eq('workspace_id', access.workspaceId)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json(
        { error: existing.error.message || 'Could not load that login.' },
        { status: 500 }
      );
    }
    if (!existing.data) {
      return NextResponse.json({ error: 'Login not found.' }, { status: 404 });
    }
    // Idempotent: revoking an already-revoked link is a no-op success, so a
    // double-tap on a slow connection doesn't surface an error.
    if ((existing.data as { revoked_at: string | null }).revoked_at) {
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }

    const nowIso = new Date().toISOString();
    let updateResult = await adminClient
      .from(INVITE_LINKS_TABLE)
      .update({ revoked_at: nowIso, revoked_by: auth.user.id })
      .eq('id', id)
      .eq('workspace_id', access.workspaceId);

    // `revoked_by` arrived with the 2026-08-16 migration; `revoked_at` did
    // not. On an environment that predates it, revoke anyway — losing the
    // audit column must not leave a link live.
    if (updateResult.error && isMissingTeamLoginColumn(updateResult.error)) {
      updateResult = await adminClient
        .from(INVITE_LINKS_TABLE)
        .update({ revoked_at: nowIso })
        .eq('id', id)
        .eq('workspace_id', access.workspaceId);
    }

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || 'Could not revoke that login.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not revoke that login.' },
      { status: 500 }
    );
  }
}
