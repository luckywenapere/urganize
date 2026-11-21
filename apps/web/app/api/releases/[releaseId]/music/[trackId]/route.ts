import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  notFound,
  requireActiveAuthenticatedUser,
  UUID_SHAPE,
} from '../_shared';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { isMusicLiveMode } from '@/lib/music/rules';
import {
  MUSIC_TRACKS_TABLE,
  OWNER_TRACK_COLUMNS,
  toOwnerTracks,
  type OwnerRow,
} from '@/lib/music/server';

const TITLE_MAX = 160;

type Context = { params: Promise<{ releaseId: string; trackId: string }> };

async function authorise(request: NextRequest, context: Context) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };

  const { releaseId, trackId } = await context.params;
  if (!releaseId || !trackId || !UUID_SHAPE.test(trackId)) {
    return { error: badRequest('That song id is not valid.') };
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }),
    };
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return { error: access.error };

  return { auth, adminClient, release: access.release, releaseId, trackId };
}

/**
 * Publish, take down, or edit one song.
 *
 * publish   needs the rights box ticked (the database refuses it otherwise
 *           too), puts the song out right away or on release day, and brings
 *           back a song that was taken down.
 * unpublish takes it out of every listener's reach at once. The file, the title
 *           and the plays stay, so putting it back is one tap.
 * update    changes the title or the explicit mark and nothing else.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const ctx = await authorise(request, context);
  if ('error' in ctx) return ctx.error;
  const { auth, adminClient, release, releaseId, trackId } = ctx;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    title?: unknown;
    explicit?: unknown;
    rightsConfirmed?: unknown;
    liveMode?: unknown;
  } | null;
  if (!body) return badRequest('JSON body is required.');

  const { data: current, error: currentError } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .select('id,rights_confirmed_at,published_at,taken_down_at')
    .eq('id', trackId)
    .eq('release_id', releaseId)
    .maybeSingle();
  if (currentError) {
    return NextResponse.json({ error: 'Could not find that song.' }, { status: 500 });
  }
  if (!current) return notFound();

  const patch: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, TITLE_MAX);
    if (!title) return badRequest('A song needs a title.');
    patch.title = title;
  }
  if (typeof body.explicit === 'boolean') patch.explicit = body.explicit;

  const action = typeof body.action === 'string' ? body.action : 'update';

  if (action === 'publish') {
    const alreadyConfirmed = Boolean(current.rights_confirmed_at);
    if (!alreadyConfirmed && body.rightsConfirmed !== true) {
      return badRequest('Confirm that you own this song or have the right to publish it.');
    }
    if (!isMusicLiveMode(body.liveMode)) {
      return badRequest('Choose release day or right away.');
    }
    if (!alreadyConfirmed) {
      patch.rights_confirmed_at = new Date().toISOString();
      patch.rights_confirmed_by = auth.user.id;
    }
    patch.live_mode = body.liveMode;
    patch.published_at = new Date().toISOString();
    patch.taken_down_at = null;
  } else if (action === 'unpublish') {
    patch.taken_down_at = new Date().toISOString();
  } else if (action !== 'update') {
    return badRequest('That is not something we can do to a song.');
  }

  if (Object.keys(patch).length === 0) return badRequest('Nothing to change.');

  const { data: updated, error: updateError } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .update(patch)
    .eq('id', trackId)
    .eq('release_id', releaseId)
    .select(OWNER_TRACK_COLUMNS)
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: 'Could not save that change.' }, { status: 500 });
  }

  const [track] = await toOwnerTracks(adminClient, [updated as unknown as OwnerRow], {
    releaseDate: release.releaseDate,
    deletedAt: null,
  });
  return NextResponse.json({ track });
}

/** Remove a song for good: its file, its row and its plays. */
export async function DELETE(request: NextRequest, context: Context) {
  const ctx = await authorise(request, context);
  if ('error' in ctx) return ctx.error;
  const { adminClient, releaseId, trackId } = ctx;

  const { data: existing, error: existingError } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .select('id,audio_bucket,audio_path')
    .eq('id', trackId)
    .eq('release_id', releaseId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: 'Could not find that song.' }, { status: 500 });
  }
  if (!existing) return notFound();

  // Row first: once it is gone nobody can reach the file, and a leftover file
  // is harmless while a row pointing at a deleted file is a song that cannot play.
  const { error: deleteError } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .delete()
    .eq('id', trackId)
    .eq('release_id', releaseId);
  if (deleteError) {
    return NextResponse.json({ error: 'Could not remove that song.' }, { status: 500 });
  }

  await adminClient.storage
    .from(existing.audio_bucket || RELEASE_ASSETS_BUCKET)
    .remove([existing.audio_path as string])
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
