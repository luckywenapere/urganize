import { NextRequest, NextResponse } from 'next/server';
import { buildDefaultCaptureDraft } from '@/lib/capture-playbook';
import { EMPTY_CAPTURE_DRAFT } from '@/types/capture';
import {
  CAPTURE_LEADS_PAGE_SIZE,
  CAPTURE_LEAD_COLUMNS,
  CAPTURE_PAGE_COLUMNS,
  RELEASE_CAPTURE_LEADS_TABLE,
  RELEASE_CAPTURE_PAGES_TABLE,
  captureDraftToRow,
  createAdminClient,
  ensureGraphicAsset,
  ensureReleaseOwnership,
  generateShareToken,
  isCaptureFeatureEnabled,
  normalizeCaptureDraft,
  requireActiveAuthenticatedUser,
  toReleaseCaptureLead,
  toReleaseCapturePage,
} from './_shared';

// Owner-facing capture-page routes (2026-08-14).
//
//   GET    — the page, its recent leads, and the total lead count
//   POST   — create the page (idempotent), pre-filled from the playbook
//   PATCH  — save the authored draft
//   DELETE — delete the page AND its leads (the destructive one; the UI
//            confirms, and pausing is the reversible alternative)
//
// Token rotation lives at ./rotate — deliberately its own endpoint rather than
// a flag on PATCH, because the editor autosaves and a rotate must never be
// something a save can do by accident.

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
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

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { data: page, error: pageError } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .select(CAPTURE_PAGE_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (pageError) {
    return NextResponse.json(
      { error: pageError.message || 'Could not load the capture page.' },
      { status: 500 }
    );
  }

  // Whether the public page will actually render an image, resolved with the
  // same precedence lib/capture-server.ts uses (chosen asset, else the
  // release's cover art). Sent so the editor's checklist grades what a fan
  // would really see instead of guessing from the draft alone.
  const hasGraphic = Boolean(page?.graphic_asset_id) || Boolean(ownership.artworkAssetId);

  // No page yet means no leads by definition — skip the query rather than
  // firing one that can only come back empty.
  if (!page) {
    return NextResponse.json({ page: null, leads: [], leadCount: 0, hasGraphic });
  }

  const { data: leads, error: leadsError, count } = await adminClient
    .from(RELEASE_CAPTURE_LEADS_TABLE)
    .select(CAPTURE_LEAD_COLUMNS, { count: 'exact' })
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .limit(CAPTURE_LEADS_PAGE_SIZE);

  if (leadsError) {
    return NextResponse.json(
      { error: leadsError.message || 'Could not load sign-ups.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    page: toReleaseCapturePage(page as Record<string, unknown>),
    leads: (leads || []).map((row) => toReleaseCaptureLead(row as Record<string, unknown>)),
    // The true total, which can exceed what was returned — the scene says so
    // rather than letting the list's length read as the whole list.
    leadCount: count ?? (leads || []).length,
    hasGraphic,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
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

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  // Idempotent: an existing page is returned as-is so double-clicks and
  // repeated creates never churn the share token or overwrite authored copy.
  const { data: existing, error: existingError } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .select(CAPTURE_PAGE_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message || 'Could not load the capture page.' },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({ page: toReleaseCapturePage(existing as Record<string, unknown>) });
  }

  // Pre-filled from the playbook, so a page created and shared without a single
  // edit already follows the rules it can follow without knowing the campaign.
  // The headline is deliberately left blank — see buildDefaultCaptureDraft.
  const defaults = buildDefaultCaptureDraft(ownership.title);

  const { data: inserted, error: insertError } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .insert({
      owner_user_id: auth.user.id,
      release_id: releaseId,
      share_token: generateShareToken(),
      ...captureDraftToRow({ ...EMPTY_CAPTURE_DRAFT, ...defaults }),
    })
    .select(CAPTURE_PAGE_COLUMNS)
    .maybeSingle();

  if (insertError || !inserted) {
    // Unique-violation race (two concurrent creates): fall back to the row the
    // other request won with rather than surfacing an error.
    if (insertError?.code === '23505') {
      const { data: raced } = await adminClient
        .from(RELEASE_CAPTURE_PAGES_TABLE)
        .select(CAPTURE_PAGE_COLUMNS)
        .eq('release_id', releaseId)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({ page: toReleaseCapturePage(raced as Record<string, unknown>) });
      }
    }
    return NextResponse.json(
      { error: insertError?.message || 'Could not create the capture page.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { page: toReleaseCapturePage(inserted as Record<string, unknown>) },
    { status: 201 }
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const draft = normalizeCaptureDraft(await request.json().catch(() => ({})));

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  // The one field that can point outside this release, so the one field that
  // needs checking against it.
  const graphic = await ensureGraphicAsset(adminClient, releaseId, draft.graphicAssetId);
  if ('error' in graphic) return graphic.error;

  // Deliberately NOT validated against the playbook here. The checklist is
  // advice the manager can be mid-way through taking — refusing to save a
  // half-written headline would make the editor unusable and would put the
  // playbook in charge of the manager rather than the other way round. The
  // page's readiness is computed for display; only the public page enforces
  // anything, by refusing to hand out a destination it does not have.
  const { data: updated, error: updateError } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .update(captureDraftToRow(draft))
    .eq('release_id', releaseId)
    .select(CAPTURE_PAGE_COLUMNS)
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not save the capture page.' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'No capture page exists yet for this release.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ page: toReleaseCapturePage(updated as Record<string, unknown>) });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
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

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  // Idempotent delete. This DOES take the collected emails with it (leads
  // cascade off the page row), which is why the UI confirms and why pausing
  // exists as the reversible way to take a page out of circulation.
  const { error } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .delete()
    .eq('release_id', releaseId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not delete the capture page.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
