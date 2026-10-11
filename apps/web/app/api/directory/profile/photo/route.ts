import { NextResponse, type NextRequest } from 'next/server';
import { personPhotoPathPrefix } from '@/lib/profile-photo';
import { signProfilePhotoUpload } from '@/lib/profile-photo-server';
import {
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

// Step one of your directory photo upload (2026-10-11): a signed PUT URL under
// person/<your user id>/avatar/. The client PUTs the bytes, then PATCHes
// /api/directory/profile with { photoPath }. The photo belongs to the PERSON,
// like the rest of the record, so it follows them if they leave a team.

export async function POST(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  return signProfilePhotoUpload(adminClient, personPhotoPathPrefix(auth.user.id), body, 'person-photo');
}
