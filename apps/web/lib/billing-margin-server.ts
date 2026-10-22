import type { SupabaseClient } from '@supabase/supabase-js';
import { INTERVAL_MONTHS, isPricingTierId } from '@urganize/pricing';
import { resolveBillingInterval } from './billing-plans';
import {
  marginRow,
  marginTotals,
  readCreditCostKobo,
  readFixedCostsKobo,
  type MarginTeamRow,
  type MarginTotals,
} from './billing-margin';
import { loadLatestChargeChannels } from './referrals-server';
import { isDistributionEntitled, monthlyTrmFeeKobo, readTrmFeeConfig, type TrmFeeConfig } from './trm/partner-fee';

// The reads behind /admin/billing (founder, 2026-10-22). Read only: every query
// is a select. The arithmetic is lib/billing-margin.ts; this file only finds the
// paying teams and the facts each row needs.
//
// A PAYING TEAM is one whose owner holds a subscription that charged money
// (amount > 0) and whose period has not ended: active, past_due (Paystack still
// retrying) or cancelled-but-in-period. Our own accounts are left out by the
// caller's internal email set, the list every admin page uses.

const PAYING_STATUSES = ['active', 'past_due', 'cancelled'];

export type BillingMarginView = {
  rows: MarginTeamRow[];
  totals: MarginTotals;
  monthStart: string;
  creditCostKobo: number;
  fixedCostsKobo: number | null;
  trm: Pick<TrmFeeConfig, 'costBasis' | 'billingMode' | 'distributionRequiresPrepay'>;
  /** Reads that failed, by name, so the page can say which numbers are partial. */
  notRead: string[];
};

type SubscriptionRow = {
  user_id: string;
  plan: string | null;
  billing_interval: string | null;
  amount: number | null;
  expires_at: string | null;
};

/** The first day of this UTC month. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** What we owe TRM for one team's month, kobo. Fixed: the plan's annual fee
 *  over 12 when the plan includes distribution. Percent: the share of the
 *  month's cash. Upfront and pro-rata cost the same per month; only the timing
 *  of the bill differs, and the CSV is where timing shows. */
export function trmOwedMonthKobo(input: {
  plan: string;
  interval: ReturnType<typeof resolveBillingInterval>;
  cashMonthKobo: number;
  config: TrmFeeConfig;
}): number {
  const entitled = isDistributionEntitled({
    plan: input.plan,
    interval: input.interval,
    requiresPrepay: input.config.distributionRequiresPrepay,
  });
  if (!entitled) return 0;
  if (input.config.costBasis === 'percent' && input.config.revenueShareBps !== null) {
    return Math.round((input.cashMonthKobo * input.config.revenueShareBps) / 10_000);
  }
  return monthlyTrmFeeKobo(input.plan, input.config);
}

export async function loadBillingMargin(
  admin: SupabaseClient,
  input: { now: Date; isInternalEmail: (email: string) => boolean; env?: Record<string, string | undefined> }
): Promise<BillingMarginView> {
  const env = input.env ?? process.env;
  const config = readTrmFeeConfig(env);
  const creditCostKobo = readCreditCostKobo(env.CREDIT_COST_KOBO);
  const fixedCostsKobo = readFixedCostsKobo(env.FIXED_COSTS_MONTHLY_KOBO);
  const monthStart = monthStartUtc(input.now);
  const notRead: string[] = [];

  const subs = await admin
    .from('subscriptions')
    .select('user_id, plan, billing_interval, amount, expires_at')
    .in('status', PAYING_STATUSES)
    .gt('expires_at', input.now.toISOString())
    .gt('amount', 0)
    .limit(5000);
  if (subs.error) notRead.push('subscriptions');
  const subscriptions = ((subs.data ?? []) as SubscriptionRow[]).filter((row) => Boolean(row.plan));
  const ownerIds = [...new Set(subscriptions.map((row) => row.user_id))];

  const [profiles, workspaces, channels] = await Promise.all([
    ownerIds.length
      ? admin.from('profiles').select('id, email').in('id', ownerIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? admin.from('workspaces').select('id, name, owner_id').in('owner_id', ownerIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    loadLatestChargeChannels(admin, ownerIds),
  ]);
  if (profiles.error) notRead.push('profiles');
  if (workspaces.error) notRead.push('workspaces');

  const emailById = new Map<string, string>();
  for (const row of (profiles.data ?? []) as Array<{ id: string; email: string | null }>) {
    if (row.email) emailById.set(row.id, row.email);
  }
  const teamByOwner = new Map<string, { id: string; name: string }>();
  for (const row of (workspaces.data ?? []) as Array<{ id: string; name: string | null; owner_id: string }>) {
    if (!teamByOwner.has(row.owner_id)) teamByOwner.set(row.owner_id, { id: row.id, name: row.name || 'Unnamed team' });
  }

  const paying = subscriptions.filter((row) => {
    const email = emailById.get(row.user_id);
    return !(email && input.isInternalEmail(email));
  });

  const workspaceIds = paying
    .map((row) => teamByOwner.get(row.user_id)?.id)
    .filter((id): id is string => Boolean(id));
  const creditsUsed = new Map<string, number>();
  if (workspaceIds.length) {
    const ledger = await admin
      .from('credit_ledger')
      .select('workspace_id, kind, credits')
      .in('workspace_id', workspaceIds.slice(0, 1000))
      .in('kind', ['spend', 'refund'])
      .gte('created_at', monthStart.toISOString())
      .limit(20000);
    if (ledger.error) notRead.push('credit_ledger');
    for (const row of (ledger.data ?? []) as Array<{ workspace_id: string | null; credits: number | null }>) {
      if (!row.workspace_id) continue;
      // Spends are written negative and refunds positive, so the net is minus the sum.
      creditsUsed.set(row.workspace_id, (creditsUsed.get(row.workspace_id) ?? 0) - Number(row.credits ?? 0));
    }
  }

  const rows: MarginTeamRow[] = paying.map((sub) => {
    const plan = String(sub.plan);
    const interval = resolveBillingInterval({ plan, storedInterval: sub.billing_interval });
    const team = teamByOwner.get(sub.user_id);
    const periodAmountKobo = Math.max(0, Math.round(Number(sub.amount) || 0));
    const cashMonthKobo = Math.round(periodAmountKobo / INTERVAL_MONTHS[interval]);
    return marginRow(
      {
        workspaceId: team?.id ?? sub.user_id,
        teamName: team?.name ?? 'Team not found',
        plan: isPricingTierId(plan) ? plan : `${plan} (legacy)`,
        interval,
        channel: channels.get(sub.user_id) ?? 'other',
        periodAmountKobo,
        trmOwedMonthKobo: trmOwedMonthKobo({ plan, interval, cashMonthKobo, config }),
        creditsUsed: Math.max(0, team ? (creditsUsed.get(team.id) ?? 0) : 0),
      },
      creditCostKobo
    );
  });
  rows.sort((a, b) => b.contributionKobo - a.contributionKobo);

  return {
    rows,
    totals: marginTotals(rows, fixedCostsKobo),
    monthStart: monthStart.toISOString(),
    creditCostKobo,
    fixedCostsKobo,
    trm: {
      costBasis: config.costBasis,
      billingMode: config.billingMode,
      distributionRequiresPrepay: config.distributionRequiresPrepay,
    },
    notRead,
  };
}
