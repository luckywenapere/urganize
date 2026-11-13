import type { SupabaseClient } from '@supabase/supabase-js';
import { INTERVAL_MONTHS, isPricingTierId } from '@urganize/pricing';
import { isPaymentChannel, type PaymentChannel } from './billing-margin';
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
import { loadTrmCostThisMonth } from './trm/partner-ledger-server';

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

/** What we owe TRM for one team's month, kobo. trm_plan: only what the
 *  ledger holds for a team that sent a release (a month's fee, or a twelfth of
 *  a yearly plan), so a team that never distributes costs nothing. Other fixed
 *  modes: the plan's fee per month when the plan includes distribution.
 *  Percent: the share of the month's cash. */
export function trmOwedMonthKobo(input: {
  plan: string;
  interval: ReturnType<typeof resolveBillingInterval>;
  cashMonthKobo: number;
  config: TrmFeeConfig;
  /** trm_plan only: this team's ledger cost for the month, or 0 if it sent nothing. */
  usedMonthKobo?: number;
}): number {
  const entitled = isDistributionEntitled({
    plan: input.plan,
    interval: input.interval,
    requiresPrepay: input.config.distributionRequiresPrepay,
  });
  if (!entitled) return 0;
  if (input.config.costBasis === 'fixed' && input.config.billingMode === 'trm_plan') {
    return Math.max(0, Math.round(input.usedMonthKobo ?? 0));
  }
  if (input.config.costBasis === 'percent' && input.config.revenueShareBps !== null) {
    return Math.round((input.cashMonthKobo * input.config.revenueShareBps) / 10_000);
  }
  return monthlyTrmFeeKobo(input.plan, input.config, input.interval);
}

/**
 * Owners who pay in US dollars through Bachs (#1266): a paid dollar checkout,
 * or a card Bachs charges by itself. Their fee is the dollar-card one. A read
 * that fails leaves the set short, which prices that team at the Naira rate.
 */
async function loadDollarPayers(admin: SupabaseClient, ownerIds: string[]): Promise<Set<string>> {
  const payers = new Set<string>();
  if (!ownerIds.length) return payers;
  const ids = ownerIds.slice(0, 1000);
  const [checkouts, invoices] = await Promise.all([
    admin.from('bachs_checkouts').select('user_id, purpose').eq('status', 'paid').eq('currency', 'USD').in('user_id', ids).limit(5000),
    admin.from('bachs_subscription_invoices').select('user_id').in('user_id', ids).limit(5000),
  ]);
  for (const row of (checkouts.data ?? []) as Array<{ user_id: string; purpose: string | null }>) {
    if ((row.purpose ?? 'plan') === 'plan') payers.add(row.user_id);
  }
  for (const row of (invoices.data ?? []) as Array<{ user_id: string }>) payers.add(row.user_id);
  return payers;
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

  const [profiles, workspaces, channels, dollarPayers] = await Promise.all([
    ownerIds.length
      ? admin.from('profiles').select('id, email').in('id', ownerIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? admin
          .from('workspaces')
          .select('id, name, owner_id, payment_method, acquisition_path')
          .in('owner_id', ownerIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    loadLatestChargeChannels(admin, ownerIds),
    loadDollarPayers(admin, ownerIds),
  ]);
  if (profiles.error) notRead.push('profiles');
  if (workspaces.error) notRead.push('workspaces');

  const emailById = new Map<string, string>();
  for (const row of (profiles.data ?? []) as Array<{ id: string; email: string | null }>) {
    if (row.email) emailById.set(row.id, row.email);
  }
  type TeamFacts = { id: string; name: string; method: PaymentChannel | null; path: string | null };
  const teamByOwner = new Map<string, TeamFacts>();
  for (const row of (workspaces.data ?? []) as Array<{
    id: string;
    name: string | null;
    owner_id: string;
    payment_method: string | null;
    acquisition_path: string | null;
  }>) {
    if (teamByOwner.has(row.owner_id)) continue;
    teamByOwner.set(row.owner_id, {
      id: row.id,
      name: row.name || 'Unnamed team',
      method: isPaymentChannel(row.payment_method) ? row.payment_method : null,
      path: row.acquisition_path,
    });
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

  // trm_plan: a team costs TRM only in a month a ledger row covers (made when
  // it sent a release). A yearly plan counts a twelfth a month.
  let trmUsed = new Map<string, number>();
  if (workspaceIds.length && config.costBasis === 'fixed' && config.billingMode === 'trm_plan') {
    const used = await loadTrmCostThisMonth(admin, { workspaceIds, monthStart, now: input.now });
    if (used) trmUsed = used;
    else notRead.push('trm_partner_ledger');
  }

  const rows: MarginTeamRow[] = paying.map((sub) => {
    const plan = String(sub.plan);
    const interval = resolveBillingInterval({ plan, storedInterval: sub.billing_interval });
    const team = teamByOwner.get(sub.user_id);
    const periodAmountKobo = Math.max(0, Math.round(Number(sub.amount) || 0));
    const cashMonthKobo = Math.round(periodAmountKobo / INTERVAL_MONTHS[interval].covers);
    return marginRow(
      {
        workspaceId: team?.id ?? sub.user_id,
        teamName: team?.name ?? 'Team not found',
        plan: isPricingTierId(plan) ? plan : `${plan} (legacy)`,
        interval,
        // The latest charge says how they paid; before any charge is recorded,
        // the team's own payment_method (self-serve checkout) does.
        channel: channels.get(sub.user_id) ?? team?.method ?? 'other',
        dollars: dollarPayers.has(sub.user_id),
        path: team?.path ?? null,
        periodAmountKobo,
        trmOwedMonthKobo: trmOwedMonthKobo({
          plan,
          interval,
          cashMonthKobo,
          config,
          usedMonthKobo: team ? (trmUsed.get(team.id) ?? 0) : 0,
        }),
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
