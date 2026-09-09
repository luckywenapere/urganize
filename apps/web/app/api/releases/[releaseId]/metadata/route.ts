import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
  toMetadataSnapshot,
} from '../../_shared';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

// Feature flag. This route is part of the metadata surface
// (NEXT_PUBLIC_FEATURE_METADATA) and was the one handler in it with no gate:
// the credits route group, the public /credits/[token] page and its POST route
// all 404 when the flag is off, so a direct call could still read and write a
// release's distribution fields through here while every UI entry point to
// them was dark.
//
// Defined locally rather than imported from the credits route group's
// _shared.ts, matching how predict-genre/route.ts owns its own flag reader:
// route groups read their flags themselves, and a cross-group import of a
// boolean would tie this handler to a sibling group's module.
//
// The body is exactly 'Not found.' on purpose. lib/chappi/tool-families/shared
// .ts:isFlagGateOff matches that string to tell "the feature is off" apart
// from the release access check's 'Rollout not found.', so the assistant can
// explain which one happened instead of reporting a missing release.
const isMetadataFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

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
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  // Team read (whole-workspace visibility): any member of the owner's
  // workspace may open the Metadata scene, not just the release owner.
  // Accepted semantics note: the metadata_viewed stamp below now fires for
  // any member's view — team review is review, and the payload already
  // records who viewed.
  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const viewEvent = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'metadata_viewed',
    payload_json: {
      viewedAt: new Date().toISOString(),
      viewerUserId: auth.user.id,
    },
  });

  if (viewEvent.error) {
    if (isOptionalTableMissingError(viewEvent.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: viewEvent.error.message || 'Could not track metadata review.' }, { status: 500 });
  }

  const commandCenter = await loadReleaseCommandCenterData(adminClient!, ownership.release);
  if ('error' in commandCenter) return commandCenter.error;

  return NextResponse.json({
    release: ownership.release,
    metadata: commandCenter.metadata,
    readiness: commandCenter.readiness,
  });
}

type UpdateMetadataBody = {
  isrc?: unknown;
  upc?: unknown;
  iswc?: unknown;
  genre?: unknown;
  subgenre?: unknown;
  language?: unknown;
  explicit?: unknown;
  labelName?: unknown;
  cLine?: unknown;
  pLine?: unknown;
};

const readOptionalString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

// Editable half of the metadata hub (URG-108): the release-level
// distribution fields (ISRC, UPC, ISWC, genre, subgenre, language, explicit,
// label, (P)/(C) lines). Full-replace on every save — the hub's form is
// fully controlled and always submits its complete current state, so an
// upsert keyed on release_id is simpler and more predictable than a partial
// PATCH contract.
//
// Deliberate allowlist. release_title / primary_artist_name are
// write-through caches owned by lib/artists-server.ts:renameWorkspaceArtist
// and the release-rename flow — this route must never touch them (CLAUDE.md:
// "Never mutate it directly — it gets clobbered on the next rename").
// artwork_url is the deprecated cover-art fallback (Phase 3c); cover art is
// edited through the Assets section, not here.
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
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => ({}))) as UpdateMetadataBody;

  if (body.explicit !== undefined && body.explicit !== null && typeof body.explicit !== 'boolean') {
    return NextResponse.json({ error: 'explicit must be true, false, or null.' }, { status: 400 });
  }

  const upsertResult = await adminClient!
    .from(RELEASE_METADATA_TABLE)
    .upsert(
      {
        release_id: releaseId,
        isrc: readOptionalString(body.isrc),
        upc: readOptionalString(body.upc),
        iswc: readOptionalString(body.iswc),
        genre: readOptionalString(body.genre),
        subgenre: readOptionalString(body.subgenre),
        language: readOptionalString(body.language),
        explicit: body.explicit === undefined ? null : body.explicit,
        label_name: readOptionalString(body.labelName),
        c_line: readOptionalString(body.cLine),
        p_line: readOptionalString(body.pLine),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'release_id' }
    )
    .select('*')
    .maybeSingle();

  if (upsertResult.error) {
    if (isOptionalTableMissingError(upsertResult.error)) return buildMissingTableResponse();
    return NextResponse.json(
      { error: upsertResult.error.message || 'Could not save metadata.' },
      { status: 500 }
    );
  }

  const eventInsert = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'metadata_updated',
    payload_json: { updatedAt: new Date().toISOString(), userId: auth.user.id },
  });
  if (eventInsert.error && !isOptionalTableMissingError(eventInsert.error)) {
    return NextResponse.json(
      { error: eventInsert.error.message || 'Could not log metadata update.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    metadata: toMetadataSnapshot((upsertResult.data || null) as Record<string, unknown> | null),
  });
}
