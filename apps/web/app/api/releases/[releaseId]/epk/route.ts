import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_EPKS_TABLE,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isEpkFeatureEnabled,
  requireActiveAuthenticatedUser,
  toReleaseEpk,
} from './_shared';

const EPK_COLUMNS = 'id,release_id,share_token,created_at,updated_at';

// 18 random bytes → 24 URL-safe chars. Unguessable; the token IS the access
// control for the public page, so it must never be derivable from ids.
const generateShareToken = (): string => randomBytes(18).toString('base64url');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isEpkFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const { data, error } = await adminClient
    .from(RELEASE_EPKS_TABLE)
    .select(EPK_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load press kit.' }, { status: 500 });
  }

  return NextResponse.json({ epk: data ? toReleaseEpk(data as Record<string, unknown>) : null });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isEpkFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Idempotent: an existing EPK is returned as-is so double-clicks and
  // repeated generates never churn the share link.
  const { data: existing, error: existingError } = await adminClient
    .from(RELEASE_EPKS_TABLE)
    .select(EPK_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message || 'Could not load press kit.' },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({ epk: toReleaseEpk(existing as Record<string, unknown>) });
  }

  const { data: inserted, error: insertError } = await adminClient
    .from(RELEASE_EPKS_TABLE)
    .insert({
      // The RELEASE owner, not the acting teammate: the row must survive the
      // teammate's account (auth.users delete-cascade) and stay visible to
      // the owner's RLS/export, which key on this column.
      owner_user_id: ownership.release.ownerUserId,
      release_id: releaseId,
      share_token: generateShareToken(),
    })
    .select(EPK_COLUMNS)
    .maybeSingle();

  if (insertError || !inserted) {
    // Unique-violation race (two concurrent generates): fall back to the row
    // the other request won with rather than surfacing an error.
    if (insertError?.code === '23505') {
      const { data: raced } = await adminClient
        .from(RELEASE_EPKS_TABLE)
        .select(EPK_COLUMNS)
        .eq('release_id', releaseId)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({ epk: toReleaseEpk(raced as Record<string, unknown>) });
      }
    }
    return NextResponse.json(
      { error: insertError?.message || 'Could not create press kit.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { epk: toReleaseEpk(inserted as Record<string, unknown>) },
    { status: 201 }
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isEpkFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Idempotent revoke: deleting an already-revoked EPK is a success.
  const { error } = await adminClient
    .from(RELEASE_EPKS_TABLE)
    .delete()
    .eq('release_id', releaseId);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not revoke press kit.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
