import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isAccountPhotoEnabled } from '@/lib/account-photo';

// Your account photo (docs/notes/2026-10-30-profile-photo.md). These routes
// are OPEN in the paywall sense (getAuthenticatedUser, not the active-account
// gate) because the photo is offered on "Set up your team", before a trial
// exists, and right after an invitee joins. Each one acts on the caller's own
// row and own folder only, so the gate would protect nothing here.

export async function resolveAccountPhotoCaller(request: NextRequest) {
  if (!isAccountPhotoEnabled()) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) } as const;
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return { error: auth.error } as const;
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }),
    } as const;
  }
  return { user: auth.user, adminClient } as const;
}
