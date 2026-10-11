import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { artistPhotoPathPrefix, parsePhotoPathInput } from '@/lib/profile-photo';
import { removePhotoObject, signPhotoPath, signProfilePhotoUpload } from '@/lib/profile-photo-server';

// One artist's profile photo (2026-10-11, founder ask).
//
// POST signs an upload under artist/<id>/photo/; the client PUTs the bytes
// straight to storage, then PATCHes here with { photoPath } (or null to remove).
//
// Authorized exactly the way rename and brand colors are: by finding the id on
// the caller's OWN roster, so an artist on another team is indistinguishable
// from one that does not exist. Any teammate who can rename an artist can set
// their face. Lives behind NEXT_PUBLIC_FEATURE_WORKSPACE like its siblings.

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

async function resolveArtist(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return { error: auth.error } as const;
  const { artistId } = await context.params;
  if (!artistId) {
    return { error: NextResponse.json({ error: 'Artist id is required.' }, { status: 400 }) } as const;
  }
  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  if (!access.primaryWorkspaceId) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) } as const;
  }
  const roster = await listWorkspaceArtists(auth.adminClient, access.primaryWorkspaceId);
  const artist = roster.find((entry) => entry.id === artistId);
  if (!artist) {
    return { error: NextResponse.json({ error: 'Artist not found.' }, { status: 404 }) } as const;
  }
  return { adminClient: auth.adminClient, artist } as const;
}

export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const resolved = await resolveArtist(request, context);
    if ('error' in resolved) return resolved.error;
    const body = await request.json().catch(() => null);
    return signProfilePhotoUpload(
      resolved.adminClient,
      artistPhotoPathPrefix(resolved.artist.id),
      body,
      'artist-photo'
    );
  } catch (error) {
    console.error('[artist-photo] sign failed', error);
    return NextResponse.json({ error: 'Could not start the upload. Try again.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const resolved = await resolveArtist(request, context);
    if ('error' in resolved) return resolved.error;
    const { adminClient, artist } = resolved;

    const parsed = parsePhotoPathInput(await request.json().catch(() => null), artistPhotoPathPrefix(artist.id));
    if (parsed.kind === 'absent') return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    if (parsed.kind === 'error') return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: before } = await adminClient.from('artists').select('photo_path').eq('id', artist.id).maybeSingle();
    const nextPath = parsed.kind === 'set' ? parsed.path : null;

    const { error } = await adminClient.from('artists').update({ photo_path: nextPath }).eq('id', artist.id);
    if (error) {
      if (error.code === '42703') {
        return NextResponse.json({ error: 'Artist photos are not ready yet. Try again soon.' }, { status: 503 });
      }
      return NextResponse.json({ error: 'Could not save the photo. Try again.' }, { status: 500 });
    }

    const previous = (before as { photo_path?: unknown } | null)?.photo_path;
    if (previous && previous !== nextPath) await removePhotoObject(adminClient, previous);

    return NextResponse.json({
      artist: { id: artist.id, photoUrl: await signPhotoPath(adminClient, nextPath) },
    });
  } catch (error) {
    console.error('[artist-photo] save failed', error);
    return NextResponse.json({ error: 'Could not save the photo. Try again.' }, { status: 500 });
  }
}
