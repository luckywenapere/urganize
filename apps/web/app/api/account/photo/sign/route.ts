import { type NextRequest } from 'next/server';
import { accountPhotoPathPrefix } from '@/lib/account-photo';
import { signProfilePhotoUpload } from '@/lib/profile-photo-server';
import { resolveAccountPhotoCaller } from '../_shared';

// Step one of your account photo upload: a signed PUT URL under
// account/<your user id>/photo/. The client PUTs the bytes, then PUTs
// /api/account/photo with { photoPath }. Same checks as every other photo
// (type, 5 MB cap) via signProfilePhotoUpload.

export async function POST(request: NextRequest) {
  const caller = await resolveAccountPhotoCaller(request);
  if ('error' in caller) return caller.error;
  const body = await request.json().catch(() => null);
  return signProfilePhotoUpload(caller.adminClient, accountPhotoPathPrefix(caller.user.id), body, 'account-photo');
}
