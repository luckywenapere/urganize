import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_CREDIT_LINKS_TABLE,
  RELEASE_CREDIT_SUBMISSIONS_TABLE,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isMetadataFeatureEnabled,
  requireActiveAuthenticatedUser,
  toReleaseCreditLink,
  toReleaseCreditSubmission,
} from './_shared';

const LINK_COLUMNS = 'id,release_id,share_token,closed_at,created_at,updated_at';
const SUBMISSION_COLUMNS =
  'id,release_id,legal_name,stage_name,roles,contribution,email,phone,country,songwriter_split,pro_affiliation,ipi_number,publisher_name,publisher_ipi,master_split,instagram_handle,x_handle,bio,confirmed_accurate,created_at,updated_at';

// 18 random bytes → 24 URL-safe chars. Unguessable; the token IS the access
// control for the public form, so it must never be derivable from ids.
const generateShareToken = (): string => randomBytes(18).toString('base64url');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
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

  const [linkResult, submissionsResult] = await Promise.all([
    adminClient.from(RELEASE_CREDIT_LINKS_TABLE).select(LINK_COLUMNS).eq('release_id', releaseId).maybeSingle(),
    adminClient
      .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
      .select(SUBMISSION_COLUMNS)
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false }),
  ]);

  if (linkResult.error) {
    return NextResponse.json(
      { error: linkResult.error.message || 'Could not load the credits link.' },
      { status: 500 }
    );
  }
  if (submissionsResult.error) {
    return NextResponse.json(
      { error: submissionsResult.error.message || 'Could not load submissions.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    link: linkResult.data ? toReleaseCreditLink(linkResult.data as Record<string, unknown>) : null,
    submissions: (submissionsResult.data || []).map((row) =>
      toReleaseCreditSubmission(row as Record<string, unknown>)
    ),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
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

  // Idempotent: an existing link is returned as-is so double-clicks and
  // repeated "create link" calls never churn the share token.
  const { data: existing, error: existingError } = await adminClient
    .from(RELEASE_CREDIT_LINKS_TABLE)
    .select(LINK_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message || 'Could not load the credits link.' },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({ link: toReleaseCreditLink(existing as Record<string, unknown>) });
  }

  const { data: inserted, error: insertError } = await adminClient
    .from(RELEASE_CREDIT_LINKS_TABLE)
    .insert({
      // The RELEASE owner, not the acting teammate: this column denormalizes
      // releases.owner_user_id (the migration says so) — the public POST
      // propagates it into every submission, the owner-scoped RLS keys on
      // it, and an auth.users delete-cascade would otherwise kill the
      // release's link when a teammate's account goes.
      owner_user_id: ownership.release.ownerUserId,
      release_id: releaseId,
      share_token: generateShareToken(),
    })
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (insertError || !inserted) {
    // Unique-violation race (two concurrent creates): fall back to the row
    // the other request won with rather than surfacing an error.
    if (insertError?.code === '23505') {
      const { data: raced } = await adminClient
        .from(RELEASE_CREDIT_LINKS_TABLE)
        .select(LINK_COLUMNS)
        .eq('release_id', releaseId)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({ link: toReleaseCreditLink(raced as Record<string, unknown>) });
      }
    }
    return NextResponse.json(
      { error: insertError?.message || 'Could not create the credits link.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ link: toReleaseCreditLink(inserted as Record<string, unknown>) }, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
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

  // Regenerate = rotate the token on the existing row (an UPDATE, not a
  // delete-and-recreate). The old token stops resolving the instant this
  // commits, while every submission already collected stays exactly where it
  // is.
  //
  // closed_at is cleared here on purpose: "make me a new link" means the owner
  // wants a working link, and a regenerated-but-still-closed link is a trap
  // state nothing in the UI would explain. One mental model — Regenerate gives
  // a fresh live link, Close pauses the link you have.
  const { data: updated, error: updateError } = await adminClient
    .from(RELEASE_CREDIT_LINKS_TABLE)
    .update({
      share_token: generateShareToken(),
      closed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('release_id', releaseId)
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not regenerate the credits link.' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: 'No credits link exists yet for this release.' }, { status: 404 });
  }

  return NextResponse.json({ link: toReleaseCreditLink(updated as Record<string, unknown>) });
}

/**
 * Close or reopen the link (founder spec, 2026-08-27).
 *
 * Body: `{ action: 'close' | 'reopen' }`. PATCH rather than a second PUT
 * because this is a partial state change on the existing row, which is what
 * the sibling metadata route already uses PATCH for.
 *
 * Closing does not touch the token or any submission: the same URL keeps
 * resolving, and the public page renders a "this request is closed" message
 * instead of the form (see lib/credits-server.ts). Idempotent — closing a
 * closed link is a no-op update.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = String(body.action || '');
  if (action !== 'close' && action !== 'reopen') {
    return NextResponse.json({ error: "Action must be 'close' or 'reopen'." }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const { data: updated, error: updateError } = await adminClient
    .from(RELEASE_CREDIT_LINKS_TABLE)
    .update({
      closed_at: action === 'close' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('release_id', releaseId)
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not update the credits link.' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ error: 'No credits link exists yet for this release.' }, { status: 404 });
  }

  return NextResponse.json({ link: toReleaseCreditLink(updated as Record<string, unknown>) });
}
