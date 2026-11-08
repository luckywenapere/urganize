import { NextRequest, NextResponse } from 'next/server';
import { searchImportArtists } from '@/lib/artist-import/fetch';
import { extractLink } from '@/lib/artist-import/artist-link';
import { findArtistFromLink } from '@/lib/artist-import/artist-link-server';
import { allowImportLookup, importLookupKey } from '@/lib/artist-import/rate-limit';

/** Longer than any share link with its tracking, short enough that nobody pastes a page. */
const MAX_LINK_CHARS = 600;

// Open on purpose: onboarding runs this before the account exists, so the
// person sees their artist appear first. Public data only, limited per address.
//
// A pasted link (#1129) answers with the one artist it points at and
// `fromLink: true`, or with a plain reason the link can't be used.
export async function GET(request: NextRequest) {
  if (!allowImportLookup(importLookupKey(request.headers.get('x-forwarded-for')))) {
    return NextResponse.json({ error: 'Slow down a little and try again.' }, { status: 429 });
  }
  const q = request.nextUrl.searchParams.get('q') ?? '';

  // The link is taken out of any words around it first, so a long share text can't cut it off.
  const link = extractLink(q);
  if (link) {
    const result = await findArtistFromLink(link.slice(0, MAX_LINK_CHARS));
    if (!result.ok) {
      return NextResponse.json(
        { artists: [], error: result.message },
        { status: result.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      { artists: [result.candidate], fromLink: true },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  }

  const artists = await searchImportArtists(q);
  return NextResponse.json(
    { artists },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
