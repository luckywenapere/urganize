import { NextRequest, NextResponse } from 'next/server';
import { searchImportArtists } from '@/lib/artist-import/fetch';
import { allowImportLookup, importLookupKey } from '@/lib/artist-import/rate-limit';

// Open on purpose: onboarding runs this before the account exists, so the
// person sees their artist appear first. Public data only, limited per address.
export async function GET(request: NextRequest) {
  if (!allowImportLookup(importLookupKey(request.headers.get('x-forwarded-for')))) {
    return NextResponse.json({ error: 'Slow down a little and try again.' }, { status: 429 });
  }
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const artists = await searchImportArtists(q);
  return NextResponse.json(
    { artists },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
