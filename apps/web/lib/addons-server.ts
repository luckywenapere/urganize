import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addonUnitPriceNaira, isPricingTierId, type AddonInterval, type AddonKind, type PricingTierId } from '@urganize/pricing';
import {
  CARD_CHECK_KOBO,
  CARD_CHECK_REFERENCE_PREFIX,
  ADDON_REFERENCE_PREFIX,
  ADDON_RENEWAL_REFERENCE_PREFIX,
  ADDON_SOURCE,
  addonExtras,
  addonPriceKobo,
  addonRefusal,
  addonTrmOwedKobo,
  checkAddonPayment,
  periodEndFrom,
  planRenewals,
  type AddonRequest,
  type AddonRow,
  type AddonStatus,
} from './addons';
import { logBillingEvent } from './billing-events-server';
import { artistKeyFor } from './distribution-limits';
import {
  chargeSavedCard,
  createPaystackRefund,
  findSavedCard,
  initializePaystackTransaction,
  isPaystackConfigured,
  verifyPaystackTransaction,
  type SavedCard,
} from './paystack-server';
import { getTeamAccessForUser } from './team-billing-server';
import { recordTrmAddonPayment } from './trm/partner-ledger-server';

// The ONLY reader and writer of team_addons and team_billing_prefs' saved card.
// The rules are in lib/addons.ts. Never trusts the browser: prices come from
// @urganize/pricing, and an add-on goes live only once Paystack's own record
// says it was paid, to the kobo.

type Admin = SupabaseClient;

const ADDONS = 'team_addons';
const PREFS = 'team_billing_prefs';
const COLUMNS =
  'id, workspace_id, kind, quantity, interval, artist_id, artist_key, artist_name, unit_price_kobo, status, reference, current_period_end, cancel_at_period_end, failed_at, created_at';

type RawAddon = Record<string, unknown>;

function toRow(raw: RawAddon): AddonRow & { workspaceId: string; failedAt: string | null } {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspace_id),
    kind: raw.kind as AddonKind,
    quantity: Number(raw.quantity) || 1,
    interval: raw.interval === 'yearly' ? 'yearly' : 'monthly',
    artistKey: typeof raw.artist_key === 'string' ? raw.artist_key : null,
    artistName: typeof raw.artist_name === 'string' ? raw.artist_name : null,
    unitPriceKobo: Number(raw.unit_price_kobo) || 0,
    status: raw.status as AddonStatus,
    currentPeriodEnd: typeof raw.current_period_end === 'string' ? raw.current_period_end : null,
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    failedAt: typeof raw.failed_at === 'string' ? raw.failed_at : null,
    createdAt: String(raw.created_at),
  };
}

/** A team's add-ons that are not cancelled or abandoned, oldest first. Null
 *  when they cannot be read (callers then give no extras: fail closed on money,
 *  open on limits, see loadAddonExtras). */
export async function loadTeamAddons(admin: Admin, workspaceId: string): Promise<AddonRow[] | null> {
  const result = await admin
    .from(ADDONS)
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: true });
  if (result.error) {
    console.error('[addons] read failed:', result.error.message);
    return null;
  }
  return ((result.data ?? []) as RawAddon[]).map(toRow);
}

/** Extra seats and artists from live add-ons. Zero when unreadable. */
export async function loadAddonExtras(admin: Admin, workspaceId: string, now: Date = new Date()): Promise<{ seats: number; artists: number }> {
  const rows = await loadTeamAddons(admin, workspaceId);
  return rows ? addonExtras(rows, now) : { seats: 0, artists: 0 };
}

// ─── the saved card ────────────────────────────────────────────────────────

/** The card add-on renewals and credits past the allowance are charged to:
 *  the one saved from the team's last add-on checkout, else the newest reusable
 *  card Paystack holds for the owner's email (a team paying its plan by card). */
export async function loadSavedCard(admin: Admin, workspaceId: string, ownerEmail: string | null): Promise<SavedCard | null> {
  const prefs = await admin
    .from(PREFS)
    .select('authorization_code, authorization_email, card_label')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const row = prefs.data as { authorization_code: string | null; authorization_email: string | null; card_label: string | null } | null;
  if (row?.authorization_code && row.authorization_email) {
    return { authorizationCode: row.authorization_code, email: row.authorization_email, label: row.card_label || 'Card' };
  }
  if (!ownerEmail || !isPaystackConfigured()) return null;
  return findSavedCard(ownerEmail);
}

export async function saveCard(admin: Admin, workspaceId: string, card: SavedCard): Promise<void> {
  const result = await admin.from(PREFS).upsert(
    {
      workspace_id: workspaceId,
      authorization_code: card.authorizationCode,
      authorization_email: card.email,
      card_label: card.label,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id' }
  );
  if (result.error) console.error('[addons] could not save the card:', result.error.message);
}

// ─── who is buying ─────────────────────────────────────────────────────────

export type BillingTeam = {
  workspaceId: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  tier: PricingTierId | null;
  paying: boolean;
  canBuy: boolean;
};

/** The team a person buys for, and whether they may. Owner or admin only. */
export async function loadBillingTeam(admin: Admin, user: { id: string; email: string | null }): Promise<BillingTeam | null> {
  const team = await getTeamAccessForUser(user.id, user.email);
  if (!team.primaryWorkspaceId) return null;
  let tier: PricingTierId | null = null;
  if (team.ownerUserId) {
    const sub = await admin.from('subscriptions').select('plan').eq('user_id', team.ownerUserId).maybeSingle();
    const plan = (sub.data as { plan: string | null } | null)?.plan ?? null;
    tier = isPricingTierId(plan) ? plan : null;
  }
  return {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    ownerEmail: team.ownerEmail,
    tier,
    paying: team.state === 'paid',
    canBuy: team.isOwnerOrAdmin,
  };
}

// ─── buying ────────────────────────────────────────────────────────────────

export type AddonCheckoutResult =
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; status: number; error: string };

/** Open Paystack for the first period of an add-on. The row waits as 'pending'
 *  until the payment settles. */
export async function startAddonCheckout(
  admin: Admin,
  input: {
    team: BillingTeam;
    user: { id: string; email: string | null };
    request: AddonRequest;
    artistId: string | null;
    callbackUrl: string;
  }
): Promise<AddonCheckoutResult> {
  if (!isPaystackConfigured()) return { ok: false, status: 503, error: 'Payments are not available right now. Try again later.' };
  if (!input.team.canBuy) return { ok: false, status: 403, error: 'Ask the person who runs your team to add this.' };
  const refusal = addonRefusal({ tier: input.team.tier, paying: input.team.paying, kind: input.request.kind });
  if (refusal) return { ok: false, status: 409, error: refusal };
  const email = String(input.user.email || '').trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: 'Add an email to your account before you pay.' };

  let artist: { id: string; name: string; key: string } | null = null;
  if (input.request.kind === 'distribution') {
    if (!input.artistId) return { ok: false, status: 400, error: 'Pick the artist.' };
    const found = await admin
      .from('artists')
      .select('id, name, workspace_id')
      .eq('id', input.artistId)
      .eq('workspace_id', input.team.workspaceId)
      .maybeSingle();
    const row = found.data as { id: string; name: string } | null;
    if (!row) return { ok: false, status: 404, error: 'That artist is not on your team.' };
    artist = { id: row.id, name: row.name, key: artistKeyFor(row.id, row.name) ?? `id:${row.id}` };
    const existing = await loadTeamAddons(admin, input.team.workspaceId);
    if (existing?.some((addon) => addon.kind === 'distribution' && addon.artistKey === artist?.key && addon.status === 'active')) {
      return { ok: false, status: 409, error: `${row.name} already has distribution.` };
    }
  }

  const amountKobo = addonPriceKobo(input.request);
  const reference = `${ADDON_REFERENCE_PREFIX}${randomBytes(16).toString('hex')}`;
  const insert = await admin
    .from(ADDONS)
    .insert({
      workspace_id: input.team.workspaceId,
      kind: input.request.kind,
      quantity: input.request.quantity,
      interval: input.request.interval,
      artist_id: artist?.id ?? null,
      artist_key: artist?.key ?? null,
      artist_name: artist?.name ?? null,
      unit_price_kobo: addonUnitPriceNaira(input.request.kind, input.request.interval) * 100,
      status: 'pending',
      reference,
      created_by: input.user.id,
    })
    .select('id')
    .single();
  const addonId = (insert.data as { id: string } | null)?.id;
  if (insert.error || !addonId) {
    console.error('[addons] could not start an add-on:', insert.error?.message);
    return { ok: false, status: 500, error: 'Could not open the payment page. Try again.' };
  }

  const initialized = await initializePaystackTransaction({
    email,
    amountKobo,
    reference,
    callbackUrl: input.callbackUrl,
    metadata: {
      source: ADDON_SOURCE,
      addon_id: addonId,
      workspace_id: input.team.workspaceId,
      user_id: input.user.id,
      kind: input.request.kind,
      quantity: input.request.quantity,
      interval: input.request.interval,
      cancel_action: `${input.callbackUrl}${input.callbackUrl.includes('?') ? '&' : '?'}payment=cancelled`,
    },
    // Card only: renewals are charged to the card this saves.
    channels: ['card'],
  });
  if (!initialized.ok) {
    console.error('[addons] could not open Paystack:', initialized.message);
    await admin.from(ADDONS).delete().eq('id', addonId).eq('status', 'pending');
    return { ok: false, status: 502, error: 'Could not open the payment page. Try again.' };
  }
  return { ok: true, authorizationUrl: initialized.data.authorizationUrl, reference };
}

export type AddonSettleOutcome =
  | { state: 'paid'; addonId: string; kind: AddonKind }
  | { state: 'not_paid' }
  | { state: 'mismatch' }
  | { state: 'error'; transient: boolean };

/** Settle an add-on's first payment from the webhook or the page the payer
 *  lands on, in either order, any number of times. */
export async function settleAddonCheckout(admin: Admin, reference: string, via: 'webhook' | 'callback'): Promise<AddonSettleOutcome> {
  const found = await admin.from(ADDONS).select(COLUMNS + ', created_by').eq('reference', reference).maybeSingle();
  if (found.error) return { state: 'error', transient: true };
  const raw = found.data as (RawAddon & { created_by: string | null }) | null;
  if (!raw) {
    console.error(`[addons] PAID BUT NO MATCHING ROW: ${reference} (${via})`);
    return { state: 'mismatch' };
  }
  const row = toRow(raw);
  if (row.status !== 'pending') return { state: 'paid', addonId: row.id, kind: row.kind };

  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok) return { state: 'error', transient: verified.transient };
  const amountKobo = row.unitPriceKobo * row.quantity;
  const decision = checkAddonPayment(
    {
      status: verified.data.status,
      currency: verified.data.currency,
      // The price before Paystack's fee, which is passed on to the buyer (#1099).
      amountKobo: verified.data.requestedAmountKobo,
      metadata: verified.data.metadata,
    },
    { addonId: row.id, workspaceId: row.workspaceId, amountKobo }
  );
  if (!decision.ok) {
    if (decision.reason === 'mismatch') console.error(`[addons] MISMATCH on ${reference} (${via}): ${verified.data.amountKobo} ${verified.data.currency}`);
    return { state: decision.reason };
  }

  const paidAt = new Date();
  const update = await admin
    .from(ADDONS)
    .update({ status: 'active', current_period_end: periodEndFrom(paidAt, row.interval).toISOString(), updated_at: paidAt.toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id');
  if (update.error) {
    console.error(`[addons] PAID BUT NOT RECORDED: ${reference} (${via})`, update.error.message);
    return { state: 'error', transient: true };
  }
  // Only the settle that flipped the row saves the card, writes TRM and the event.
  if (Array.isArray(update.data) && update.data.length > 0) {
    if (verified.data.authorization) await saveCard(admin, row.workspaceId, verified.data.authorization);
    await afterAddonPaid(admin, row, { reference, amountKobo, paidAt, actorUserId: raw.created_by, via, renewal: false });
  }
  return { state: 'paid', addonId: row.id, kind: row.kind };
}

async function afterAddonPaid(
  admin: Admin,
  row: AddonRow & { workspaceId: string },
  input: { reference: string; amountKobo: number; paidAt: Date; actorUserId: string | null; via: string; renewal: boolean }
): Promise<void> {
  const owedKobo = addonTrmOwedKobo(row.kind, input.amountKobo);
  if (owedKobo > 0) {
    await recordTrmAddonPayment(admin, {
      workspaceId: row.workspaceId,
      tier: (await ownerPlanFor(admin, row.workspaceId)) === 'solo' ? 'solo' : 'manager',
      reference: input.reference,
      interval: row.interval,
      paidKobo: input.amountKobo,
      owedKobo,
      paidAt: input.paidAt,
    });
  }
  await logBillingEvent(admin, {
    workspaceId: row.workspaceId,
    ownerUserId: null,
    actorUserId: input.actorUserId,
    type: input.renewal ? 'addon_renewed' : 'addon_paid',
    metadata: {
      reference: input.reference,
      addonId: row.id,
      kind: row.kind,
      quantity: row.quantity,
      interval: row.interval,
      artist: row.artistName,
      priceNaira: input.amountKobo / 100,
      via: input.via,
    },
  });
}

/** Remove an add-on: it stops at the end of the period already paid. A paused
 *  one (unpaid) stops now. */
export async function cancelAddon(admin: Admin, team: BillingTeam, addonId: string, actorUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!team.canBuy) return { ok: false, error: 'Ask the person who runs your team to change add-ons.' };
  const found = await admin.from(ADDONS).select(COLUMNS).eq('id', addonId).eq('workspace_id', team.workspaceId).maybeSingle();
  const raw = found.data as RawAddon | null;
  if (!raw) return { ok: false, error: 'That add-on is not on your team.' };
  const row = toRow(raw);
  const update =
    row.status === 'paused'
      ? await admin.from(ADDONS).update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', row.id)
      : await admin.from(ADDONS).update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('id', row.id);
  if (update.error) return { ok: false, error: 'Could not change that add-on. Try again.' };
  await logBillingEvent(admin, {
    workspaceId: team.workspaceId,
    ownerUserId: team.ownerUserId,
    actorUserId,
    type: 'addon_cancelled',
    metadata: { addonId: row.id, kind: row.kind, quantity: row.quantity },
  });
  return { ok: true };
}

/** Undo a removal before the period ends. */
export async function keepAddon(admin: Admin, team: BillingTeam, addonId: string): Promise<{ ok: boolean; error?: string }> {
  if (!team.canBuy) return { ok: false, error: 'Ask the person who runs your team to change add-ons.' };
  const update = await admin
    .from(ADDONS)
    .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq('id', addonId)
    .eq('workspace_id', team.workspaceId)
    .eq('status', 'active');
  return update.error ? { ok: false, error: 'Could not change that add-on. Try again.' } : { ok: true };
}

// ─── renewing ──────────────────────────────────────────────────────────────

export type RenewalSummary = { teams: number; charged: number; failed: number; paused: number; cancelled: number };

/** The daily run: charge add-ons that came due on the saved card (one charge
 *  per team), pause ones unpaid past the grace days, end removed ones. Also
 *  takes back a paused add-on when its team pays (resumeAddons). */
export async function runAddonRenewals(admin: Admin, now: Date = new Date()): Promise<RenewalSummary> {
  const summary: RenewalSummary = { teams: 0, charged: 0, failed: 0, paused: 0, cancelled: 0 };
  const due = await admin
    .from(ADDONS)
    .select(COLUMNS)
    .in('status', ['active', 'paused'])
    .lte('current_period_end', now.toISOString())
    .limit(500);
  if (due.error) {
    console.error('[addons] renewal read failed:', due.error.message);
    return summary;
  }
  const rows = ((due.data ?? []) as RawAddon[]).map(toRow);
  const plan = planRenewals(rows, now);
  const stamp = now.toISOString();

  if (plan.cancel.length > 0) {
    await admin.from(ADDONS).update({ status: 'cancelled', updated_at: stamp }).in('id', plan.cancel);
    summary.cancelled = plan.cancel.length;
  }
  if (plan.pause.length > 0) {
    await admin.from(ADDONS).update({ status: 'paused', updated_at: stamp }).in('id', plan.pause);
    summary.paused = plan.pause.length;
  }

  const byTeam = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!plan.charge.includes(row.id)) continue;
    // A failed charge is retried once a day, not on every run.
    if (row.failedAt && now.getTime() - new Date(row.failedAt).getTime() < 20 * 3_600_000) continue;
    byTeam.set(row.workspaceId, [...(byTeam.get(row.workspaceId) ?? []), row]);
  }

  for (const [workspaceId, teamRows] of byTeam) {
    summary.teams += 1;
    const paid = await chargeTeamAddons(admin, workspaceId, teamRows, now);
    if (paid) summary.charged += teamRows.length;
    else summary.failed += teamRows.length;
  }
  return summary;
}

async function ownerPlanFor(admin: Admin, workspaceId: string): Promise<string | null> {
  const team = await admin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = (team.data as { owner_id: string | null } | null)?.owner_id;
  if (!ownerId) return null;
  const sub = await admin.from('subscriptions').select('plan').eq('user_id', ownerId).maybeSingle();
  return (sub.data as { plan: string | null } | null)?.plan ?? null;
}

async function ownerEmailFor(admin: Admin, workspaceId: string): Promise<string | null> {
  const team = await admin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = (team.data as { owner_id: string | null } | null)?.owner_id;
  if (!ownerId) return null;
  const user = await admin.auth.admin.getUserById(ownerId).catch(() => null);
  return user?.data?.user?.email?.toLowerCase() ?? null;
}

/** Charge one team's due add-ons in one payment. True when Paystack confirmed it. */
async function chargeTeamAddons(
  admin: Admin,
  workspaceId: string,
  rows: Array<AddonRow & { workspaceId: string }>,
  now: Date
): Promise<boolean> {
  const card = await loadSavedCard(admin, workspaceId, await ownerEmailFor(admin, workspaceId));
  const amountKobo = rows.reduce((total, row) => total + row.unitPriceKobo * row.quantity, 0);
  const reference = `${ADDON_RENEWAL_REFERENCE_PREFIX}${randomBytes(12).toString('hex')}`;
  const fail = async (why: string) => {
    console.warn(`[addons] renewal failed for ${workspaceId}: ${why}`);
    await admin
      .from(ADDONS)
      .update({ failed_at: now.toISOString(), last_charge_reference: reference, updated_at: now.toISOString() })
      .in('id', rows.map((row) => row.id));
    await logBillingEvent(admin, {
      workspaceId,
      ownerUserId: null,
      actorUserId: null,
      type: 'addon_renewal_failed',
      metadata: { reference, amountNaira: amountKobo / 100, why, addons: rows.map((row) => row.id) },
    });
    return false;
  };
  if (!card) return fail('no saved card');

  const charged = await chargeSavedCard({
    card,
    amountKobo,
    reference,
    metadata: { source: 'team_addon_renewal', workspace_id: workspaceId, addon_ids: rows.map((row) => row.id) },
  });
  if (!charged.ok) return fail(charged.message);
  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok || verified.data.status !== 'success' || verified.data.requestedAmountKobo !== amountKobo) {
    return fail(verified.ok ? `status ${verified.data.status}` : verified.message);
  }

  for (const row of rows) {
    // The new period runs on from the old end, so a late charge does not move the date.
    const from = row.currentPeriodEnd ? new Date(row.currentPeriodEnd) : now;
    await admin
      .from(ADDONS)
      .update({
        current_period_end: periodEndFrom(from, row.interval).toISOString(),
        failed_at: null,
        last_charge_reference: reference,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id);
    await afterAddonPaid(admin, row, {
      reference: `${reference}:${row.id}`,
      amountKobo: row.unitPriceKobo * row.quantity,
      paidAt: now,
      actorUserId: null,
      via: 'renewal',
      renewal: true,
    });
  }
  return true;
}

/** Pay for a team's paused add-ons now, on the saved card, and turn them back on. */
export async function resumePausedAddons(admin: Admin, team: BillingTeam, now: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  if (!team.canBuy) return { ok: false, error: 'Ask the person who runs your team to pay.' };
  const rows = await admin.from(ADDONS).select(COLUMNS).eq('workspace_id', team.workspaceId).eq('status', 'paused');
  const paused = ((rows.data ?? []) as RawAddon[]).map(toRow);
  if (paused.length === 0) return { ok: true };
  // Paused rows start a fresh period today.
  const fresh = paused.map((row) => ({ ...row, currentPeriodEnd: now.toISOString() }));
  const paid = await chargeTeamAddons(admin, team.workspaceId, fresh, now);
  if (!paid) return { ok: false, error: 'Your card was not charged. Try another card from Plan, or try again later.' };
  await admin.from(ADDONS).update({ status: 'active', updated_at: now.toISOString() }).in('id', paused.map((row) => row.id));
  return { ok: true };
}

export type { AddonInterval };

// ─── the ₦100 card check ───────────────────────────────────────────────────

/** Open Paystack for ₦100, card only, to save a card for credits past the
 *  allowance when the team has none on file. Refunded once it settles. */
export async function startCardCheck(
  admin: Admin,
  input: { team: BillingTeam; user: { id: string; email: string | null }; callbackUrl: string }
): Promise<AddonCheckoutResult> {
  if (!isPaystackConfigured()) return { ok: false, status: 503, error: 'Payments are not available right now. Try again later.' };
  if (!input.team.canBuy) return { ok: false, status: 403, error: 'Ask the person who runs your team to add a card.' };
  const email = String(input.user.email || '').trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: 'Add an email to your account first.' };
  const reference = `${CARD_CHECK_REFERENCE_PREFIX}${randomBytes(16).toString('hex')}`;
  const initialized = await initializePaystackTransaction({
    email,
    amountKobo: CARD_CHECK_KOBO,
    reference,
    callbackUrl: input.callbackUrl,
    metadata: { source: 'card_check', workspace_id: input.team.workspaceId, user_id: input.user.id },
    channels: ['card'],
  });
  if (!initialized.ok) return { ok: false, status: 502, error: 'Could not open the payment page. Try again.' };
  return { ok: true, authorizationUrl: initialized.data.authorizationUrl, reference };
}

/** Save the card from a paid card check and refund the ₦100. */
export async function settleCardCheck(admin: Admin, team: BillingTeam, reference: string): Promise<{ ok: boolean; label?: string; error?: string }> {
  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok) return { ok: false, error: 'We are still checking your card. Try again in a minute.' };
  const meta = verified.data.metadata ?? {};
  if (verified.data.status !== 'success' || meta.source !== 'card_check' || meta.workspace_id !== team.workspaceId) {
    return { ok: false, error: 'That card check did not go through.' };
  }
  if (!verified.data.authorization) return { ok: false, error: 'That card cannot be charged later. Try another card.' };
  await saveCard(admin, team.workspaceId, verified.data.authorization);
  const refund = await createPaystackRefund({ reference, amountKobo: CARD_CHECK_KOBO, merchantNote: 'Card check for AI credits' });
  if (!refund.ok) console.warn('[addons] card check refund failed:', reference, refund.message);
  return { ok: true, label: verified.data.authorization.label };
}
