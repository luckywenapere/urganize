import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from './billing-events-server';
import {
  artistKeyFor,
  checkExtraReleasePayment,
  decideDistributionLimit,
  EXTRA_RELEASE_PRICE_KOBO,
  EXTRA_RELEASE_REFERENCE_PREFIX,
  EXTRA_RELEASE_SOURCE,
  lagosMonth,
  TRM_PER_RELEASE_KOBO,
  needsPayment,
  type DistributionLimitView,
  type DistributionUseRow,
} from './distribution-limits';
import { loadTeamDistribution } from './distribution-team-server';
import { initializePaystackTransaction, isPaystackConfigured, verifyPaystackTransaction } from './paystack-server';
import { recordTrmExtraRelease } from './trm/partner-ledger-server';

// The ONLY reader and writer of distribution_usage. The rules are in
// lib/distribution-limits.ts; this reads the rows, gates a send, records it,
// and takes the ₦2,100 for a release beyond the plan. Never trusts the browser:
// the verdict is worked out here at every step, and a payment counts only once
// Paystack's own record says it was paid (checkExtraReleasePayment).

type Admin = SupabaseClient;

type ReleaseFacts = { ownerUserId: string; releaseId: string; artistId: string | null; artistName: string | null };

export type LoadedLimit = {
  view: DistributionLimitView;
  workspaceId: string;
  artistKey: string;
};

const USAGE = 'distribution_usage';

function toRow(raw: Record<string, unknown>): DistributionUseRow {
  return {
    releaseId: String(raw.release_id),
    artistKey: String(raw.artist_key),
    artistName: typeof raw.artist_name === 'string' ? raw.artist_name : null,
    kind: raw.kind === 'extra' ? 'extra' : 'plan',
    month: String(raw.month),
    status: raw.status === 'pending' ? 'pending' : raw.status === 'paid' ? 'paid' : 'used',
    createdAt: String(raw.created_at),
  };
}

/** The team's limit view for one release, or null when its plan has no
 *  allowance (Solo, trial, lapsed: the artist's own TRM plan, nothing to count)
 *  or the rows cannot be read (the step then works as before). */
export async function loadDistributionLimit(admin: Admin, facts: ReleaseFacts, now: Date = new Date()): Promise<LoadedLimit | null> {
  if (!facts.ownerUserId) return null;
  const { decision, workspaceId } = await loadTeamDistribution(admin, facts.ownerUserId);
  if (decision.state !== 'included' || !workspaceId) return null;
  const rows = await admin
    .from(USAGE)
    .select('release_id, artist_key, artist_name, kind, month, status, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (rows.error) {
    console.error('[distribution-limits] read failed:', rows.error.message);
    return null;
  }
  const artistKey = artistKeyFor(facts.artistId, facts.artistName) ?? `release:${facts.releaseId}`;
  const view = decideDistributionLimit({
    tier: decision.tier,
    rows: ((rows.data ?? []) as Array<Record<string, unknown>>).map(toRow),
    releaseId: facts.releaseId,
    artistKey,
    now,
  });
  return view ? { view, workspaceId, artistKey } : null;
}

/** Before a send reaches TRM: null when it may go, else the refusal. */
export async function checkDistributionSend(
  admin: Admin,
  facts: ReleaseFacts
): Promise<{ loaded: LoadedLimit | null; refusal: string | null }> {
  const loaded = await loadDistributionLimit(admin, facts);
  if (!loaded || !needsPayment(loaded.view.verdict)) return { loaded, refusal: null };
  return {
    loaded,
    refusal:
      loaded.view.verdict === 'artist'
        ? `Your plan covers ${loaded.view.planArtists.join(', ')}. Pay for this release to send it.`
        : `You've used your ${loaded.view.releasesLimit} releases this month. Pay for this release to send it.`,
  };
}

/** After TRM took a send: count it under the plan, or use up its paid extra.
 *  Best effort: TRM already has the release, so a failure here is logged, not
 *  thrown. */
export async function recordDistributionSend(
  admin: Admin,
  facts: ReleaseFacts & { actorUserId: string },
  loaded: LoadedLimit | null,
  sentAt: Date
): Promise<void> {
  if (!loaded) return;
  try {
    if (loaded.view.verdict === 'ok') {
      const insert = await admin.from(USAGE).upsert(
        {
          workspace_id: loaded.workspaceId,
          release_id: facts.releaseId,
          artist_key: loaded.artistKey,
          artist_name: facts.artistName,
          kind: 'plan',
          month: lagosMonth(sentAt).key,
          status: 'used',
          created_by: facts.actorUserId,
          used_at: sentAt.toISOString(),
        },
        { onConflict: 'release_id', ignoreDuplicates: true }
      );
      if (insert.error) console.error('[distribution-limits] could not count a send:', insert.error.message, facts.releaseId);
    } else if (loaded.view.verdict === 'paid_extra') {
      const update = await admin
        .from(USAGE)
        .update({ status: 'used', used_at: sentAt.toISOString() })
        .eq('release_id', facts.releaseId)
        .eq('kind', 'extra')
        .eq('status', 'paid');
      if (update.error) console.error('[distribution-limits] could not mark an extra used:', update.error.message, facts.releaseId);
    }
  } catch (error) {
    console.error('[distribution-limits] recording a send threw:', error, facts.releaseId);
  }
}

export type ExtraCheckoutResult =
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; status: number; error: string };

/** Open Paystack for one release beyond the plan. Refuses when the release does
 *  not need paying for, so nobody pays for what the plan covers. */
export async function startExtraReleaseCheckout(
  admin: Admin,
  facts: ReleaseFacts & { user: { id: string; email: string | null }; callbackUrl: string }
): Promise<ExtraCheckoutResult> {
  if (!isPaystackConfigured()) return { ok: false, status: 503, error: 'Payments are not available right now. Try again later.' };
  const email = String(facts.user.email || '').trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: 'Add an email to your account before you pay.' };
  const loaded = await loadDistributionLimit(admin, facts);
  if (!loaded) return { ok: false, status: 409, error: 'This release does not need paying for.' };
  if (!needsPayment(loaded.view.verdict)) return { ok: false, status: 409, error: 'Your plan covers this release. Send it.' };

  const reference = `${EXTRA_RELEASE_REFERENCE_PREFIX}${randomBytes(16).toString('hex')}`;
  const pending = await admin.from(USAGE).insert({
    workspace_id: loaded.workspaceId,
    release_id: facts.releaseId,
    artist_key: loaded.artistKey,
    artist_name: facts.artistName,
    kind: 'extra',
    month: lagosMonth(new Date()).key,
    status: 'pending',
    reference,
    amount_kobo: EXTRA_RELEASE_PRICE_KOBO,
    created_by: facts.user.id,
  });
  if (pending.error) {
    console.error('[distribution-limits] could not start an extra release:', pending.error.message);
    return { ok: false, status: 500, error: 'Could not open the payment page. Try again.' };
  }

  const initialized = await initializePaystackTransaction({
    email,
    amountKobo: EXTRA_RELEASE_PRICE_KOBO,
    reference,
    callbackUrl: facts.callbackUrl,
    metadata: {
      source: EXTRA_RELEASE_SOURCE,
      release_id: facts.releaseId,
      workspace_id: loaded.workspaceId,
      user_id: facts.user.id,
      reason: loaded.view.verdict,
      cancel_action: `${facts.callbackUrl}?payment=cancelled`,
    },
  });
  if (!initialized.ok) {
    console.error('[distribution-limits] could not open Paystack:', initialized.message);
    await admin.from(USAGE).delete().eq('reference', reference).eq('status', 'pending');
    return { ok: false, status: 502, error: 'Could not open the payment page. Try again.' };
  }
  return { ok: true, authorizationUrl: initialized.data.authorizationUrl, reference };
}

export type ExtraSettleOutcome =
  | { state: 'paid'; releaseId: string }
  | { state: 'not_paid' }
  | { state: 'mismatch' }
  | { state: 'error'; transient: boolean };

/** Settle an extra-release payment from the webhook or the page the payer lands
 *  on, in either order, any number of times. */
export async function settleExtraRelease(admin: Admin, reference: string, via: 'webhook' | 'callback'): Promise<ExtraSettleOutcome> {
  const verified = await verifyPaystackTransaction(reference);
  if (!verified.ok) return { state: 'error', transient: verified.transient };
  const decision = checkExtraReleasePayment({
    status: verified.data.status,
    currency: verified.data.currency,
    // The price before Paystack's fee, which is passed on to the buyer (#1099).
    amountKobo: verified.data.requestedAmountKobo,
    metadata: verified.data.metadata,
  });
  if (!decision.ok) {
    if (decision.reason === 'mismatch') {
      console.error(`[distribution-limits] MISMATCH on ${reference} (${via}): ${verified.data.amountKobo} ${verified.data.currency}`);
    }
    return { state: decision.reason };
  }

  const row = await admin.from(USAGE).select('id, workspace_id, release_id, status, created_by').eq('reference', reference).maybeSingle();
  const found = row.data as { id: string; workspace_id: string; release_id: string; status: string; created_by: string | null } | null;
  if (row.error) return { state: 'error', transient: true };
  if (!found || found.release_id !== decision.releaseId || found.workspace_id !== decision.workspaceId) {
    console.error(`[distribution-limits] PAID BUT NO MATCHING ROW: ${reference} (${via})`);
    return { state: 'mismatch' };
  }
  if (found.status !== 'pending') return { state: 'paid', releaseId: found.release_id };

  const paidAt = new Date();
  const update = await admin
    .from(USAGE)
    .update({ status: 'paid', paid_at: paidAt.toISOString() })
    .eq('id', found.id)
    .eq('status', 'pending')
    .select('id');
  if (update.error) {
    console.error(`[distribution-limits] PAID BUT NOT RECORDED: ${reference} (${via})`, update.error.message);
    return { state: 'error', transient: true };
  }
  // Only the settle that flipped the row writes what we owe TRM and the event.
  if (Array.isArray(update.data) && update.data.length > 0) {
    const team = await admin.from('workspaces').select('owner_id').eq('id', found.workspace_id).maybeSingle();
    const ownerUserId = (team.data as { owner_id: string } | null)?.owner_id ?? null;
    const tier = ownerUserId ? (await loadTeamDistribution(admin, ownerUserId)).decision : null;
    await recordTrmExtraRelease(admin, {
      workspaceId: found.workspace_id,
      reference,
      tier: tier && tier.state === 'included' && tier.tier === 'label' ? 'label' : 'manager',
      paidKobo: EXTRA_RELEASE_PRICE_KOBO,
      owedKobo: TRM_PER_RELEASE_KOBO,
      paidAt,
    });
    await logBillingEvent(admin, {
      workspaceId: found.workspace_id,
      ownerUserId,
      actorUserId: found.created_by,
      type: 'distribution_extra_paid',
      metadata: { reference, releaseId: found.release_id, priceNaira: EXTRA_RELEASE_PRICE_KOBO / 100, via },
    });
  }
  return { state: 'paid', releaseId: found.release_id };
}
