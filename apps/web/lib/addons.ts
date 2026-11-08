import {
  addonUnitPriceNaira,
  canBuyAddon,
  trmOwedFor,
  type AddonInterval,
  type AddonKind,
  type PricingTierId,
} from '@urganize/pricing';

// Add-ons on top of a plan (founder approved the mocks docs/mocks/pricing-addons
// on 2026-11-07, #1112). Pure and client-safe; lib/addons-server.ts reads and
// writes the rows (team_addons) and talks to Paystack.
//
// THE RULES
//   What       Extra people (₦3,000/mo) and extra artists (₦5,000/mo) on Manager
//              and Pro. Distribution for one artist on Solo and Manager: TRM's
//              monthly plan (₦7,100/mo, 7 releases a month, singles and EPs) or
//              its yearly plan (₦25,500/yr, no cap, albums too).
//   Paying     The first period is paid through a normal Paystack checkout,
//              which also saves the card. The limit goes up as soon as Paystack
//              confirms it.
//   Renewing   Each add-on renews on its own date (a month or a year after it
//              was bought), charged to the saved card. Add-ons due the same day
//              go in one charge.
//   Failing    A renewal that fails pauses the add-on after 3 days of retries:
//              the limit drops back, nothing is deleted. Paying unpauses it.
//   Removing   Stops at the end of the period already paid. No refunds.
//   TRM        We owe TRM 80% of every distribution add-on payment.

export const ADDON_REFERENCE_PREFIX = 'urgaddon-';
export const ADDON_RENEWAL_REFERENCE_PREFIX = 'urgaddren-';
export const ADDON_SOURCE = 'team_addon';
/** Retries before an unpaid renewal pauses the add-on. */
export const ADDON_GRACE_DAYS = 3;
export const MAX_ADDON_QUANTITY = 20;

export type AddonStatus = 'pending' | 'active' | 'paused' | 'cancelled';

export type AddonRow = {
  id: string;
  kind: AddonKind;
  quantity: number;
  interval: AddonInterval;
  artistKey: string | null;
  artistName: string | null;
  unitPriceKobo: number;
  status: AddonStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

export function isAddonReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(ADDON_REFERENCE_PREFIX);
}

export function isAddonRenewalReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(ADDON_RENEWAL_REFERENCE_PREFIX);
}

export function isAddonKind(value: unknown): value is AddonKind {
  return value === 'person' || value === 'artist' || value === 'distribution';
}

/** An add-on counts while it is active and its paid period has not ended, plus
 *  the grace days its renewal gets (a late or retried charge does not drop the
 *  limit). A removed add-on stops at its period end, with no grace. */
export function addonIsLive(
  row: Pick<AddonRow, 'status' | 'currentPeriodEnd'> & { cancelAtPeriodEnd?: boolean },
  now: Date
): boolean {
  if (row.status !== 'active') return false;
  if (!row.currentPeriodEnd) return false;
  const grace = row.cancelAtPeriodEnd ? 0 : ADDON_GRACE_DAYS * 86_400_000;
  return new Date(row.currentPeriodEnd).getTime() + grace > now.getTime();
}

/** How many extra people and artists a team's live add-ons give. */
export function addonExtras(rows: readonly AddonRow[], now: Date): { seats: number; artists: number } {
  let seats = 0;
  let artists = 0;
  for (const row of rows) {
    if (!addonIsLive(row, now)) continue;
    if (row.kind === 'person') seats += row.quantity;
    if (row.kind === 'artist') artists += row.quantity;
  }
  return { seats, artists };
}

/** Whether an artist has the Distribution add-on, and which TRM plan it is.
 *  Yearly wins if, oddly, both are live. */
export function distributionAddonPlanFor(
  rows: readonly AddonRow[],
  artistKey: string | null,
  now: Date
): AddonInterval | null {
  if (!artistKey) return null;
  let plan: AddonInterval | null = null;
  for (const row of rows) {
    if (row.kind !== 'distribution' || row.artistKey !== artistKey || !addonIsLive(row, now)) continue;
    if (row.interval === 'yearly') return 'yearly';
    plan = 'monthly';
  }
  return plan;
}

/** The end of a period that starts at `from`: one calendar month or year on. */
export function periodEndFrom(from: Date, interval: AddonInterval): Date {
  const end = new Date(from);
  if (interval === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export type AddonRequest = {
  kind: AddonKind;
  quantity: number;
  interval: AddonInterval;
};

/** Read and check what the browser asked for. Prices never come from it. */
export function parseAddonRequest(
  body: Record<string, unknown>
): { ok: true; request: AddonRequest } | { ok: false; error: string } {
  if (!isAddonKind(body.kind)) return { ok: false, error: 'Pick an add-on.' };
  const kind = body.kind;
  const interval: AddonInterval = kind === 'distribution' && body.interval === 'yearly' ? 'yearly' : 'monthly';
  const raw = kind === 'distribution' ? 1 : Number(body.quantity ?? 1);
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_ADDON_QUANTITY) {
    return { ok: false, error: `Pick between 1 and ${MAX_ADDON_QUANTITY}.` };
  }
  return { ok: true, request: { kind, quantity: raw, interval } };
}

/** Why a team cannot buy this add-on, or null when it can. */
export function addonRefusal(input: {
  tier: PricingTierId | null;
  paying: boolean;
  kind: AddonKind;
}): string | null {
  if (!input.paying || !input.tier) return 'Add-ons need a paid plan.';
  if (canBuyAddon(input.tier, input.kind)) return null;
  if (input.kind === 'distribution') {
    return input.tier === 'pro' || input.tier === 'label' || input.tier === 'enterprise'
      ? 'Your plan already includes distribution.'
      : 'Distribution add-ons are for Solo and Manager.';
  }
  return input.tier === 'solo' ? 'More people and artists come with Manager.' : 'Talk to us to add more to your plan.';
}

export function addonPriceKobo(request: AddonRequest): number {
  return addonUnitPriceNaira(request.kind, request.interval) * 100 * request.quantity;
}

/** What we owe TRM for a distribution add-on payment (80%), in kobo. Zero for
 *  people and artists. */
export function addonTrmOwedKobo(kind: AddonKind, paidKobo: number): number {
  return kind === 'distribution' ? trmOwedFor(paidKobo) : 0;
}

/** What Paystack reports for an add-on checkout, reduced to what settling reads. */
export type VerifiedAddonPayment = {
  status: string;
  currency: string;
  amountKobo: number;
  metadata: Record<string, unknown> | null;
};

/** Whether a Paystack transaction really paid for this add-on row, to the kobo. */
export function checkAddonPayment(
  verified: VerifiedAddonPayment,
  expected: { addonId: string; workspaceId: string; amountKobo: number }
): { ok: true } | { ok: false; reason: 'not_paid' | 'mismatch' } {
  if (verified.status !== 'success') return { ok: false, reason: 'not_paid' };
  const meta = verified.metadata ?? {};
  if (meta.source !== ADDON_SOURCE) return { ok: false, reason: 'mismatch' };
  if (meta.addon_id !== expected.addonId || meta.workspace_id !== expected.workspaceId) return { ok: false, reason: 'mismatch' };
  if (verified.currency !== 'NGN' || verified.amountKobo !== expected.amountKobo) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/** The add-ons a renewal run should charge today, and the ones to pause. */
export function planRenewals(
  rows: readonly AddonRow[],
  now: Date
): { charge: string[]; pause: string[]; cancel: string[] } {
  const charge: string[] = [];
  const pause: string[] = [];
  const cancel: string[] = [];
  for (const row of rows) {
    if (row.status !== 'active' && row.status !== 'paused') continue;
    if (!row.currentPeriodEnd) continue;
    const end = new Date(row.currentPeriodEnd).getTime();
    if (end > now.getTime()) continue;
    if (row.cancelAtPeriodEnd) {
      cancel.push(row.id);
      continue;
    }
    if (row.status === 'paused') continue;
    // Past the grace days and still unpaid: pause it (the limit already dropped).
    if (now.getTime() - end >= ADDON_GRACE_DAYS * 86_400_000) {
      pause.push(row.id);
      continue;
    }
    charge.push(row.id);
  }
  return { charge, pause, cancel };
}

/** "Extra people", "Distribution for Ayo Kings". */
export function addonLabel(row: Pick<AddonRow, 'kind' | 'artistName' | 'quantity'>): string {
  if (row.kind === 'distribution') return `Distribution for ${row.artistName?.trim() || 'an artist'}`;
  if (row.kind === 'person') return row.quantity === 1 ? '1 extra person' : `${row.quantity} extra people`;
  return row.quantity === 1 ? '1 extra artist' : `${row.quantity} extra artists`;
}

/** The ₦100 card check that saves a card for credits past the allowance when
 *  the team has no other card on file. Refunded as soon as it settles. */
export const CARD_CHECK_REFERENCE_PREFIX = 'urgcard-';
export const CARD_CHECK_KOBO = 10_000;

export function isCardCheckReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(CARD_CHECK_REFERENCE_PREFIX);
}
