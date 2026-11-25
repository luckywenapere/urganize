import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { isOwnPhotoPath } from '@/lib/profile-photo';
import { signProfilePhotoUpload } from '@/lib/profile-photo-server';
import { verificationPathPrefix } from '@/lib/artist-verification';
import { submitVerification } from '@/lib/artist-verification-server';

// Sending a screenshot to verify an artist (issue #1390).
//
// POST signs an upload under artist/<id>/verification/; the browser PUTs the
// image straight to storage, then PATCHes here with { screenshotPath,
// provider } to send it. Authorized the way the artist photo is: the id must be
// on the caller's OWN roster, so an artist on another team looks like one that
// does not exist. Sending never blocks anything; it moves the artist to
// "checking" and the team is emailed.

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
  return { adminClient: auth.adminClient, artist, userId: auth.user.id } as const;
}

export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  try {
    const resolved = await resolveArtist(request, context);
    if ('error' in resolved) return resolved.error;
    const body = await request.json().catch(() => null);
    return signProfilePhotoUpload(
      resolved.adminClient,
      verificationPathPrefix(resolved.artist.id),
      body,
      'artist-verification'
    );
  } catch (error) {
    console.error('[artist-verification] sign failed', error);
    return NextResponse.json({ error: 'Could not start the upload. Try again.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  try {
    const resolved = await resolveArtist(request, context);
    if ('error' in resolved) return resolved.error;
    const { adminClient, artist, userId } = resolved;

    const body = (await request.json().catch(() => null)) as { screenshotPath?: unknown; provider?: unknown } | null;
    const screenshotPath = body?.screenshotPath;
    if (!isOwnPhotoPath(screenshotPath, verificationPathPrefix(artist.id))) {
      return NextResponse.json({ error: 'Add the screenshot first.' }, { status: 400 });
    }

    const { data: profile } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
    const role = (profile as { role?: unknown } | null)?.role ?? null;

    const result = await submitVerification(adminClient, {
      artistId: artist.id,
      userId,
      role,
      provider: body?.provider,
      screenshotPath,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    console.error('[artist-verification] submit failed', error);
    return NextResponse.json({ error: 'Could not send the screenshot. Try again.' }, { status: 500 });
  }
}
