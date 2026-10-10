import { payingStretch } from './admin-churn';
import type { ScoreboardSubscription } from './scoreboard';

// Runway and "default alive" on the founder cockpit (iteration 6, 2026-10-10).
//
// The founder's answer: cash and monthly spend are typed in by hand on the
// cockpit (an admin-only form), not read from a bank or a sheet. They are kept
// in app_settings under RUNWAY_SETTINGS_KEY (lib/admin-runway-server.ts), the
// table's documented home for service-role-only settings, so no migration.
//
// PURE: no database, no clock (the caller passes `now`), no environment.
//
// Definitions, stated so they can be changed in one place:
//
//  1. Money is in the currency the founder typed: NGN or USD. Billing is Naira
//     only (lib/billing-plans.ts refuses any other checkout currency), so MRR
//     is in kobo. When the figures are in dollars, MRR is turned into dollars
//     at the Naira-per-dollar rate the founder typed with them; with no rate
//     the dollar figures cannot be compared with MRR, so the form requires one.
//  2. Net burn = monthly spend - MRR. Runway (months) = cash / net burn, counted
//     from the "as of" date the cash was true on. When MRR covers the spend
//     there is no runway to count: the company is not burning cash.
//  3. Default alive (Paul Graham, "Default Alive or Default Dead",
//     https://paulgraham.com/aord.html): "Assuming expenses stay constant and
//     revenue growth is what it has been, do we make it to profitability on
//     the money we have left?" Spend stays as typed; MRR grows at its own
//     compounded weekly rate over the last 4 weeks; week by week, cash goes
//     down by (spend - MRR) for that week. Alive if MRR reaches spend before
//     cash reaches zero. Looked at for at most PROJECTION_WEEKS.
//  4. MRR's growth rate. Only one subscriptions row per account is kept, so MRR
//     4 weeks ago is rebuilt from each subscription's stretch of paying (the
//     churn panel's payingStretch: started_at to its last paid day, at today's
//     price, with Paystack's renewal grace). Both ends of the rate are rebuilt
//     the same way, then the rate is applied to today's MRR as the Scoreboard
//     counts it. With no MRR 4 weeks ago there is no rate; the projection then
//     assumes MRR stays flat and says so.

export const RUNWAY_SETTINGS_KEY = 'founder_runway';
export const RUNWAY_CURRENCIES = ['NGN', 'USD'] as const;
export type RunwayCurrency = (typeof RUNWAY_CURRENCIES)[number];

/** Weeks of MRR history the growth rate is measured over (the cockpit's span). */
export const RUNWAY_GROWTH_WEEKS = 4;
/** How far ahead default alive looks: ten years. */
export const PROJECTION_WEEKS = 520;
/** Figures older than this are flagged as needing an update. */
export const RUNWAY_STALE_DAYS = 45;

/** Upper bounds that stop a typo from becoming a number nobody meant. */
export const MAX_CASH = 1e13;
export const MAX_MONTHLY_BURN = 1e12;
export const MAX_NGN_PER_USD = 100_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** A month of money in a week: 12 months over 52 weeks. */
const WEEK_SHARE_OF_MONTH = 12 / 52;

export type RunwaySettings = {
  currency: RunwayCurrency;
  /** Cash on hand on `asOf`, in whole units of `currency` (2 decimals at most). */
  cash: number;
  /** Everything spent in a month, in whole units of `currency`. */
  monthlyBurn: number;
  /** The day the cash figure was true, YYYY-MM-DD. */
  asOf: string;
  /** Naira per dollar. Required for USD figures; optional with NGN (shows dollars too). */
  ngnPerUsd: number | null;
  /** When the figures were last saved, ISO. Set by the server. */
  updatedAt: string | null;
};

export type RunwayInput = Omit<RunwaySettings, 'updatedAt'>;

export type DefaultAliveStatus = 'alive' | 'dead' | 'beyond_horizon';

export type Runway = {
  /** Null when nothing has been entered yet: the panel invites the numbers. */
  settings: RunwaySettings | null;
  /** Today's MRR (the Scoreboard's), in whole units of the settings' currency. */
  mrr: number | null;
  /** monthlyBurn - mrr. Negative or zero means MRR covers the spend. */
  netBurn: number | null;
  /** cash / netBurn, or null when not burning (or nothing entered). */
  months: number | null;
  /** The day cash runs out at today's net burn, YYYY-MM-DD, or null. */
  runsOutOn: string | null;
  growth: {
    /** Compounded weekly MRR growth over RUNWAY_GROWTH_WEEKS, or null with no MRR then. */
    weeklyRate: number | null;
    /** The rate the projection used (0 when the rate is unknown). */
    usedRate: number;
    /** MRR 4 weeks ago as rebuilt from the stretches, in kobo. */
    mrrThenMinor: number;
    /** MRR now as rebuilt the same way, in kobo. */
    mrrNowMinor: number;
  };
  defaultAlive: {
    status: DefaultAliveStatus;
    /** Weeks from `asOf` until MRR reaches spend (0 = already), or null. */
    weeksToProfit: number | null;
    /** Weeks from `asOf` until cash reaches zero, or null. */
    weeksToCashOut: number | null;
    profitOn: string | null;
    cashOutOn: string | null;
  } | null;
  /** Days since `asOf`. */
  ageDays: number | null;
  stale: boolean;
};

// ─── input checking ──────────────────────────────────────────────────────────

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s₦$]/g, '');
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * Check what the form sent. Amounts may be numbers or strings with commas or a
 * currency sign. Every failure names the field, so the form can say what to fix.
 */
export function parseRunwayInput(
  body: unknown,
  now: Date
): { ok: true; value: RunwayInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the cash, monthly spend, currency and date.' };
  }
  const raw = body as Record<string, unknown>;

  const currency = String(raw.currency ?? '').toUpperCase();
  if (!(RUNWAY_CURRENCIES as readonly string[]).includes(currency)) {
    return { ok: false, error: 'Currency must be NGN or USD.' };
  }

  const cash = toNumber(raw.cash);
  if (cash === null || cash < 0) return { ok: false, error: 'Cash on hand must be a number, 0 or more.' };
  if (cash > MAX_CASH) return { ok: false, error: 'Cash on hand is too large. Check the number.' };

  const monthlyBurn = toNumber(raw.monthlyBurn);
  if (monthlyBurn === null || monthlyBurn <= 0) {
    return { ok: false, error: 'Monthly spend must be a number above 0.' };
  }
  if (monthlyBurn > MAX_MONTHLY_BURN) return { ok: false, error: 'Monthly spend is too large. Check the number.' };

  const asOf = String(raw.asOf ?? '').trim();
  if (!isCalendarDay(asOf)) return { ok: false, error: 'The date must be a real day, as YYYY-MM-DD.' };
  const asOfMs = Date.parse(`${asOf}T00:00:00.000Z`);
  // A day ahead is allowed: the founder's today can be UTC's tomorrow.
  if (asOfMs > now.getTime() + DAY_MS) return { ok: false, error: 'The date cannot be in the future.' };
  if (asOf < '2020-01-01') return { ok: false, error: 'The date is too far in the past.' };

  const rateRaw = raw.ngnPerUsd;
  const rateGiven = !(rateRaw === null || rateRaw === undefined || (typeof rateRaw === 'string' && rateRaw.trim() === ''));
  let ngnPerUsd: number | null = null;
  if (rateGiven) {
    ngnPerUsd = toNumber(rateRaw);
    if (ngnPerUsd === null || ngnPerUsd <= 0 || ngnPerUsd > MAX_NGN_PER_USD) {
      return { ok: false, error: 'Naira per dollar must be a number above 0.' };
    }
  }
  if (currency === 'USD' && ngnPerUsd === null) {
    return { ok: false, error: 'With dollar figures, add Naira per dollar so they can be set against MRR, which is in Naira.' };
  }

  return {
    ok: true,
    value: {
      currency: currency as RunwayCurrency,
      cash: round2(cash),
      monthlyBurn: round2(monthlyBurn),
      asOf,
      ngnPerUsd: ngnPerUsd === null ? null : round2(ngnPerUsd),
    },
  };
}

/** The stored value, read back. Anything that no longer passes the checks reads as nothing stored. */
export function readStoredRunway(value: unknown, now: Date): RunwaySettings | null {
  const parsed = parseRunwayInput(value, now);
  if (!parsed.ok) return null;
  const updatedAt = (value as Record<string, unknown>).updatedAt;
  return { ...parsed.value, updatedAt: typeof updatedAt === 'string' ? updatedAt : null };
}

// ─── MRR history ─────────────────────────────────────────────────────────────

/** MRR at a moment, in kobo, rebuilt from each subscription's stretch of paying (definition 4). */
export function mrrAtMinor(subscriptions: ScoreboardSubscription[], atMs: number, now: Date): number {
  let total = 0;
  for (const sub of subscriptions) {
    const stretch = payingStretch(sub, now);
    if (!stretch || stretch === 'undated') continue;
    if (stretch.from <= atMs && (stretch.until === null || stretch.until > atMs)) total += stretch.monthlyMinor;
  }
  return total;
}

/** Compounded weekly MRR growth over `weeks`: (now / then) ^ (1 / weeks) - 1. Null when MRR then was zero. */
export function mrrWeeklyGrowth(
  subscriptions: ScoreboardSubscription[],
  now: Date,
  weeks = RUNWAY_GROWTH_WEEKS
): { weeklyRate: number | null; mrrThenMinor: number; mrrNowMinor: number } {
  const nowMs = now.getTime();
  const mrrNowMinor = mrrAtMinor(subscriptions, nowMs, now);
  const mrrThenMinor = mrrAtMinor(subscriptions, nowMs - weeks * WEEK_MS, now);
  const weeklyRate = mrrThenMinor > 0 ? Math.pow(mrrNowMinor / mrrThenMinor, 1 / weeks) - 1 : null;
  return { weeklyRate, mrrThenMinor, mrrNowMinor };
}

// ─── the projection ──────────────────────────────────────────────────────────

/**
 * Definition 3, week by week. Monthly amounts become weekly at 12/52. Returns
 * the first week MRR reaches spend, or the week cash runs out, whichever comes
 * first, within `horizonWeeks`.
 */
export function projectDefaultAlive(args: {
  cash: number;
  monthlyBurn: number;
  mrr: number;
  weeklyGrowth: number;
  horizonWeeks?: number;
}): { status: DefaultAliveStatus; weeksToProfit: number | null; weeksToCashOut: number | null } {
  const horizon = args.horizonWeeks ?? PROJECTION_WEEKS;
  let cash = args.cash;
  let mrr = Math.max(0, args.mrr);
  const growth = Math.max(-1, args.weeklyGrowth);
  for (let week = 0; week <= horizon; week += 1) {
    if (mrr >= args.monthlyBurn) return { status: 'alive', weeksToProfit: week, weeksToCashOut: null };
    if (cash <= 0) return { status: 'dead', weeksToProfit: null, weeksToCashOut: week };
    cash -= (args.monthlyBurn - mrr) * WEEK_SHARE_OF_MONTH;
    if (cash <= 0) return { status: 'dead', weeksToProfit: null, weeksToCashOut: week + 1 };
    mrr *= 1 + growth;
  }
  return { status: 'beyond_horizon', weeksToProfit: null, weeksToCashOut: null };
}

function addDays(day: string, days: number): string {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(start + Math.round(days) * DAY_MS).toISOString().slice(0, 10);
}

/** Kobo to whole units of the settings' currency. */
export function mrrInCurrency(mrrMinor: number, settings: Pick<RunwaySettings, 'currency' | 'ngnPerUsd'>): number | null {
  const naira = mrrMinor / 100;
  if (settings.currency === 'NGN') return naira;
  if (!settings.ngnPerUsd || settings.ngnPerUsd <= 0) return null;
  return naira / settings.ngnPerUsd;
}

export function buildRunway(
  settings: RunwaySettings | null,
  args: { subscriptions: ScoreboardSubscription[]; mrrMinor: number; now: Date }
): Runway {
  const history = mrrWeeklyGrowth(args.subscriptions, args.now);
  const growth = {
    weeklyRate: history.weeklyRate,
    usedRate: history.weeklyRate ?? 0,
    mrrThenMinor: history.mrrThenMinor,
    mrrNowMinor: history.mrrNowMinor,
  };
  if (!settings) {
    return {
      settings: null,
      mrr: null,
      netBurn: null,
      months: null,
      runsOutOn: null,
      growth,
      defaultAlive: null,
      ageDays: null,
      stale: false,
    };
  }

  const mrr = mrrInCurrency(args.mrrMinor, settings);
  const ageDays = Math.max(
    0,
    Math.floor((args.now.getTime() - Date.parse(`${settings.asOf}T00:00:00.000Z`)) / DAY_MS)
  );
  const stale = ageDays > RUNWAY_STALE_DAYS;
  if (mrr === null) {
    return { settings, mrr: null, netBurn: null, months: null, runsOutOn: null, growth, defaultAlive: null, ageDays, stale };
  }

  const netBurn = settings.monthlyBurn - mrr;
  const months = netBurn > 0 ? settings.cash / netBurn : null;
  const runsOutOn = months === null ? null : addDays(settings.asOf, (months * 52 * 7) / 12);

  const projection = projectDefaultAlive({
    cash: settings.cash,
    monthlyBurn: settings.monthlyBurn,
    mrr,
    weeklyGrowth: growth.usedRate,
  });

  return {
    settings,
    mrr,
    netBurn,
    months,
    runsOutOn,
    growth,
    defaultAlive: {
      ...projection,
      profitOn: projection.weeksToProfit === null ? null : addDays(settings.asOf, projection.weeksToProfit * 7),
      cashOutOn: projection.weeksToCashOut === null ? null : addDays(settings.asOf, projection.weeksToCashOut * 7),
    },
    ageDays,
    stale,
  };
}
