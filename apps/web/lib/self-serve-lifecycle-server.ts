// Self-serve checkout (2026-10-22): the two daily email steps, run from the
// morning cron (/api/cron/notifications).
//
//   1. Nudges. A team that paid at checkout gets ONE note on day 1, 3 or 7,
//      only while that step is still undone (lib/self-serve.ts pickNudge).
//   2. Renewal reminders. A period paid by bank transfer does not renew by
//      itself, so the owner is reminded 7, 3 and 1 days before it ends.
//
// Once is a row: a lifecycle_sends row (unique per team, kind and key) is
// inserted BEFORE the email goes, so two runs at once send one email, and a
// failed send is never retried (one missed note beats two). Both steps keep
// inside the day's email budget, leaving BULK_RESERVE for everyday mail, and
// never throw. No email address or name is logged.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { BULK_RESERVE, computeSendBudget, readDailyEmailLimit } from '@/lib/email/outbox';
import { countEmailsSentToday } from '@/lib/email/outbox-server';
import { APP_URL } from '@/lib/email/links';
import { settingsDeepLink } from '@/lib/settings-nav';
import { loadChecklistTeam } from '@/lib/self-serve-checklist-server';
import { loadPaymentAccount, trackSelfServe } from '@/lib/self-serve-server';
import { loadIntroMonthsLeft } from '@/lib/referrals-server';
import { loadSelfRenewingUserIds } from '@/lib/bachs-trial-server';
import { getChargePrice, getTierPriceUsd } from '@urganize/pricing';
import {
  checkoutPath,
  isCheckoutPeriod,
  isCheckoutPlan,
  pickNudge,
  renewalReminderDue,
  type NudgeVariant,
} from '@/lib/self-serve';

type Admin = SupabaseClient;

const MAX_PER_RUN = 25;
const NUDGE_WINDOW_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LifecycleKind = 'nudge' | 'renewal_reminder';

/** The click counter wraps every button: it records the click once and sends
 *  the person on. `to` is always one of our own paths. */
export function lifecycleClickUrl(sendId: string, to: string): string {
  return `${APP_URL}/api/lifecycle/click?id=${encodeURIComponent(sendId)}&to=${encodeURIComponent(to)}`;
}

/** Where each nudge's button goes. */
export function nudgeDestination(variant: NudgeVariant, focusReleaseId: string | null): string {
  switch (variant) {
    case 'rollout':
      return '/dashboard';
    case 'tasks':
      return focusReleaseId ? `/dashboard?release=${focusReleaseId}` : '/dashboard';
    case 'invite':
      return settingsDeepLink({ segment: 'team' });
    case 'cover':
      return focusReleaseId ? `/dashboard?release=${focusReleaseId}&scene=coverart` : '/dashboard';
  }
}

async function loadSentKeys(admin: Admin, workspaceId: string, kind: LifecycleKind): Promise<string[] | null> {
  const result = await admin.from('lifecycle_sends').select('key').eq('workspace_id', workspaceId).eq('kind', kind);
  if (result.error) return null;
  return ((result.data ?? []) as Array<{ key: string }>).map((row) => row.key);
}

/** Inserts the row that makes this send happen once. Null when another run got
 *  there first or the table cannot be written. */
async function reserveSend(admin: Admin, workspaceId: string, kind: LifecycleKind, key: string): Promise<string | null> {
  const result = await admin
    .from('lifecycle_sends')
    .insert({ workspace_id: workspaceId, kind, key })
    .select('id')
    .maybeSingle();
  if (result.error || !result.data) return null;
  return (result.data as { id: string }).id;
}

async function readOwner(admin: Admin, userId: string): Promise<{ email: string; name: string } | null> {
  const result = await admin.from('profiles').select('email,name').eq('id', userId).maybeSingle();
  const row = result.data as { email: string | null; name: string | null } | null;
  if (result.error || !row?.email) return null;
  return { email: row.email, name: row.name ?? '' };
}

async function readBudget(admin: Admin, now: Date): Promise<number> {
  const sentToday = await countEmailsSentToday(admin, now);
  if (sentToday === null) return 0;
  return Math.min(MAX_PER_RUN, computeSendBudget({ dailyLimit: readDailyEmailLimit(), sentToday, reserve: BULK_RESERVE }));
}

export type LifecycleRunResult = { sent: number; skipped: number; deferred: number };

export async function runSelfServeNudgeSweep(admin: Admin, now = new Date()): Promise<LifecycleRunResult> {
  const result: LifecycleRunResult = { sent: 0, skipped: 0, deferred: 0 };
  try {
    const since = new Date(now.getTime() - NUDGE_WINDOW_DAYS * DAY_MS).toISOString();
    const teams = await admin
      .from('workspaces')
      .select('id,owner_id,created_at')
      .eq('acquisition_path', 'self_serve')
      .gte('created_at', since)
      .limit(500);
    if (teams.error) return result;
    let budget = await readBudget(admin, now);

    for (const team of (teams.data ?? []) as Array<{ id: string; owner_id: string; created_at: string }>) {
      const sentKeys = await loadSentKeys(admin, team.id, 'nudge');
      if (sentKeys === null) continue;
      const checklist = await loadChecklistTeam(admin, team.owner_id);
      if (!checklist) continue;
      const due = pickNudge({ teamCreatedAt: team.created_at, now, facts: checklist.facts, sentKeys });
      if (!due) continue;
      if (budget <= 0) {
        result.deferred += 1;
        continue;
      }
      const owner = await readOwner(admin, team.owner_id);
      if (!owner) continue;
      const sendId = await reserveSend(admin, team.id, 'nudge', due.key);
      if (!sendId) continue;
      budget -= 1;
      const send = await sendEmail(admin, {
        templateId: 'self_serve_nudge',
        to: owner.email,
        recipientUserId: team.owner_id,
        trigger: `self_serve_nudge_${due.key}`,
        idempotencyKey: `self-serve-nudge:${team.id}:${due.key}`,
        props: {
          variant: due.variant,
          plan: checklist.plan,
          releaseTitle: checklist.focusReleaseTitle,
          taskCount: checklist.focusTaskCount,
          recipientName: owner.name,
          ctaUrl: lifecycleClickUrl(sendId, nudgeDestination(due.variant, checklist.focusReleaseId)),
        },
      });
      if (send.ok && !send.skipped) {
        result.sent += 1;
        await trackSelfServe(team.owner_id, 'nudge_sent', {
          path: 'self_serve',
          plan: checklist.plan,
          step: due.key,
        });
      } else {
        result.skipped += 1;
      }
    }
  } catch (error) {
    console.error('[self-serve] nudge sweep failed', error instanceof Error ? error.message : error);
  }
  return result;
}

/** Whether this owner's last paid plan checkout was in US dollars (#1120).
 *  False on any doubt, so the reminder falls back to the Naira wording. */
async function lastPaidInDollars(admin: Admin, ownerUserId: string): Promise<boolean> {
  const last = await admin
    .from('bachs_checkouts')
    .select('currency,purpose')
    .eq('user_id', ownerUserId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(5);
  if (last.error) return false;
  const plan = ((last.data ?? []) as Array<{ currency: string | null; purpose: string | null }>).find(
    (row) => (row.purpose ?? 'plan') === 'plan'
  );
  return String(plan?.currency ?? '').toUpperCase() === 'USD';
}

export async function runRenewalReminderSweep(admin: Admin, now = new Date()): Promise<LifecycleRunResult> {
  const result: LifecycleRunResult = { sent: 0, skipped: 0, deferred: 0 };
  try {
    const teams = await admin
      .from('workspaces')
      .select('id,owner_id,name,payment_method')
      .in('payment_method', ['transfer', 'direct_transfer'])
      .limit(1000);
    if (teams.error) return result;
    let budget = await readBudget(admin, now);
    const horizon = new Date(now.getTime() + 8 * DAY_MS).toISOString();
    // A card Bachs charges by itself (#1266) renews itself: no reminder to pay.
    const selfRenewing = await loadSelfRenewingUserIds(admin);

    for (const team of (teams.data ?? []) as Array<{ id: string; owner_id: string; payment_method: string }>) {
      const sub = await admin
        .from('subscriptions')
        .select('plan,billing_interval,status,expires_at')
        .eq('user_id', team.owner_id)
        .maybeSingle();
      const row = sub.data as {
        plan: string | null;
        billing_interval: string | null;
        status: string | null;
        expires_at: string | null;
      } | null;
      if (selfRenewing.has(team.owner_id)) continue;
      if (sub.error || !row?.expires_at || row.status !== 'active') continue;
      if (row.expires_at > horizon || !isCheckoutPlan(row.plan)) continue;
      const sentKeys = await loadSentKeys(admin, team.id, 'renewal_reminder');
      if (sentKeys === null) continue;
      const due = renewalReminderDue({ expiresAt: row.expires_at, now, sentKeys });
      if (!due) continue;
      if (budget <= 0) {
        result.deferred += 1;
        continue;
      }
      const owner = await readOwner(admin, team.owner_id);
      if (!owner) continue;
      const sendId = await reserveSend(admin, team.id, 'renewal_reminder', due.key);
      if (!sendId) continue;
      budget -= 1;
      const period = isCheckoutPeriod(row.billing_interval) ? row.billing_interval : 'monthly';
      // A team that last paid in US dollars through Bachs (#1120) is reminded
      // in dollars and sent to the checkout page, not to a bank transfer.
      const usdPrice = (await lastPaidInDollars(admin, team.owner_id)) ? getTierPriceUsd(row.plan, period) : null;
      const account = usdPrice ? null : await loadPaymentAccount(admin, team.owner_id);
      const renewPath = usdPrice
        ? checkoutPath({ plan: row.plan, period })
        : `${checkoutPath({ plan: row.plan, period })}&method=transfer`;
      const send = await sendEmail(admin, {
        templateId: 'renewal_reminder',
        to: owner.email,
        recipientUserId: team.owner_id,
        trigger: `renewal_reminder_${due.days}`,
        idempotencyKey: `renewal-reminder:${team.id}:${due.key}`,
        props: {
          recipientName: owner.name,
          plan: row.plan,
          expiresAt: row.expires_at,
          amountNaira: usdPrice
            ? null
            : (getChargePrice(row.plan, period, await loadIntroMonthsLeft(admin, team.owner_id))?.amount ?? null),
          amountUsd: usdPrice?.amount ?? null,
          account: account
            ? { bankName: account.bankName, accountNumber: account.accountNumber, accountName: account.accountName }
            : null,
          renewUrl: lifecycleClickUrl(sendId, renewPath),
        },
      });
      if (send.ok && !send.skipped) {
        result.sent += 1;
        await trackSelfServe(team.owner_id, 'renewal_reminder_sent', {
          path: 'self_serve',
          plan: row.plan,
          method: team.payment_method === 'direct_transfer' ? 'direct_transfer' : 'transfer',
          days: due.days,
        });
      } else {
        result.skipped += 1;
      }
    }
  } catch (error) {
    console.error('[self-serve] renewal sweep failed', error instanceof Error ? error.message : error);
  }
  return result;
}
