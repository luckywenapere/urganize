import { NextResponse } from 'next/server';

// Shared by the UrgAns chat history routes. Auth comes from the one canonical
// module (never a per-domain copy), and the flag predicate from the pure
// history module so the routes, the store and the bridge cannot disagree
// about whether history is on.
//
// Deliberately NO schema-missing fallback: a missing table is an ordinary 500.
// While the flag is off every handler 404s before touching the table.
//
// Deliberately NO metering: saving a transcript is not an UrgAns action and
// must never spend the monthly assistant allowance. The guard test
// lib/chappi/conversation-history-guard.test.ts fails the build if anything
// under this folder reaches the usage counter.
export { createAdminClient } from '@/app/api/_shared/auth';
export { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
export { isChappiHistoryEnabled, isChatId } from '@/lib/chappi/conversation-history';

/** The flag-off answer: exactly the body every flag-gated route in this app
 *  returns, so nothing downstream can tell "off" apart by its wording. */
export function flagOffResponse() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

export function serverNotConfiguredResponse() {
  return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
}

export function invalidChatIdResponse() {
  return NextResponse.json({ error: 'A valid chat id is required.' }, { status: 400 });
}
