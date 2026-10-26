import { NextResponse } from 'next/server';

// The share sheet's target (manifest share_target). The installed app's service
// worker answers this POST itself (public/sw-share-target.js) and never lets it
// reach here. This route is the fallback for the one time it can: a share that
// arrives before the worker has taken control. It cannot read the share (the
// session is not in a cookie), so it opens Bring your notes empty.
function toNotes(request: Request) {
  return NextResponse.redirect(new URL('/dashboard/notes?import=1', request.url), 303);
}

export const GET = toNotes;
export const POST = toNotes;
