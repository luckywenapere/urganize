import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { isBrandColorsEnabled, parseBrandColorsInput } from '@/lib/social-share-colors';
import { saveArtistBrandColors } from '@/lib/social-share-colors-server';

// Save one artist's brand colors (2026-09-24, founder call): the background
// and accent their share images are drawn in. PUT, because the body is the
// whole of the setting, both slots at once; null in a slot means "use
// Urganize's color", and nulls in both is how "Use Urganize colors" resets.
//
// Its own route rather than a field on the rename PATCH beside it, so the
// brand-colors flag can switch this off cleanly without touching renames.
//
// Authorized exactly the way rename is: by finding the id on the caller's OWN
// roster, so an artist on another team is indistinguishable from one that does
// not exist. Any teammate who can rename an artist can set their colors.

const isFlagOn = () =>
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true' && isBrandColorsEnabled();

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ artistId: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;
  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json({ error: 'Artist id is required.' }, { status: 400 });
  }

  const parsed = parseBrandColorsInput(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
    const target = roster.find((artist) => artist.id === artistId);
    if (!target) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    const saved = await saveArtistBrandColors(adminClient, target.id, parsed.value);
    if (!saved.ok) {
      return NextResponse.json({ error: 'Could not save the colors. Try again.' }, { status: 500 });
    }

    return NextResponse.json({ artist: { id: target.id, brandColors: saved.value } });
  } catch (error) {
    console.error('[brand-colors] save failed', error);
    return NextResponse.json({ error: 'Could not save the colors. Try again.' }, { status: 500 });
  }
}
