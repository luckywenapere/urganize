import { NextRequest, NextResponse } from 'next/server';
import { fetchImportReleases } from '@/lib/artist-import/fetch';
import { isImportProvider, isSafeSourceId } from '@/lib/artist-import/providers';
import { allowImportLookup, importLookupKey } from '@/lib/artist-import/rate-limit';

// Open for the same reason as /search: onboarding shows the releases before
// the account exists. Nothing is saved here.
export async function GET(request: NextRequest) {
  if (!allowImportLookup(importLookupKey(request.headers.get('x-forwarded-for')))) {
    return NextResponse.json({ error: 'Slow down a little and try again.' }, { status: 429 });
  }
  const provider = request.nextUrl.searchParams.get('provider');
  const id = request.nextUrl.searchParams.get('id');
  if (!isImportProvider(provider) || !isSafeSourceId(id)) {
    return NextResponse.json({ error: 'Choose an artist first.' }, { status: 400 });
  }
  const releases = await fetchImportReleases(provider, id);
  if (releases === null) {
    return NextResponse.json({ error: 'Could not reach the music service. Try again.' }, { status: 502 });
  }
  return NextResponse.json(
    { releases },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
