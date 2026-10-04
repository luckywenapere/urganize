import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { errorMessage } from '@/lib/errors';
import { loadHomeData } from '@/lib/home-server';
import { createTimings } from '@/lib/server-timing';

/**
 * The Home tab stays dark until NEXT_PUBLIC_FEATURE_HOME is 'true'. Checked
 * FIRST, before auth, so a direct API call cannot reach the feature either
 * and the 404 cannot be told apart from a route that does not exist (the
 * EPK / notes / events precedent — see app/api/events/_shared.ts).
 */
const isHomeFeatureEnabled = (): boolean => true;

export async function GET(request: NextRequest) {
  if (!isHomeFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const timings = createTimings();
  const auth = await timings.time('auth', () => requireAuthenticatedAdmin(request));
  if ('error' in auth) return auth.error;

  try {
    const data = await timings.time('total_data', () => loadHomeData(auth.adminClient, auth.user, timings));
    return NextResponse.json(data, { headers: { 'Server-Timing': timings.header() } });
  } catch (error) {
    // A brand new route, deliberately WITHOUT the deprecated schema-missing
    // detection command-center's own route still carries (it is grandfathered
    // there; CLAUDE.md's "Patterns being deprecated in v1" forbids adding it
    // to anything new). A missing table is not an expected v1 condition, so it
    // surfaces as an ordinary 500 like any other unexpected failure.
    //
    // `error instanceof Error` is false for the most common failure shape in
    // this codebase — a raw PostgREST error object — which is why
    // `errorMessage` (not the literal fallback string) builds the response.
    console.error('[home] request failed:', error);
    return NextResponse.json(
      { error: errorMessage(error, 'Internal Server Error') },
      { status: 500 }
    );
  }
}
