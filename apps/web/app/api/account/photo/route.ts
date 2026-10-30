import { NextResponse, type NextRequest } from 'next/server';
import { parseAccountPhotoInput } from '@/lib/account-photo';
import { loadAccountPhotoUrl, loadGooglePhotoSuggestion, saveAccountPhotoPath } from '@/lib/account-photo-server';
import { resolveAccountPhotoCaller } from './_shared';

// GET: { photoUrl } (a fresh signed URL or null). With ?suggest=google it also
// answers googleSuggestionUrl: the Google picture on the account, only after
// it passed the googleusercontent allowlist (the invitee step shows it).
// PUT { photoPath: string | null }: save a path under account/<you>/photo/
// (or clear it), drop the file it replaces, answer { photoUrl }.

export async function GET(request: NextRequest) {
  const caller = await resolveAccountPhotoCaller(request);
  if ('error' in caller) return caller.error;
  const { adminClient, user } = caller;
  const wantsGoogle = request.nextUrl.searchParams.get('suggest') === 'google';
  const [photoUrl, googleSuggestionUrl] = await Promise.all([
    loadAccountPhotoUrl(adminClient, user.id),
    wantsGoogle ? loadGooglePhotoSuggestion(adminClient, user.id) : Promise.resolve(null),
  ]);
  return NextResponse.json(
    { photoUrl, ...(wantsGoogle ? { googleSuggestionUrl } : {}) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest) {
  const caller = await resolveAccountPhotoCaller(request);
  if ('error' in caller) return caller.error;
  const { adminClient, user } = caller;
  try {
    const parsed = parseAccountPhotoInput(await request.json().catch(() => null), user.id);
    if (parsed.kind === 'absent') return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    if (parsed.kind === 'error') return NextResponse.json({ error: parsed.error }, { status: 400 });
    const saved = await saveAccountPhotoPath(adminClient, user.id, parsed.kind === 'set' ? parsed.path : null);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ photoUrl: saved.photoUrl });
  } catch (error) {
    console.error('[account-photo] save failed', error);
    return NextResponse.json({ error: 'Could not save the photo. Try again.' }, { status: 500 });
  }
}
