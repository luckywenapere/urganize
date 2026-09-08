import { NextResponse } from 'next/server';
import { readDeployVersion } from '@/lib/deploy-version';

/**
 * What is deployed here. PUBLIC and unauthenticated, deliberately.
 *
 * "Is live up to date?" had no answer from outside the app, so a merge that
 * silently did not ship (a Vercel deployment cap, a skipped build) looked
 * exactly like a merge that did. This makes the check two lines:
 *
 *   curl -s https://app.urganize.app/api/version
 *   git rev-parse --short origin/main
 *
 * Matching shas mean live is current. See lib/deploy-version.ts for what this
 * may and may not carry — the payload shape is the security boundary, and a
 * test pins it.
 *
 * NO AUTH, and none should be added: an endpoint that needs a login cannot
 * answer the question it exists for. `force-dynamic` because a cached answer
 * would report the build that happened to be live when the cache filled,
 * which is the one thing this must never do.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(readDeployVersion(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
