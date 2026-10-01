import type { SupabaseClient } from '@supabase/supabase-js';
import { monthlyAllowanceCredits, splitSpend, type TeamForAllowance } from './allowance';
import type { TurnCharge, UsageCall } from './pricing';
import { readBillingAnchor } from '@/lib/urgans-usage-server';
import { resolveUsageWindow } from '@/lib/urgans-usage';

/**
 * The credit ledger: reading what a team has, granting the monthly allowance,
 * and charging a turn. The ledger itself is described in
 * supabase/migrations/20261001120000_credit_ledger.sql.
 *
 * FAILS OPEN, consistent with the seat cap, the release cap and the old monthly
 * ceiling: an unreadable balance means "do not block the turn". A database blip
 * costs a few free turns; refusing a paying customer their assistant because our
 * own table hiccuped is the worse mistake. The one thing that must not fail
 * quietly is a LOST CHARGE, so every write here logs loudly, and the turn's cost
 * is also written onto its billing event (metadata.credits) where it can be
 * reconciled against the ledger.
 *
 * NEVER THROWS, for the same reason `recordUrgansAction` does not: the turn the
 * user waited for has already succeeded.
 *
 * KNOWN LIMIT, accepted: the balance is read before a turn and the charge is
 * written after it, with no lock between. Ten messages sent in parallel all see
 * the same balance and all pass, so a team can overshoot by the cost of the turns
 * already in flight. The overshoot is bounded by the turns it can start at once
 * and lands as a negative top-up balance that blocks the next turn. A true hold
 * would need a reserve row per turn; at today's volume that is not worth the
 * moving parts.
 */

const TABLE = 'credit_ledger';
const UNIQUE_VIOLATION = '23505';

export type CreditBalances = { allowance: number; topup: number; total: number };

export type CreditSnapshot = CreditBalances & {
  /** This window's allowance as granted, for "x of y". */
  monthlyAllowance: number;
  /** First day of the window the allowance belongs to, YYYY-MM-DD (UTC). */
  windowStart: string;
  /** When the allowance resets, ISO. */
  resetsAt: string;
};

const toDay = (date: Date): string => date.toISOString().slice(0, 10);

const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Both balances for a team, or null when they cannot be read. */
export async function readBalances(
  client: SupabaseClient,
  workspaceId: string,
  windowStart: string
): Promise<CreditBalances | null> {
  try {
    const { data, error } = await client.rpc('credit_balances', { p_workspace: workspaceId, p_window: windowStart });
    if (error) {
      console.error('[credits] could not read the balance:', error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowance?: unknown; topup?: unknown } | null | undefined;
    if (!row) return { allowance: 0, topup: 0, total: 0 };
    const allowance = asNumber(row.allowance);
    const topup = asNumber(row.topup);
    return { allowance, topup, total: allowance + topup };
  } catch (error) {
    console.error('[credits] could not read the balance:', error);
    return null;
  }
}

/**
 * Give a team its allowance for the window, once. The dedupe key is what makes it
 * once: every request tries, the first wins, and the rest hit the unique index
 * (23505) and count as success. Returns false only when the grant could not be
 * written and is not already there.
 */
export async function ensureAllowance(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null; windowStart: string; credits: number }
): Promise<boolean> {
  try {
    const { error } = await client.from(TABLE).insert({
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      pool: 'allowance',
      kind: 'allowance',
      credits: input.credits,
      window_start: input.windowStart,
      dedupe_key: `allowance:${input.workspaceId}:${input.windowStart}`,
      metadata: { source: 'monthly_allowance' },
    });
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error('[credits] could not grant the monthly allowance:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[credits] could not grant the monthly allowance:', error);
    return false;
  }
}

/**
 * A team's credits right now: finds the billing window it is in, grants the
 * allowance for it if this is the first look this window, and reads both pools.
 * Null when the balance cannot be read, which callers treat as "do not enforce".
 */
export async function getCreditSnapshot(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null; team: TeamForAllowance; now?: Date }
): Promise<CreditSnapshot | null> {
  const anchorIso = await readBillingAnchor(client, input.ownerUserId);
  const window = resolveUsageWindow({ now: input.now ?? new Date(), anchorIso });
  const windowStart = toDay(window.start);
  const monthlyAllowance = monthlyAllowanceCredits(input.team);

  await ensureAllowance(client, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    windowStart,
    credits: monthlyAllowance,
  });

  const balances = await readBalances(client, input.workspaceId, windowStart);
  if (!balances) return null;
  return { ...balances, monthlyAllowance, windowStart, resetsAt: window.end.toISOString() };
}

export type SettleInput = {
  workspaceId: string;
  ownerUserId: string | null;
  actorUserId: string;
  /** Identifies this turn, so charging it twice charges it once. */
  requestId: string;
  windowStart: string;
  charge: TurnCharge;
  calls: readonly UsageCall[];
  /** The balances the turn started with, to split the charge. Read again when absent. */
  balances?: CreditBalances | null;
};

/**
 * Charge a turn: one ledger row per pool it drew on. Never throws. A turn that
 * cost nothing writes nothing.
 */
export async function settleTurn(client: SupabaseClient, input: SettleInput): Promise<void> {
  if (input.charge.credits <= 0) return;
  try {
    const balances = input.balances ?? (await readBalances(client, input.workspaceId, input.windowStart));
    // Unreadable: put it on the allowance pool, where nearly every turn lands, so
    // a charge is recorded somewhere rather than dropped.
    const { fromAllowance, fromTopup } = splitSpend(
      input.charge.credits,
      balances ?? { allowance: input.charge.credits, topup: 0 }
    );

    const models = [...new Set(input.calls.map((call) => call.model))];
    const metadata = {
      models,
      calls: input.calls.length,
      tokens_in: sum(input.calls.map((call) => call.promptTokens)),
      tokens_out: sum(input.calls.map((call) => call.completionTokens)),
      tokens_cached: sum(input.calls.map((call) => call.cachedTokens)),
      assumed: input.charge.assumed,
      charge_credits: input.charge.credits,
    };

    const rows: Array<Record<string, unknown>> = [];
    const base = {
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      actor_user_id: input.actorUserId,
      kind: 'spend',
      metadata,
    };
    // The provider cost belongs to the turn, not to either half of it, so it rides on
    // the first row written and the second carries the share it covers.
    const costFor = (credits: number): number =>
      Math.round(input.charge.rodi * (credits / input.charge.credits) * 1000) / 1000;

    if (fromAllowance > 0) {
      rows.push({
        ...base,
        pool: 'allowance',
        credits: -fromAllowance,
        window_start: input.windowStart,
        dedupe_key: `spend:${input.requestId}:allowance`,
        provider_cost_rodi: costFor(fromAllowance),
      });
    }
    if (fromTopup > 0) {
      rows.push({
        ...base,
        pool: 'topup',
        credits: -fromTopup,
        dedupe_key: `spend:${input.requestId}:topup`,
        provider_cost_rodi: costFor(fromTopup),
      });
    }

    for (const row of rows) {
      const { error } = await client.from(TABLE).insert(row);
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.error(
          `[credits] LOST CHARGE: could not record ${String(row.credits)} credits for ${input.requestId}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error(`[credits] LOST CHARGE: could not settle ${input.requestId}:`, error);
  }
}

const sum = (values: Array<number | null>): number => values.reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * Add or take away top-up credits by hand (the admin route): a purchase later,
 * a goodwill grant or a correction today. Written to the top-up pool because that
 * is the pool that does not expire. Never throws; returns whether it landed.
 */
export async function adjustCredits(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string;
    credits: number;
    note?: string;
    dedupeKey?: string;
  }
): Promise<boolean> {
  const credits = Math.trunc(input.credits);
  if (!Number.isFinite(credits) || credits === 0) return false;
  try {
    const { error } = await client.from(TABLE).insert({
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      actor_user_id: input.actorUserId,
      pool: 'topup',
      kind: 'adjust',
      credits,
      ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {}),
      metadata: { source: 'admin', ...(input.note ? { note: input.note.slice(0, 200) } : {}) },
    });
    if (error) {
      console.error('[credits] could not adjust credits:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[credits] could not adjust credits:', error);
    return false;
  }
}
