import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectoryRole } from './directory-roles';
import { workRequestCutoff } from './work-requests';

/**
 * Closing a request nobody answered in seven days.
 *
 * Two entry points, both of which only ever write `expired` and never anything
 * else, and both of which NEVER THROW: a request that cannot be closed is still
 * read as closed (see effectiveRequestStatus), so a failure here costs only the
 * sender's open slot being freed a little later, never a wrong answer.
 *
 * A LEAF MODULE ON PURPOSE. It imports nothing that reaches the email layer,
 * so the cron route and the request route can both use it, and a test can drive
 * it without pulling the mail templates in.
 */

// Declared here rather than imported from app/api/directory/_shared: a lib
// module must not depend on a route group (work-requests-server.ts does the same).
const WORK_REQUESTS_TABLE = 'work_requests';

export type WorkRequestExpirySweepResult = { expired: number; error?: string };

/**
 * THE DAILY SWEEP, a passenger on /api/cron/due-date-notifications (both
 * schedule slots are taken and the Hobby plan caps them at once a day). Closes
 * every request still waiting that was made before the cutoff.
 *
 * Not behind the directory flag, for the reason the pitch window sweep gives:
 * a request already sent has to keep closing even if the feature is switched
 * off afterwards, and with nothing sent there is nothing to close.
 *
 * The update is conditional on `status = 'new'`, so an answer landing in the
 * same instant wins and is never overwritten. Running it twice closes nothing
 * the second time.
 *
 * Before the migration that allows `expired` is applied the database refuses
 * the write; that comes back as an error string for the cron response and
 * closes nothing.
 */
export async function runWorkRequestExpirySweep(
  admin: SupabaseClient,
  now: Date | number = Date.now()
): Promise<WorkRequestExpirySweepResult> {
  try {
    const { data, error } = await admin
      .from(WORK_REQUESTS_TABLE)
      .update({ status: 'expired' })
      .eq('status', 'new')
      .lt('created_at', workRequestCutoff(now))
      .select('id');

    if (error) {
      console.error('[work-request-expiry] sweep refused', error.message);
      return { expired: 0, error: error.message || 'refused' };
    }
    return { expired: Array.isArray(data) ? data.length : 0 };
  } catch (error) {
    console.error('[work-request-expiry] sweep failed', error);
    return { expired: 0, error: error instanceof Error ? error.message : 'failed' };
  }
}

/**
 * Closes a stale request to ONE person for ONE role from ONE team, just before
 * that team asks again. The partial unique index that allows one open request
 * per team per person per role counts a stale-but-not-yet-swept request, so
 * without this a sender could be told "You already asked them about this" for a
 * request that closed days ago, until the next 07:00 UTC run.
 *
 * Only ever closes a request already past the cutoff, so a live request still
 * holds the guard. A refused write is swallowed: the insert that follows will
 * say the real thing if the guard still fires.
 */
export async function expireStaleRequestsForPair(
  admin: SupabaseClient,
  pair: { workspaceId: string | null; recipientUserId: string; role: DirectoryRole },
  now: Date | number = Date.now()
): Promise<void> {
  if (!pair.workspaceId) return;
  try {
    await admin
      .from(WORK_REQUESTS_TABLE)
      .update({ status: 'expired' })
      .eq('workspace_id', pair.workspaceId)
      .eq('recipient_user_id', pair.recipientUserId)
      .eq('role', pair.role)
      .eq('status', 'new')
      .lt('created_at', workRequestCutoff(now));
  } catch {
    // Nothing to do. The insert below is the source of truth.
  }
}
