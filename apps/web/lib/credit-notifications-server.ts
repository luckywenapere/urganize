// SERVER ONLY — tell the release owner a collaborator just sent their credits
// (founder spec Phase 2, 2026-08-27). Fires inline from the PUBLIC credits
// form, so read the four rules below before changing anything here.
//
// 1. NEVER THROWS, and never fails the submission. A collaborator on weak
//    mobile data has already done the work by the time this runs; losing their
//    answer because our push provider blinked would be the worst outcome in the
//    feature. Same contract as lib/release-reminders-server.ts.
//
// 2. PUSH AND EMAIL, BOTH, EVERY TIME (founder call). Push is the ping; the
//    email carries what they actually typed, so it can be acted on or
//    forwarded to a distributor without opening the app. Both no-op silently
//    when their keys are unset, which is why doing both is the safe default:
//    whichever is configured delivers.
//
// 3. NOT the `notifications` table / bell. Its task_id is NOT NULL with an FK
//    to tasks and every notification_type value is task-scoped, so a credits
//    event has no legal row there — and the bell is desktop-only, so it would
//    never reach a phone. lib/billing-alerts-server.ts:9-14 is the recorded
//    precedent for choosing email at this exact fork, and CLAUDE.md's
//    out-of-scope line names transactional email as fine while deferring the
//    in-app inbox to v2.
//
// 4. NOT `scheduled_notifications`. Its only flusher is a DAILY cron on the
//    Hobby plan, shortened only by some unrelated user happening to log in.
//    Up to ~24h is wrong for "someone just submitted".

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNotificationPresets } from '@/lib/notification-presets-server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { buildCreditSubmissionEmail } from '@/lib/email-templates';
import { sendPushToUsers } from '@/lib/push-server';
import { resolveAppBaseUrl } from '@/lib/tasks-server';
import {
  buildCreditDetailRows,
  buildCreditSubmissionPush,
  collaboratorLabel,
  creditSubmissionUrl,
  releaseLabel,
  type CreditSubmissionNotice,
} from '@/lib/credit-notifications';

export type NotifyCreditSubmissionInput = Omit<CreditSubmissionNotice, 'releaseTitle'> & {
  ownerUserId: string;
};

/**
 * Push + email the owner about ONE new submission.
 *
 * Call this on the INSERT path only. A correction (the same email resubmitting)
 * must stay quiet — that is the founder's call, and it is also a real abuse
 * guard: the update path carries no submission cap by design, so notifying on
 * updates would let anyone holding the share link send the owner unlimited
 * pushes and emails. This is the first place in the app where an
 * unauthenticated request can trigger a push at all.
 */
export async function notifyCreditSubmission(
  client: SupabaseClient,
  input: NotifyCreditSubmissionInput
): Promise<void> {
  try {
    if (!input.ownerUserId || !input.releaseId) return;

    const presets = await getNotificationPresets(client);
    if (!presets.creditSubmissions.enabled) return;

    // One round trip for both lookups. The submit route holds the owner's id
    // and the release id but neither the owner's email nor the release title.
    const [ownerResult, releaseResult] = await Promise.all([
      client.from('profiles').select('email').eq('id', input.ownerUserId).maybeSingle(),
      client.from('releases').select('title').eq('id', input.releaseId).maybeSingle(),
    ]);

    const ownerEmail = String(ownerResult.data?.email || '').trim();
    const notice: CreditSubmissionNotice = {
      ...input,
      releaseTitle: String(releaseResult.data?.title || ''),
    };

    const push = buildCreditSubmissionPush(notice, presets.creditSubmissions.copy);

    // Concurrent, not sequential: this is on the collaborator's submit path, so
    // the worst case must be max(push, email) rather than their sum. The email
    // module carries its own 10s abort.
    await Promise.all([
      sendPushToUsers(client, [input.ownerUserId], {
        title: push.title,
        body: push.body,
        url: push.url,
        tag: push.tag,
      }),
      sendCreditEmail(ownerEmail, notice),
    ]);
  } catch (error) {
    // Swallowed on purpose — see rule 1 in the header.
    console.error('[credits] owner notification failed', {
      releaseId: input.releaseId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendCreditEmail(
  ownerEmail: string,
  notice: CreditSubmissionNotice
): Promise<void> {
  if (!ownerEmail || !isEmailConfigured()) return;
  try {
    const email = buildCreditSubmissionEmail({
      collaboratorLabel: collaboratorLabel(notice),
      releaseTitle: releaseLabel(notice.releaseTitle),
      rows: buildCreditDetailRows(notice),
      metadataUrl: `${resolveAppBaseUrl()}${creditSubmissionUrl(notice.releaseId)}`,
    });
    await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    // Caught here as well as in the caller so a failing email can never stop
    // the push that ran beside it in Promise.all.
    console.error('[credits] owner email failed', {
      releaseId: notice.releaseId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
