import { NextResponse } from 'next/server';

import { RELEASE_BRIEF_ENABLED } from '@/lib/release-brief-flag';
import type { BriefFailure } from '@/lib/release-brief-server';

// The answers every brief route can give before it does any work, kept here so
// they cannot be worded two ways. The access calls themselves stay in each
// route.ts: lib/release-access-guard.test.ts requires every route in this group
// to name the shared team-aware helper where the handler is.

/** With the flag off the whole group reads as not there. */
export function briefDisabled(): NextResponse | null {
  return RELEASE_BRIEF_ENABLED ? null : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

export function missingReleaseId(): NextResponse {
  return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
}

export function notConfigured(): NextResponse {
  return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

/** A failed brief read or write, as JSON. 503 when the tables are not there yet. */
export function briefFailure(result: BriefFailure): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
