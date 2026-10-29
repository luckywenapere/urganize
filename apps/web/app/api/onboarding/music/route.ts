import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { parseOnboardingRecordBody } from '@/lib/onboarding-flow';
import { createOnboardingRecord } from '@/lib/onboarding-team-server';

// POST /api/onboarding/music (#854): New project for music still being made
// (Just an idea, Recording, Mixing or mastering). One request does the artist
// (found or added in the team), the record in the making and its first song,
// so a phone on bad data makes one call, not three. Ready to release and
// Already out are rollouts and go through POST /api/releases instead.
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return auth.error;
  if (!('adminClient' in auth) || !auth.adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const parsed = parseOnboardingRecordBody(await request.json().catch(() => ({})));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await createOnboardingRecord(auth.adminClient, auth.user, parsed.value);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.limitKey ? { limitKey: result.limitKey } : {}) },
        { status: result.status }
      );
    }
    return NextResponse.json(result.value, { status: 201 });
  } catch (error) {
    console.error('[onboarding/music]', error);
    return NextResponse.json({ error: 'Could not save it. Try again.' }, { status: 500 });
  }
}
