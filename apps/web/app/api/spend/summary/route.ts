import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { loadSpendSummary } from '@/lib/release-spend-server';

/**
 * The Home card "Where the money went": what the signed-in person's rollouts
 * spent by category over the last 90 days.
 *
 * It counts only rollouts whose spend this person may see. One database function
 * does the adding up and asks the same visibility rule the row level security
 * policies use about every rollout it counts, so this route has no access logic
 * of its own to drift. It answers from the signed-in user, never from a request
 * field, so there is no way to ask about somebody else.
 *
 * Whether to SHOW the card is Home's decision (managers and labels only, and
 * only when there is spend): this route just says what the numbers are. A read,
 * so a read-only team still gets it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const summary = await loadSpendSummary(admin, auth.user.id);
  if (!summary) {
    return NextResponse.json({ error: 'Could not load spend. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ summary });
}
