import { randomUUID } from 'node:crypto';
import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { RECAP_CARD_DIMENSIONS, renderRecapCard } from '@/lib/recap-card';
import { formatRecapDate, type RecapCardSize } from '@/lib/recap-copy';
import { loadRecapFonts } from '@/lib/recap-fonts';
import { gatherRecapStats, selectRecapStats, type RecapStatLine } from '@/lib/recap-stats';
import type { ReleaseRecap } from '@/types/recap';
import {
  RECAP_COLUMNS,
  RELEASE_RECAPS_TABLE,
  createAdminClient,
  ensureReleaseOwnership,
  isRecapEligible,
  isRecapFeatureEnabled,
  parseRecapInputs,
  requireActiveAuthenticatedUser,
  toReleaseRecap,
  type RecapReleaseRow,
} from './_shared';

// Rendering two 1080px posters plus two storage uploads. Well under this in
// practice (the fonts are cached per lambda), but image work deserves the same
// ceiling the AI routes use rather than the platform default.
export const maxDuration = 60;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const CARD_SIZES: RecapCardSize[] = ['story', 'square'];

/**
 * Best-effort cleanup of superseded images. A regenerate has already succeeded
 * by the time this runs, so a failure here must never fail the request: the
 * worst case is an orphaned object in a private bucket.
 */
async function removeStorageObjects(adminClient: AdminClient, paths: string[]): Promise<void> {
  const targets = paths.filter(Boolean);
  if (targets.length === 0) return;
  try {
    const { error } = await adminClient.storage.from(RELEASE_ASSETS_BUCKET).remove(targets);
    if (error) {
      console.error('[recap] could not remove superseded images', error);
    }
  } catch (error) {
    console.error('[recap] removing superseded images threw', error);
  }
}

async function signRecapRow(
  adminClient: AdminClient,
  row: Record<string, unknown>
): Promise<ReleaseRecap> {
  const storyPath = row.story_image_path ? String(row.story_image_path) : '';
  const squarePath = row.square_image_path ? String(row.square_image_path) : '';

  const [storyImageUrl, squareImageUrl] = await Promise.all([
    storyPath
      ? generateSignedUrl(adminClient, RELEASE_ASSETS_BUCKET, storyPath, ASSET_SIGNED_URL_TTL_SECONDS)
      : Promise.resolve(null),
    squarePath
      ? generateSignedUrl(adminClient, RELEASE_ASSETS_BUCKET, squarePath, ASSET_SIGNED_URL_TTL_SECONDS)
      : Promise.resolve(null),
  ]);

  return toReleaseRecap(row, { storyImageUrl, squareImageUrl });
}

async function renderCardPng(
  size: RecapCardSize,
  release: RecapReleaseRow,
  stats: Awaited<ReturnType<typeof selectRecapStats>>,
  highlight: string | null,
  fonts: Awaited<ReturnType<typeof loadRecapFonts>>
): Promise<Buffer> {
  const { width, height } = RECAP_CARD_DIMENSIONS[size];
  const image = new ImageResponse(
    renderRecapCard({
      size,
      title: release.title,
      artistName: release.artistName,
      releaseDateLabel: formatRecapDate(release.releaseDate),
      stats,
      highlight,
    }),
    { width, height, fonts }
  );
  return Buffer.from(await image.arrayBuffer());
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isRecapFeatureEnabled()) {
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

  const { data, error } = await adminClient
    .from(RELEASE_RECAPS_TABLE)
    .select(RECAP_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load the recap.' }, { status: 500 });
  }

  // The same stats the card will carry, so the modal can show them BEFORE
  // generating (stat tiles, 2026-08-13): the form step otherwise asks for an
  // optional highlight with no hint of what else lands on the poster, and a
  // sparse card is exactly when that highlight earns its place.
  //
  // Failing soft is the point. gatherRecapStats THROWS on a task-query error,
  // and a stats problem must never stop a manager reaching a recap they
  // already have — the same posture this feature takes toward the pitches
  // table it does not own.
  let stats: RecapStatLine[] | null = null;
  try {
    stats = selectRecapStats(
      await gatherRecapStats(adminClient, releaseId, ownership.release.releaseDate)
    );
  } catch (statsError) {
    console.error('[recap] could not gather stats for the preview', statsError);
  }

  if (!data) {
    return NextResponse.json({ recap: null, stats });
  }

  return NextResponse.json({
    recap: await signRecapRow(adminClient, data as Record<string, unknown>),
    stats,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isRecapFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is valid: the highlight is optional.
    body = {};
  }

  const parsed = parseRecapInputs(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;
  const { release } = ownership;

  let stats;
  try {
    // One tasks read serves both the eligibility gate and the card stats.
    const raw = await gatherRecapStats(adminClient, releaseId, release.releaseDate);

    if (!isRecapEligible(release, raw)) {
      return NextResponse.json(
        { error: 'This release is not ready for a recap yet.' },
        { status: 400 }
      );
    }

    stats = selectRecapStats(raw);
  } catch (error) {
    console.error('[recap] could not gather stats', error);
    return NextResponse.json({ error: 'Could not read this release. Try again.' }, { status: 500 });
  }

  // Render both sizes, then upload both, before touching the row. If anything
  // here throws, the previously stored recap is left exactly as it was.
  let uploadedPaths: Record<RecapCardSize, string>;
  try {
    const fonts = await loadRecapFonts();
    const buffers = await Promise.all(
      CARD_SIZES.map((size) => renderCardPng(size, release, stats, parsed.inputs.highlight, fonts))
    );

    // Fresh UUID paths every generate, so neither the signed-URL cache nor a
    // browser can ever serve the previous card for the new one.
    const paths = CARD_SIZES.map((size) => `${releaseId}/recap/${size}-${randomUUID()}.png`);

    const uploads = await Promise.all(
      paths.map((path, index) =>
        adminClient.storage.from(RELEASE_ASSETS_BUCKET).upload(path, buffers[index], {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        })
      )
    );

    const failed = uploads.find((result) => result.error);
    if (failed?.error) {
      // Remove whichever half landed so a failed generate leaves nothing behind.
      await removeStorageObjects(
        adminClient,
        paths.filter((_, index) => !uploads[index].error)
      );
      console.error('[recap] image upload failed', failed.error);
      return NextResponse.json({ error: 'Could not save the recap images.' }, { status: 500 });
    }

    uploadedPaths = { story: paths[0], square: paths[1] };
  } catch (error) {
    console.error('[recap] rendering failed', error);
    return NextResponse.json({ error: 'Could not build the recap. Try again.' }, { status: 500 });
  }

  const rowValues = {
    highlight: parsed.inputs.highlight,
    story_image_path: uploadedPaths.story,
    square_image_path: uploadedPaths.square,
    generated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await adminClient
    .from(RELEASE_RECAPS_TABLE)
    .select(RECAP_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (existingError) {
    await removeStorageObjects(adminClient, [uploadedPaths.story, uploadedPaths.square]);
    return NextResponse.json(
      { error: existingError.message || 'Could not load the recap.' },
      { status: 500 }
    );
  }

  const supersededPaths = (row: Record<string, unknown> | null): string[] =>
    row
      ? [
          row.story_image_path ? String(row.story_image_path) : '',
          row.square_image_path ? String(row.square_image_path) : '',
        ]
      : [];

  if (existing) {
    const { data: updated, error: updateError } = await adminClient
      .from(RELEASE_RECAPS_TABLE)
      .update(rowValues)
      .eq('release_id', releaseId)
      .select(RECAP_COLUMNS)
      .maybeSingle();

    if (updateError || !updated) {
      await removeStorageObjects(adminClient, [uploadedPaths.story, uploadedPaths.square]);
      return NextResponse.json(
        { error: updateError?.message || 'Could not save the recap.' },
        { status: 500 }
      );
    }

    await removeStorageObjects(adminClient, supersededPaths(existing as Record<string, unknown>));
    return NextResponse.json({
      recap: await signRecapRow(adminClient, updated as Record<string, unknown>),
    });
  }

  const { data: inserted, error: insertError } = await adminClient
    .from(RELEASE_RECAPS_TABLE)
    .insert({ owner_user_id: auth.user.id, release_id: releaseId, ...rowValues })
    .select(RECAP_COLUMNS)
    .maybeSingle();

  if (insertError || !inserted) {
    // Unique-violation race (two concurrent generates): the other request won
    // the insert, so apply this render to that row rather than erroring.
    if (insertError?.code === '23505') {
      const { data: raced } = await adminClient
        .from(RELEASE_RECAPS_TABLE)
        .select(RECAP_COLUMNS)
        .eq('release_id', releaseId)
        .maybeSingle();

      const { data: updated } = await adminClient
        .from(RELEASE_RECAPS_TABLE)
        .update(rowValues)
        .eq('release_id', releaseId)
        .select(RECAP_COLUMNS)
        .maybeSingle();

      if (updated) {
        await removeStorageObjects(adminClient, supersededPaths(raced as Record<string, unknown> | null));
        return NextResponse.json({
          recap: await signRecapRow(adminClient, updated as Record<string, unknown>),
        });
      }
    }

    await removeStorageObjects(adminClient, [uploadedPaths.story, uploadedPaths.square]);
    return NextResponse.json(
      { error: insertError?.message || 'Could not save the recap.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { recap: await signRecapRow(adminClient, inserted as Record<string, unknown>) },
    { status: 201 }
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isRecapFeatureEnabled()) {
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

  // Idempotent: deleting an already-deleted recap is a success.
  const { data: existing } = await adminClient
    .from(RELEASE_RECAPS_TABLE)
    .select('story_image_path,square_image_path')
    .eq('release_id', releaseId)
    .maybeSingle();

  const { error } = await adminClient
    .from(RELEASE_RECAPS_TABLE)
    .delete()
    .eq('release_id', releaseId);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not delete the recap.' }, { status: 500 });
  }

  if (existing) {
    const row = existing as Record<string, unknown>;
    await removeStorageObjects(adminClient, [
      row.story_image_path ? String(row.story_image_path) : '',
      row.square_image_path ? String(row.square_image_path) : '',
    ]);
  }

  return NextResponse.json({ ok: true });
}
