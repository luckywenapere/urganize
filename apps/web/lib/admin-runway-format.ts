import type { Runway, RunwayCurrency, RunwaySettings } from './admin-runway';

// How runway and default alive read as words on the cockpit (iteration 6).
// Client-safe: types only from ./admin-runway, so the form and the panel do
// not pull the billing helpers into the browser.

const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "₦1,250,000" or "$8,400". */
export function formatMoney(amount: number, currency: RunwayCurrency): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency === 'NGN' ? '₦' : '$'}${whole.format(Math.round(Math.abs(amount)))}`;
}

/**
 * The same amount in the other currency, when a rate is known: "≈ $8,400" under
 * a Naira figure, "≈ ₦12,600,000" under a dollar one. Null with no rate.
 */
export function formatOtherCurrency(amount: number, settings: Pick<RunwaySettings, 'currency' | 'ngnPerUsd'>): string | null {
  if (!settings.ngnPerUsd || settings.ngnPerUsd <= 0) return null;
  return settings.currency === 'NGN'
    ? `≈ ${formatMoney(amount / settings.ngnPerUsd, 'USD')}`
    : `≈ ${formatMoney(amount * settings.ngnPerUsd, 'NGN')}`;
}

/** "14.5 months", "Not burning cash". */
export function formatRunwayMonths(runway: Runway): string {
  if (!runway.settings) return 'Not entered';
  if (runway.netBurn === null) return 'Not worked out';
  if (runway.months === null) return 'Not burning cash';
  return `${oneDecimal.format(runway.months)} ${runway.months === 1 ? 'month' : 'months'}`;
}

/** "12 Mar 2027" from "2027-03-12". */
export function formatDay(day: string | null): string {
  if (!day) return '';
  const value = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(value) ? dayFormat.format(new Date(value)) : day;
}

/** "+3% a week", "-1% a week", "No rate yet". */
export function formatWeeklyRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No rate yet';
  const pct = Math.round(rate * 1000) / 10;
  if (pct === 0) return '0% a week';
  return `${pct > 0 ? '+' : ''}${pct}% a week`;
}

/** The headline for the default-alive tile. */
export function defaultAliveLabel(runway: Runway): string {
  const alive = runway.defaultAlive;
  if (!runway.settings || !alive) return 'Not worked out';
  if (alive.status === 'alive') return alive.weeksToProfit === 0 ? 'Alive: MRR covers spend' : 'Default alive';
  if (alive.status === 'dead') return 'Default dead';
  return 'Not within 10 years';
}

/** The live fact under the default-alive headline. */
export function defaultAliveFact(runway: Runway): string | null {
  const alive = runway.defaultAlive;
  if (!runway.settings || !alive) return null;
  if (alive.status === 'alive' && alive.weeksToProfit !== null && alive.weeksToProfit > 0) {
    return `MRR passes spend around ${formatDay(alive.profitOn)}, before the cash runs out`;
  }
  if (alive.status === 'dead') return `Cash runs out around ${formatDay(alive.cashOutOn)}, before MRR passes spend`;
  if (alive.status === 'beyond_horizon') return 'Neither profit nor zero cash within 10 years at this pace';
  return null;
}

/** The assumptions, for the info icon. Every number the answer rests on, in words. */
export function runwayAssumptions(runway: Runway): string {
  const base =
    'Typed in by hand on this page; Urganize does not read the bank. Runway = cash ÷ (monthly spend − MRR), counted from the "as of" day. ' +
    'Default alive (Paul Graham): if spend stays the same and MRR keeps growing at its rate over the last 4 weeks, does MRR pass spend before the cash runs out? Looked at for up to 10 years. ' +
    "MRR is the Scoreboard's (in Naira, our own accounts left out). Its 4-week rate is rebuilt from each subscription's start and last paid day at today's price, because past MRR is not stored.";
  const settings = runway.settings;
  if (!settings) return base;
  const parts = [base];
  if (settings.currency === 'USD' && settings.ngnPerUsd) {
    parts.push(`Figures are in dollars; MRR is turned into dollars at ₦${whole.format(settings.ngnPerUsd)} per $1.`);
  } else if (settings.ngnPerUsd) {
    parts.push(`Dollar amounts use ₦${whole.format(settings.ngnPerUsd)} per $1.`);
  }
  parts.push(
    runway.growth.weeklyRate === null
      ? 'There was no MRR 4 weeks ago, so there is no growth rate yet: the projection assumes MRR stays where it is.'
      : `MRR growth used: ${formatWeeklyRate(runway.growth.weeklyRate)}.`
  );
  return parts.join(' ');
}
