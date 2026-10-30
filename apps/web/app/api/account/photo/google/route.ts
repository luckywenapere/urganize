import { NextResponse, type NextRequest } from 'next/server';
import { saveGooglePhoto } from '@/lib/account-photo-server';
import { resolveAccountPhotoCaller } from '../_shared';

// "Use this photo" on the invitee step. Takes NO url from the browser: the
// server reads the Google picture off the account's own identities with the
// admin client, checks it against the googleusercontent allowlist, fetches it
// (no redirects, 8s, 5 MB, JPEG/PNG/WebP) and stores a copy under
// account/<you>/photo/. Answers { photoUrl }.

export async function POST(request: NextRequest) {
  const caller = await resolveAccountPhotoCaller(request);
  if ('error' in caller) return caller.error;
  try {
    const saved = await saveGooglePhoto(caller.adminClient, caller.user.id);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ photoUrl: saved.photoUrl });
  } catch (error) {
    console.error('[account-photo] google save failed', error);
    return NextResponse.json({ error: 'Could not save the photo. Try again.' }, { status: 500 });
  }
}
