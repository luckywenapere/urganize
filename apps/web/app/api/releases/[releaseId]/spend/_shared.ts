import { NextResponse } from 'next/server';

import { SPEND_COPY } from '@/lib/release-spend';

// The two answers every spend route can give before it does any work. Kept here
// so they cannot be worded two ways. The access calls themselves stay in each
// route.ts, on purpose: lib/release-access-guard.test.ts requires every route in
// this group to name the shared team-aware helper where the handler is.

/**
 * A member can see a rollout and still not be allowed to see its spend (a plain
 * member, a guest). That is not a 404: they already know the rollout exists, and
 * saying why is kinder than pretending it is not there. 403, never 402, because
 * the browser turns any 402 into a redirect to the paywall.
 */
export function noSpendAccess(): NextResponse {
  return NextResponse.json({ error: SPEND_COPY.noAccess }, { status: 403 });
}

/** The visibility rule or a read failed. An error, never "no lines". */
export function couldNotCheckSpend(): NextResponse {
  return NextResponse.json({ error: 'Could not load spend. Try again.' }, { status: 500 });
}

export function missingReleaseId(): NextResponse {
  return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
}

export function notConfigured(): NextResponse {
  return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
}
