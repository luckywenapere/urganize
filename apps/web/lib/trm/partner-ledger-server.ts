import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingInterval } from '@urganize/pricing';
import { afterResponse } from '../after-response';
import { notifyFounder } from '../billing-alerts-server';
import { isMissingColumnError, isMissingTableError } from '../billing-schema';
import { loadTeamDistribution } from '../distribution-team-server';
import {
  ledgerEntryForPayment,
  readTrmFeeConfig,
  type TrmFeeConfig,
  type TrmLedgerCsvRow,
} from './partner-fee';

// The ONLY writer of trm_partner_ledger, and of workspaces.trm_registered_at /
// trm_plan. Two entry points:
//   recordTrmFeeForSend (trm_plan, the default since 2026-10-26): called from
//     submitToTrm. We owe TRM only when a team on a plan with distribution
//     actually sends a release: the first send buys TRM's monthly plan for a
//     monthly team (1 month) or its yearly plan for a prepaid team (12 months),
//     and later sends inside that period add nothing. A team that never sends
//     costs nothing and is never registered on TRM.
//   recordTrmFeeForPayment (monthly_prorata, annual_upfront, percent): called
//     from recordSubscriptionCharge (lib/referrals-server.ts) after the money
//     has landed. Plan-change top-ups are skipped there. On trm_plan it does
//     nothing.
// Never throws: what we owe TRM is a record, and a failure to write it must
// never fail the payment or the send that caused it. A failure is logged with
// the reference so it can be added by hand.
//
// Before 20261022170000_trm_fee_and_price_lock.sql is applied the table is
// missing: the write logs once per call and returns.

type Admin = SupabaseClient;

export async function recordTrmFeeForPayment(
  admin: Admin,
  input: {
    userId: string;
    reference: string;
    plan: string | null | undefined;
    interval: BillingInterval;
    amountPaidKobo: number;
    chargedAt: Date;
    /** The owner's team, when the caller already looked it up. */
    workspaceId?: string | null;
    config?: TrmFeeConfig;
  }
): Promise<void> {
  try {
    const config = input.config ?? readTrmFeeConfig();
    // trm_plan is recorded when a release is sent, not when a team pays.
    if (config.costBasis === 'fixed' && config.billingMode === 'trm_plan') return;
    let workspaceId = input.workspaceId ?? null;
    if (!workspaceId) {
      const workspaceResult = await admin
        .from('workspaces')
        .select('id')
        .eq('owner_id', input.userId)
        .maybeSingle();
      workspaceId = (workspaceResult.data as { id: string } | null)?.id ?? null;
    }

    let upfrontCoveredUntil: Date | null = null;
    if (config.costBasis === 'fixed' && config.billingMode === 'annual_upfront' && workspaceId) {
      const latest = await admin
        .from('trm_partner_ledger')
        .select('period_end')
        .eq('workspace_id', workspaceId)
        .eq('entry_kind', 'upfront')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.error && isMissingTableError(latest.error)) {
        console.warn('[trm-ledger] table missing; apply the TRM fee migration. Not recorded:', input.reference);
        return;
      }
      const end = (latest.data as { period_end: string } | null)?.period_end;
      upfrontCoveredUntil = end ? new Date(end) : null;
    }

    const entry = ledgerEntryForPayment({
      plan: input.plan,
      interval: input.interval,
      amountPaidKobo: input.amountPaidKobo,
      chargedAt: input.chargedAt,
      config,
      upfrontCoveredUntil,
    });
    if (!entry) return;

    const insert = await admin.from('trm_partner_ledger').upsert(
      {
        workspace_id: workspaceId,
        charge_reference: input.reference,
        entry_kind: entry.entryKind,
        plan: entry.plan,
        trm_plan: entry.trmPlan,
        cost_basis: entry.costBasis,
        billing_mode: entry.billingMode,
        fee_annual_kobo: entry.feeAnnualKobo,
        revenue_share_bps: entry.revenueShareBps,
        service_months: entry.serviceMonths,
        amount_paid_kobo: entry.amountPaidKobo,
        owed_kobo: entry.owedKobo,
        period_start: entry.periodStart.toISOString(),
        period_end: entry.periodEnd.toISOString(),
      },
      { onConflict: 'charge_reference,entry_kind', ignoreDuplicates: true }
    );
    if (insert.error) {
      if (isMissingTableError(insert.error)) {
        console.warn('[trm-ledger] table missing; apply the TRM fee migration. Not recorded:', input.reference);
      } else {
        console.error('[trm-ledger] could not record what we owe TRM:', insert.error.message, input.reference);
      }
      return;
    }

    if (workspaceId) await markTrmRegistered(admin, workspaceId, input.userId, entry.trmPlan, input.chargedAt);
  } catch (error) {
    console.error('[trm-ledger] recording threw:', error, input.reference);
  }
}

/**
 * What one send to TRM adds to the ledger, on trm_plan. Reads the team owner's
 * plan the same way the Distribute step does (decideDistributionAccess): only
 * a paying Manager or Label team owes anything. A team on Solo, a trial or no
 * plan sends with the artist's own TRM plan, which costs us nothing.
 */
export async function recordTrmFeeForSend(
  admin: Admin,
  input: { ownerUserId: string; releaseId: string; attempt: number; sentAt: Date; config?: TrmFeeConfig }
): Promise<void> {
  const reference = `send:${input.releaseId}:${input.attempt}`;
  try {
    const config = input.config ?? readTrmFeeConfig();
    if (config.costBasis !== 'fixed' || config.billingMode !== 'trm_plan' || !input.ownerUserId) return;

    const { decision, workspaceId } = await loadTeamDistribution(admin, input.ownerUserId);
    if (decision.state !== 'included') return;
    if (!workspaceId) return;

    // Any TRM plan we already bought for this team that still runs covers this
    // send. Extra releases (adjustment rows) are single releases, not a plan.
    const latest = await admin
      .from('trm_partner_ledger')
      .select('period_end')
      .eq('workspace_id', workspaceId)
      .neq('entry_kind', 'adjustment')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) {
      if (isMissingTableError(latest.error)) {
        console.warn('[trm-ledger] table missing; apply the TRM fee migration. Not recorded:', reference);
      } else {
        console.error('[trm-ledger] could not read the ledger:', latest.error.message, reference);
      }
      return;
    }
    const end = (latest.data as { period_end: string } | null)?.period_end;

    const entry = ledgerEntryForPayment({
      plan: decision.tier,
      interval: decision.interval,
      amountPaidKobo: 0,
      chargedAt: input.sentAt,
      config,
      upfrontCoveredUntil: end ? new Date(end) : null,
    });
    if (!entry) return;

    const insert = await admin.from('trm_partner_ledger').upsert(
      {
        workspace_id: workspaceId,
        charge_reference: reference,
        entry_kind: entry.entryKind,
        plan: entry.plan,
        trm_plan: entry.trmPlan,
        cost_basis: entry.costBasis,
        billing_mode: entry.billingMode,
        fee_annual_kobo: entry.feeAnnualKobo,
        revenue_share_bps: entry.revenueShareBps,
        service_months: entry.serviceMonths,
        amount_paid_kobo: entry.amountPaidKobo,
        owed_kobo: entry.owedKobo,
        period_start: entry.periodStart.toISOString(),
        period_end: entry.periodEnd.toISOString(),
      },
      { onConflict: 'charge_reference,entry_kind', ignoreDuplicates: true }
    );
    if (insert.error) {
      console.error('[trm-ledger] could not record what we owe TRM:', insert.error.message, reference);
      return;
    }
    await markTrmRegistered(admin, workspaceId, input.ownerUserId, entry.trmPlan, input.sentAt);
  } catch (error) {
    console.error('[trm-ledger] recording a send threw:', error, reference);
  }
}

/**
 * One extra release a team paid us ₦2,100 for (lib/distribution-limits-server.ts
 * calls this once, when the payment settles): we owe TRM its per-release price.
 * An 'adjustment' row, so it never counts as a TRM plan covering later sends.
 * Keyed on the Paystack reference, so a webhook and a callback settling the
 * same payment write one row.
 */
export async function recordTrmExtraRelease(
  admin: Admin,
  input: { workspaceId: string; reference: string; tier: 'manager' | 'label'; priceKobo: number; paidAt: Date }
): Promise<'recorded' | 'error'> {
  const reference = `extra:${input.reference}`;
  const end = new Date(input.paidAt);
  end.setMonth(end.getMonth() + 1);
  const insert = await admin.from('trm_partner_ledger').upsert(
    {
      workspace_id: input.workspaceId,
      charge_reference: reference,
      entry_kind: 'adjustment',
      plan: input.tier,
      trm_plan: input.tier === 'label' ? 'label' : 'single_artist',
      cost_basis: 'fixed',
      billing_mode: 'trm_plan',
      fee_annual_kobo: null,
      revenue_share_bps: null,
      service_months: 1,
      amount_paid_kobo: input.priceKobo,
      owed_kobo: input.priceKobo,
      period_start: input.paidAt.toISOString(),
      period_end: end.toISOString(),
    },
    { onConflict: 'charge_reference,entry_kind', ignoreDuplicates: true }
  );
  if (insert.error) {
    console.error('[trm-ledger] could not record an extra release:', insert.error.message, reference);
    return 'error';
  }
  return 'recorded';
}

/** Stamp the team as registered on TRM the first time, and tell the founder to
 *  do the registration (TRM's API has no account creation). A later payment on
 *  a different tier updates trm_plan without a second alert. */
async function markTrmRegistered(
  admin: Admin,
  workspaceId: string,
  ownerUserId: string,
  trmPlan: string,
  at: Date
): Promise<void> {
  const first = await admin
    .from('workspaces')
    .update({ trm_registered_at: at.toISOString(), trm_plan: trmPlan })
    .eq('id', workspaceId)
    .is('trm_registered_at', null)
    .select('id');
  if (first.error) {
    if (!isMissingColumnError(first.error)) {
      console.error('[trm-ledger] could not stamp trm_registered_at:', first.error.message);
    }
    return;
  }
  const newlyRegistered = Array.isArray(first.data) && first.data.length > 0;
  if (newlyRegistered) {
    afterResponse('trm registration alert', () =>
      notifyFounder(admin, {
        kind: 'trm_registration_needed',
        workspaceId,
        ownerUserId,
        actorUserId: ownerUserId,
        note: `Register this team on TRM under the ${trmPlan === 'label' ? 'Mini Label' : 'Independent Artist'} plan.`,
        metadata: { trmPlan },
      })
    );
    return;
  }
  const update = await admin
    .from('workspaces')
    .update({ trm_plan: trmPlan })
    .eq('id', workspaceId)
    .neq('trm_plan', trmPlan);
  if (update.error && !isMissingColumnError(update.error)) {
    console.error('[trm-ledger] could not update trm_plan:', update.error.message);
  }
}

/** trm_plan: each team's TRM cost for the month, from ledger rows that cover
 *  it (a monthly plan's fee, or a twelfth of a yearly plan). A team with no row
 *  sent nothing and is absent. Null when the table cannot be read. */
export async function loadTrmCostThisMonth(
  admin: Admin,
  input: { workspaceIds: string[]; monthStart: Date; now: Date }
): Promise<Map<string, number> | null> {
  const rows = await admin
    .from('trm_partner_ledger')
    .select('workspace_id, owed_kobo, service_months')
    .in('workspace_id', input.workspaceIds.slice(0, 1000))
    .gt('period_end', input.monthStart.toISOString())
    .lte('period_start', input.now.toISOString())
    .limit(5000);
  if (rows.error) {
    if (!isMissingTableError(rows.error)) console.error('[trm-ledger] read failed:', rows.error.message);
    return null;
  }
  const cost = new Map<string, number>();
  for (const row of (rows.data ?? []) as Array<{ workspace_id: string | null; owed_kobo: number | null; service_months: number | null }>) {
    if (!row.workspace_id) continue;
    const perMonth = Number(row.owed_kobo ?? 0) / Math.max(1, Number(row.service_months ?? 1));
    cost.set(row.workspace_id, (cost.get(row.workspace_id) ?? 0) + perMonth);
  }
  return cost;
}

/** Ledger rows whose period starts in [from, to), with team names, for the CSV
 *  and the admin view. Null when the table cannot be read. */
export async function loadTrmLedger(
  admin: Admin,
  range: { from: Date; to: Date }
): Promise<TrmLedgerCsvRow[] | null> {
  const rows = await admin
    .from('trm_partner_ledger')
    .select(
      'charge_reference, workspace_id, entry_kind, plan, trm_plan, cost_basis, billing_mode, fee_annual_kobo, revenue_share_bps, service_months, amount_paid_kobo, owed_kobo, period_start, period_end'
    )
    .gte('period_start', range.from.toISOString())
    .lt('period_start', range.to.toISOString())
    .order('period_start', { ascending: true })
    .limit(5000);
  if (rows.error) {
    if (!isMissingTableError(rows.error)) console.error('[trm-ledger] read failed:', rows.error.message);
    return null;
  }
  const data = (rows.data ?? []) as Array<Omit<TrmLedgerCsvRow, 'team_name'>>;
  const ids = [...new Set(data.map((row) => row.workspace_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const teams = await admin.from('workspaces').select('id, name').in('id', ids.slice(0, 500));
    for (const team of (teams.data ?? []) as Array<{ id: string; name: string | null }>) {
      if (team.name) names.set(team.id, team.name);
    }
  }
  return data.map((row) => ({
    ...row,
    team_name: row.workspace_id ? (names.get(row.workspace_id) ?? null) : null,
  }));
}
