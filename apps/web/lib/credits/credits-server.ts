import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CREDIT_SOURCES,
  TRIAL_CREDITS,
  creditAccount,
  monthlyAllowanceCredits,
  splitSpend,
  type CreditAccount,
  type SourceBalances,
  type TeamForAllowance,
} from './allowance';
import type { TurnCharge, UsageCall } from './pricing';
import type { LedgerHistoryRow } from './history';
import { purchaseDedupeKey } from './purchase';
import { readBillingAnchor } from '@/lib/urgans-usage-server';
import { resolveUsageWindow } from '@/lib/urgans-usage';
import { shortfall, type OverageState } from './overage';
import { readOverageState, recordOverage } from './overage-server';

/**
 * The credit ledger: reading what a team has, granting what it is owed, and
 * charging a turn. The ledger itself is described in
 * supabase/migrations/20261001120000_credit_ledger.sql and reshaped by
 * 20261001130000_credit_ledger_sources.sql, which is the version this code
 * assumes: ONE balance that never expires, in three tagged sources (see
 * allowance.ts for the rules).
 *
 * FAILS OPEN, consistent with the seat cap, the release cap and the old monthly
 * ceiling: an unreadable balance means "do not block the turn". A database blip
 * costs a few free turns; refusing a paying customer their assistant because our
 * own table hiccuped is the worse mistake. The one thing that must not fail
 * quietly is a LOST CHARGE, so every write here logs loudly, and the turn's cost
 * is also written onto its billing event (metadata.credits) where it can be
 * reconciled against the ledger.
 *
 * The one exception to "fail open" runs the other way on purpose: REMOVING credits
 * (the leftover trial) only happens when we positively know nothing was bought.
 * If that cannot be established, nothing is taken.
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

export type CreditBalances = SourceBalances & { total: number };

export type CreditSnapshot = CreditBalances & {
  account: CreditAccount;
  /** The plan's monthly grant, or 0 for an account with no subscription. */
  monthlyAllowance: number;
  /** What "low" is measured against: the monthly grant, or the trial grant when there is none. */
  referenceCredits: number;
  /** When the next monthly grant lands, ISO. Null unless the account is a subscriber. */
  nextGrantAt: string | null;
  /** Paying for credits past the allowance (overage.ts): the cap, what was used
   *  this window and the room left. Null when the team cannot. */
  overage: OverageState | null;
  /** What a turn may spend: the balance (never below zero) plus the credits the
   *  cap still allows. Admission reads this, never `total`. */
  spendable: number;
};

const toDay = (date: Date): string => date.toISOString().slice(0, 10);

const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Rows a history page reads at a time. A turn that drew on several sources is up to three rows. */
export const HISTORY_PAGE_ROWS = 100;

/**
 * A page of a team's ledger, newest first, for the history screen. Selects ONLY
 * what a person may see (what happened, when, how many credits, and the little
 * metadata that names an action): never the provider's cost, which is ours.
 * `before` is the created_at of the last row of the previous page. Null when the
 * ledger cannot be read.
 */
export async function readLedgerHistory(
  client: SupabaseClient,
  workspaceId: string,
  options: { before?: string | null } = {}
): Promise<LedgerHistoryRow[] | null> {
  try {
    let query = client
      .from(TABLE)
      .select('id, kind, pool, credits, dedupe_key, metadata, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_PAGE_ROWS);
    if (options.before) query = query.lt('created_at', options.before);
    const { data, error } = await query;
    if (error) {
      console.error('[credits] could not read the history:', error.message);
      return null;
    }
    return (data ?? []) as LedgerHistoryRow[];
  } catch (error) {
    console.error('[credits] could not read the history:', error);
    return null;
  }
}

/** Every source's balance for a team, or null when they cannot be read. */
export async function readBalances(client: SupabaseClient, workspaceId: string): Promise<CreditBalances | null> {
  try {
    const { data, error } = await client.rpc('credit_balances', { p_workspace: workspaceId });
    if (error) {
      console.error('[credits] could not read the balance:', error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { trial?: unknown; allowance?: unknown; topup?: unknown }
      | null
      | undefined;
    if (!row) return { trial: 0, allowance: 0, topup: 0, total: 0 };
    const trial = asNumber(row.trial);
    const allowance = asNumber(row.allowance);
    const topup = asNumber(row.topup);
    return { trial, allowance, topup, total: trial + allowance + topup };
  } catch (error) {
    console.error('[credits] could not read the balance:', error);
    return null;
  }
}

/** Insert one grant, tolerating the unique key that makes a grant happen once. */
async function insertOnce(client: SupabaseClient, row: Record<string, unknown>, what: string): Promise<boolean> {
  try {
    const { error } = await client.from(TABLE).insert(row);
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error(`[credits] could not ${what}:`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[credits] could not ${what}:`, error);
    return false;
  }
}

/**
 * Give a subscriber its allowance for the billing window, once. The dedupe key is
 * what makes it once: every request tries, the first wins, and the rest hit the
 * unique index (23505) and count as success. The grant ADDS to the balance, so
 * what was not used last month is still there. Returns false only when the grant
 * could not be written and is not already there.
 */
export async function ensureAllowance(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null; windowStart: string; credits: number }
): Promise<boolean> {
  return insertOnce(
    client,
    {
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      pool: 'allowance',
      kind: 'allowance',
      credits: input.credits,
      window_start: input.windowStart,
      dedupe_key: `allowance:${input.workspaceId}:${input.windowStart}`,
      metadata: { source: 'monthly_allowance' },
    },
    'grant the monthly allowance'
  );
}

/** Give a trial its one-off credits, once per team, ever. */
export async function ensureTrialGrant(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null }
): Promise<boolean> {
  return insertOnce(
    client,
    {
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      pool: 'trial',
      kind: 'trial',
      credits: TRIAL_CREDITS,
      dedupe_key: `trial:${input.workspaceId}`,
      metadata: { source: 'trial_grant' },
    },
    'grant the trial credits'
  );
}

/**
 * Whether this team has ever paid for anything: a plan (the owner's `paid_at`,
 * which only a real charge writes) or a top-up (a ledger row of kind `topup`; an
 * admin adjustment is not a purchase). FAILS TOWARD "yes": the answer decides
 * whether credits are TAKEN AWAY, so anything that cannot be established means
 * nothing is removed.
 */
export async function hasEverPurchased(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null }
): Promise<boolean> {
  if (!input.ownerUserId) return true;
  try {
    const profile = await client.from('profiles').select('paid_at').eq('id', input.ownerUserId).maybeSingle();
    if (profile.error) return true;
    if ((profile.data as { paid_at?: string | null } | null)?.paid_at) return true;

    const topup = await client
      .from(TABLE)
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('kind', 'topup')
      .limit(1);
    if (topup.error) return true;
    return (topup.data?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

/**
 * Take back what is left of a trial that ended with nothing bought. One row, once
 * (its key names the team), tagged to the trial source so no other credit is
 * touched. Never removes more than is left.
 */
export async function expireTrialCredits(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null; credits: number }
): Promise<boolean> {
  const credits = Math.floor(input.credits);
  if (!(credits > 0)) return false;
  return insertOnce(
    client,
    {
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      pool: 'trial',
      kind: 'expire',
      credits: -credits,
      dedupe_key: `expire:trial:${input.workspaceId}`,
      metadata: { source: 'trial_ended_without_purchase' },
    },
    'remove the leftover trial credits'
  );
}

/**
 * A team's credits right now. Grants what it is owed first (a subscriber's
 * allowance for this billing window, or a trial's one-off credits), takes back an
 * ended trial's leftovers if nothing was bought, then reads the balance. Null when
 * the balance cannot be read, which callers treat as "do not enforce".
 *
 * The trial removal happens HERE, lazily, rather than in a job: a team whose trial
 * ended is walled, and the first time anything looks at its credits afterwards is
 * the only moment the removal matters.
 */
export async function getCreditSnapshot(
  client: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string | null; team: TeamForAllowance; now?: Date }
): Promise<CreditSnapshot | null> {
  const account = creditAccount(input.team);
  const monthlyAllowance = monthlyAllowanceCredits(input.team);
  let nextGrantAt: string | null = null;
  let overage: OverageState | null = null;

  if (monthlyAllowance > 0) {
    const anchorIso = await readBillingAnchor(client, input.ownerUserId);
    const window = resolveUsageWindow({ now: input.now ?? new Date(), anchorIso });
    nextGrantAt = window.end.toISOString();
    overage = await readOverageState(client, {
      workspaceId: input.workspaceId,
      team: input.team,
      windowStart: toDay(window.start),
      windowEnd: window.end.toISOString(),
    });
    await ensureAllowance(client, {
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      windowStart: toDay(window.start),
      credits: monthlyAllowance,
    });
  } else if (account === 'trial') {
    await ensureTrialGrant(client, { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId });
  }

  let balances = await readBalances(client, input.workspaceId);
  if (!balances) return null;

  if (input.team.state === 'walled' && balances.trial > 0) {
    const purchased = await hasEverPurchased(client, input);
    if (!purchased && (await expireTrialCredits(client, { ...input, credits: balances.trial }))) {
      balances = { ...balances, trial: 0, total: balances.allowance + balances.topup };
    }
  }

  return {
    ...balances,
    account,
    monthlyAllowance,
    referenceCredits: monthlyAllowance > 0 ? monthlyAllowance : TRIAL_CREDITS,
    nextGrantAt,
    overage,
    spendable: Math.max(0, balances.total) + (overage?.headroomCredits ?? 0),
  };
}

export type SettleInput = {
  workspaceId: string;
  ownerUserId: string | null;
  actorUserId: string;
  /** Identifies this turn, so charging it twice charges it once. */
  requestId: string;
  charge: TurnCharge;
  calls: readonly UsageCall[];
  /** The balances the turn started with, to split the charge. Read again when absent. */
  balances?: SourceBalances | null;
  /** Extra facts written onto every row, for a charge that is not a chat turn
   *  (an embedded action says which one, and whether it was capped). */
  context?: Record<string, unknown>;
};

/**
 * Charge a turn: one ledger row per source it drew on, trial first. Never throws.
 * A turn that cost nothing writes nothing.
 */
export async function settleTurn(client: SupabaseClient, input: SettleInput): Promise<void> {
  if (input.charge.credits <= 0) return;
  try {
    const balances = input.balances ?? (await readBalances(client, input.workspaceId));
    // Unreadable: put it on the allowance source, where nearly every turn lands, so
    // a charge is recorded somewhere rather than dropped.
    const split = splitSpend(input.charge.credits, balances ?? { trial: 0, allowance: input.charge.credits, topup: 0 });

    const models = [...new Set(input.calls.map((call) => call.model))];
    const metadata = {
      models,
      calls: input.calls.length,
      tokens_in: sum(input.calls.map((call) => call.promptTokens)),
      tokens_out: sum(input.calls.map((call) => call.completionTokens)),
      tokens_cached: sum(input.calls.map((call) => call.cachedTokens)),
      assumed: input.charge.assumed,
      charge_credits: input.charge.credits,
      ...(input.context ?? {}),
    };

    // The provider cost belongs to the turn, not to any one source, so each row
    // carries the share it covers.
    const costFor = (credits: number): number =>
      Math.round(input.charge.rodi * (credits / input.charge.credits) * 1000) / 1000;

    // Past the allowance: what the balance did not cover is bought at the plan's
    // rate (overage.ts). It is added back to the top-up pool so the balance
    // stays at zero rather than going negative, and counted in credit_overage,
    // which is charged to the card when the window ends.
    const overage = (input.balances as Partial<CreditSnapshot> | null | undefined)?.overage ?? null;
    const paidPast = overage && balances ? shortfall(input.charge.credits, balances.trial + balances.allowance + balances.topup) : 0;
    if (overage && paidPast > 0) {
      const { error } = await client.from(TABLE).insert({
        workspace_id: input.workspaceId,
        owner_user_id: input.ownerUserId,
        actor_user_id: input.actorUserId,
        pool: 'topup',
        kind: 'adjust',
        credits: paidPast,
        dedupe_key: `overage:${input.requestId}`,
        metadata: { source: 'overage', rate_kobo: overage.rateKobo, window_start: overage.windowStart },
      });
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.error(`[credits] could not add paid credits for ${input.requestId}:`, error.message);
      } else if (!error) {
        await recordOverage(client, { workspaceId: input.workspaceId, state: overage, credits: paidPast, requestId: input.requestId });
      }
    }

    for (const source of CREDIT_SOURCES) {
      const credits = split[source];
      if (credits <= 0) continue;
      const { error } = await client.from(TABLE).insert({
        workspace_id: input.workspaceId,
        owner_user_id: input.ownerUserId,
        actor_user_id: input.actorUserId,
        pool: source,
        kind: 'spend',
        credits: -credits,
        dedupe_key: `spend:${input.requestId}:${source}`,
        provider_cost_rodi: costFor(credits),
        metadata,
      });
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.error(`[credits] LOST CHARGE: could not record ${credits} credits for ${input.requestId}:`, error.message);
      }
    }
  } catch (error) {
    console.error(`[credits] LOST CHARGE: could not settle ${input.requestId}:`, error);
  }
}

const sum = (values: Array<number | null>): number => values.reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * Credit a purchase: one top-up row, keyed on the Paystack reference, so a
 * webhook that is delivered twice, and a callback that races it, credit once. The
 * caller has already checked that Paystack took the money (purchase.ts); this
 * only writes. Never throws. 'already' means a repeat of a purchase that is on the
 * ledger, which callers treat as success but do not announce a second time.
 */
export async function creditPurchase(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string;
    credits: number;
    reference: string;
    priceNaira: number;
    /** Who took the money: Paystack, or Bachs for dollar packs (#1120). */
    source?: 'paystack' | 'bachs';
  }
): Promise<'credited' | 'already' | 'error'> {
  const credits = Math.floor(input.credits);
  if (!(credits > 0)) return 'error';
  try {
    const { error } = await client.from(TABLE).insert({
      workspace_id: input.workspaceId,
      owner_user_id: input.ownerUserId,
      actor_user_id: input.actorUserId,
      pool: 'topup',
      kind: 'topup',
      credits,
      dedupe_key: purchaseDedupeKey(input.reference),
      metadata: { source: input.source ?? 'paystack', reference: input.reference, price_naira: input.priceNaira },
    });
    if (!error) return 'credited';
    // The reference is already on the ledger: told twice, credited once.
    if (error.code === UNIQUE_VIOLATION) return 'already';
    console.error(`[credits] could not credit the purchase ${input.reference}:`, error.message);
    return 'error';
  } catch (error) {
    console.error(`[credits] could not credit the purchase ${input.reference}:`, error);
    return 'error';
  }
}

/**
 * Add or take away top-up credits by hand (the admin route): a purchase later,
 * a goodwill grant or a correction today. Written to the top-up source because
 * that is the one no rule ever takes back. Never throws; returns whether it landed.
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
    /** Where the credits came from, shown in the history. Defaults to 'admin'. */
    source?: 'admin' | 'referral';
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
      metadata: { source: input.source ?? 'admin', ...(input.note ? { note: input.note.slice(0, 200) } : {}) },
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

/**
 * Charge started minutes of a voice call (Talk to UrgAns): a flat number of
 * credits, written through settleTurn so it lands on the same ledger, split
 * across sources the same way and deduplicated the same way. The request id is
 * the call and the minute it brings the call up to, so a tick sent twice charges
 * once. `reason: 'voice_minute'` is what the history and the admin views read.
 *
 * The provider cost written on the row is the planning estimate for one busy
 * minute (pricing.ts, voiceMinuteCostRodi), not a measurement; the call's real
 * token counts are kept on voice_sessions for the weekly reconciliation.
 */
export async function settleVoiceMinutes(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string;
    sessionId: string;
    /** Minutes being charged now. */
    minutes: number;
    /** The call's billed minutes once these are charged. */
    minutesBilled: number;
    credits: number;
    estimatedRodiPerMinute: number | null;
    model: string;
    balances?: SourceBalances | null;
  }
): Promise<void> {
  if (!(input.credits > 0) || !(input.minutes > 0)) return;
  await settleTurn(client, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    requestId: `voice:${input.sessionId}:m${input.minutesBilled}`,
    charge: {
      credits: input.credits,
      rodi: (input.estimatedRodiPerMinute ?? 0) * input.minutes,
      assumed: true,
    },
    calls: [],
    balances: input.balances ?? null,
    context: {
      reason: 'voice_minute',
      source: 'voice',
      voice_session_id: input.sessionId,
      minutes: input.minutes,
      minutes_billed: input.minutesBilled,
      voice_model: input.model,
    },
  });
}
