import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, type EmailSendResult } from './index';
import { EMAIL_LOG_TABLE } from './log-server';
import {
  ONBOARDING_STEPS,
  ONBOARDING_TEMPLATE_ID,
  buildOnboardingOutboxRows,
  isOnboardingSequenceEnabled,
  type OnboardingStepKey,
} from './onboarding-sequence';
import { enqueueOutboxRows, loadOutboxCounts } from './outbox-server';

// The onboarding sequence's server half. startOnboardingSequence runs once, from
// the onboarding route, the moment a new signup finishes onboarding: it sends
// day 1 straight away and queues days 2 to 7 for the morning cron. Never throws.

export async function startOnboardingSequence(
  admin: SupabaseClient,
  input: { userId: string; email: string; name: string; now?: Date }
): Promise<{ dayOne: EmailSendResult; queued: number | null }> {
  const now = input.now ?? new Date();
  const dayOne = await sendEmail(admin, {
    templateId: ONBOARDING_TEMPLATE_ID,
    to: input.email,
    props: { step: 'day1', recipientName: input.name },
    trigger: 'onboarding_completed',
    recipientUserId: input.userId,
    actorUserId: input.userId,
  });

  // Someone who already unsubscribed (signing up again with an old address)
  // gets nothing further, so there is nothing to queue.
  if (dayOne.reason === 'suppressed') return { dayOne, queued: 0 };

  const rows = buildOnboardingOutboxRows({ userId: input.userId, email: input.email, name: input.name, startedAt: now });
  const queued = await enqueueOutboxRows(admin, rows);
  return { dayOne, queued };
}

export type SequenceStepOverview = {
  key: OnboardingStepKey;
  day: number;
  label: string;
  subject: string;
  preview: string;
  counts: Record<'queued' | 'sent' | 'skipped' | 'failed' | 'cancelled', number>;
};

export type SequenceOverview = {
  enabled: boolean;
  steps: SequenceStepOverview[];
  countsError: string | null;
};

const emptyCounts = () => ({ queued: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0 });

/** What the admin sequence page shows: each step, and how many of it have gone
 *  out. Day 1 is sent directly rather than queued, so it is counted from the log. */
export async function loadSequenceOverview(admin: SupabaseClient): Promise<SequenceOverview> {
  const steps: SequenceStepOverview[] = ONBOARDING_STEPS.map((step) => ({
    key: step.key,
    day: step.day,
    label: step.label,
    subject: step.subject,
    preview: step.preview,
    counts: emptyCounts(),
  }));
  const byKey = new Map(steps.map((step) => [step.key, step]));

  const [outboxCounts, dayOneCount] = await Promise.all([
    loadOutboxCounts(admin, { template: ONBOARDING_TEMPLATE_ID }),
    admin
      .from(EMAIL_LOG_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('template', ONBOARDING_TEMPLATE_ID)
      .eq('trigger', 'onboarding_completed')
      .in('status', ['sent', 'delivered', 'delayed', 'bounced', 'complained']),
  ]);

  for (const row of outboxCounts || []) {
    const step = row.step ? byKey.get(row.step as OnboardingStepKey) : undefined;
    if (!step) continue;
    if (row.status === 'sending') step.counts.queued += row.total;
    else if (row.status in step.counts) step.counts[row.status as keyof ReturnType<typeof emptyCounts>] += row.total;
  }
  const dayOne = byKey.get('day1');
  if (dayOne && typeof dayOneCount.count === 'number') dayOne.counts.sent = dayOneCount.count;

  return {
    enabled: isOnboardingSequenceEnabled(),
    steps,
    countsError: outboxCounts ? null : 'Could not read the queue. Has the email_outbox migration been applied?',
  };
}
