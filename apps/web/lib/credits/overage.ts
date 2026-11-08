import { CREDIT_OVERAGE_NAIRA, isPricingTierId } from '@urganize/pricing';
import type { TeamForAllowance } from './allowance';

/**
 * AI credits past the plan's monthly credits (founder approved the mocks
 * docs/mocks/pricing-addons on 2026-11-07, #1112). Pure; the reads and writes
 * are in overage-server.ts.
 *
 * THE RULES
 *   - Only a paying team (state 'paid') can go past its credits. The price per
 *     credit depends on the plan: ₦20 Solo, ₦18 Manager, ₦16 Pro, ₦15 Label.
 *   - The team's owner sets a monthly cap in naira. ₦0, the default, means
 *     UrgAns stops when the credits run out, as it always did.
 *   - Credits the team holds are always used first (allowance, then any it
 *     bought). Only a turn that finds the balance at zero runs on paid credits.
 *   - A turn starts only if what it may cost fits under the cap. A turn that
 *     costs a little more than it held can go over by that much; the bill is
 *     never more than the cap.
 *   - What was used in a credit window is charged to the saved card when the
 *     window ends, one charge.
 */

export type OverageState = {
  /** Kobo per credit on this plan. */
  rateKobo: number;
  /** The monthly cap, kobo. 0 = off. */
  capKobo: number;
  /** Credits used past the allowance this window. */
  credits: number;
  /** What those cost so far, kobo (never above the cap). */
  spentKobo: number;
  /** Credits still allowed before the cap. */
  headroomCredits: number;
  /** The window these count in: its first day ("2026-11-03") and when it ends. */
  windowStart: string;
  windowEnd: string;
};

/** Kobo per credit past the allowance, or null when this team cannot go past it. */
export function overageRateKobo(team: TeamForAllowance | undefined): number | null {
  if (team?.state !== 'paid') return null;
  const tier = team.tier ?? null;
  if (!isPricingTierId(tier)) return null;
  return CREDIT_OVERAGE_NAIRA[tier] * 100;
}

export function overageCostKobo(credits: number, rateKobo: number, capKobo: number): number {
  return Math.min(Math.max(0, Math.floor(credits)) * rateKobo, Math.max(0, capKobo));
}

export function overageHeadroom(input: { capKobo: number; credits: number; rateKobo: number }): number {
  if (input.capKobo <= 0 || input.rateKobo <= 0) return 0;
  const used = Math.max(0, input.credits) * input.rateKobo;
  return Math.max(0, Math.floor((input.capKobo - used) / input.rateKobo));
}

export function buildOverageState(input: {
  rateKobo: number;
  capKobo: number;
  credits: number;
  windowStart: string;
  windowEnd: string;
}): OverageState {
  return {
    rateKobo: input.rateKobo,
    capKobo: input.capKobo,
    credits: input.credits,
    spentKobo: overageCostKobo(input.credits, input.rateKobo, input.capKobo || input.credits * input.rateKobo),
    headroomCredits: overageHeadroom(input),
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  };
}

/** How many of a turn's credits were not covered by the balance it started with. */
export function shortfall(charge: number, balanceTotal: number): number {
  return Math.max(0, Math.floor(charge) - Math.max(0, Math.floor(balanceTotal)));
}

/** The cap a person typed, checked. Whole naira, 0 to ₦1,000,000. */
export function parseCapNaira(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(/[₦,\s]/g, '')) : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.floor(n);
}

export const OVERAGE_REFERENCE_PREFIX = 'urgcred-';

export function isOverageReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(OVERAGE_REFERENCE_PREFIX);
}

const naira = (kobo: number): string => `₦${Math.round(kobo / 100).toLocaleString('en-US')}`;

/** Said in the chat when the cap is reached. */
export function capReachedNotice(state: Pick<OverageState, 'capKobo' | 'windowEnd'>, monthDay: string): string {
  return `You've hit your ${naira(state.capKobo)} cap for this month. AI is paused until ${monthDay}. The owner can raise the cap on the AI credits page.`;
}

/** Said when credits ran out and no cap is set. */
export function noCapNotice(monthDay: string | null): string {
  const next = monthDay ? ` Your next monthly credits arrive on ${monthDay}.` : '';
  return `You are out of AI credits. Quick commands still work. To keep going, the owner can set a monthly cap on the AI credits page.${next}`;
}
