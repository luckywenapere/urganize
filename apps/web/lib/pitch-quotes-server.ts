/**
 * Building a pitch quote: the server's price for one checkout.
 *
 * Shared by POST /api/pitching/quote (a new checkout, or paying for a pitch
 * that was saved but not paid) and POST /api/pitching/checkout (re-pricing a
 * quote that went stale before the artist paid). Both need the same answer to
 * the same three questions, so there is one implementation:
 *
 *   1. Is every curator taking paid pitches right now? A live price, an
 *      active payout account, and an inbox that is not paused.
 *   2. Is anyone paying themselves? The spec is explicit: never when the payer
 *      and the curator are the same person or the same team.
 *   3. What does it cost? Prices come from curator_pricing, never from the
 *      client, and any open recovery comes off the curator's share.
 *
 * A lib module on purpose, like lib/release-planning-actions-server.ts: it must
 * not import from app/api, which points the dependency the wrong way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ARTIST_PITCH_TERMS_VERSION,
  MAX_PITCHES_PER_CHECKOUT,
  PITCH_PLATFORM_FEE_BPS,
  PITCH_QUOTE_TTL_MINUTES,
  buildQuoteLines,
  generatePitchReference,
  summarizeQuoteLines,
  type CuratorPaymentState,
  type PricedPitch,
  type QuoteLine,
} from './pitch-payments';
import {
  CANNOT_PAY_YOURSELF,
  CURATOR_UNAVAILABLE,
  TOO_MANY_IN_ONE_CHECKOUT,
} from './pitch-payment-copy';
import {
  CURATOR_PROFILES_TABLE,
  QUOTES_TABLE,
  loadCuratorPaymentStates,
  loadRecoveryAvailable,
} from './pitch-payments-server';

const WORKSPACES_TABLE = 'workspaces';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

/** The columns every quote read needs. Never sent to a client as-is: the
 *  routes go through toArtistQuoteView, which builds the payload field by
 *  field. */
export const QUOTE_COLUMNS =
  'id,status,total_kobo,platform_fee_bps,expires_at,paid_at,paystack_reference,paystack_access_code,authorization_url,lines,payer_user_id,owner_user_id,release_id,workspace_id,review_reason,created_at';

/** One pitch in a checkout, before it is priced. */
export type QuoteTarget = {
  pitchId: string;
  curatorUserId: string;
  playlistName: string;
};

export type QuoteRefusal = { ok: false; status: number; error: string; code: string };

/**
 * Question 1 and 2. Answered BEFORE anything is written, so a refusal leaves no
 * half-made pitches behind.
 *
 * `payerTeamOwnerIds` is the payer's releaseOwnerIds from their workspace access
 * context: the owners of every team they belong to, themselves included. A
 * curator in that list owns a team the payer is on. A curator who is a member
 * of the release owner's team is caught by the membership read.
 */
export async function checkPaidCurators(
  admin: SupabaseClient,
  input: {
    curatorUserIds: string[];
    payerUserId: string;
    ownerUserId: string;
    payerTeamOwnerIds: string[];
  }
): Promise<{ ok: true; states: Map<string, CuratorPaymentState> } | QuoteRefusal> {
  const ids = Array.from(new Set(input.curatorUserIds.filter(Boolean)));
  if (!ids.length) {
    return { ok: false, status: 400, error: 'Pick at least one curator.', code: 'no_curators' };
  }

  const onTeam = await curatorsOnTheTeam(admin, ids, input);
  if (onTeam === null) {
    // Cannot tell, so refuse: this is an anti-abuse check, and being wrong the
    // other way sends money to yourself through us.
    return {
      ok: false,
      status: 503,
      error: 'Could not check that right now. Try again in a minute.',
      code: 'team_check_failed',
    };
  }
  if (onTeam.size) {
    return { ok: false, status: 403, error: CANNOT_PAY_YOURSELF, code: 'self_pay' };
  }

  const states = await loadCuratorPaymentStates(admin, ids);
  for (const id of ids) {
    const state = states.get(id);
    if (!state || state.paused) {
      return { ok: false, status: 409, error: CURATOR_UNAVAILABLE, code: 'curator_paused' };
    }
    if (state.priceKobo === null || !state.subaccountCode || !state.payoutAccountId) {
      return { ok: false, status: 409, error: CURATOR_UNAVAILABLE, code: 'curator_not_paid' };
    }
  }
  return { ok: true, states };
}

/**
 * Every curator in `ids` who is on the payer's team, or null when that cannot
 * be read. The payer themself and the release owner count, so does anyone
 * holding a membership in a team the release owner owns, and so does the owner
 * of any team the payer belongs to.
 */
async function curatorsOnTheTeam(
  admin: SupabaseClient,
  ids: string[],
  input: { payerUserId: string; ownerUserId: string; payerTeamOwnerIds: string[] }
): Promise<Set<string> | null> {
  const onTeam = new Set<string>();
  const teamOwners = new Set([input.payerUserId, input.ownerUserId, ...input.payerTeamOwnerIds]);
  for (const id of ids) if (teamOwners.has(id)) onTeam.add(id);

  const rest = ids.filter((id) => !onTeam.has(id));
  if (!rest.length) return onTeam;

  const ownerIds = Array.from(new Set([input.ownerUserId, ...input.payerTeamOwnerIds].filter(Boolean)));
  const { data: workspaces, error: workspaceError } = await admin
    .from(WORKSPACES_TABLE)
    .select('id')
    .in('owner_id', ownerIds);
  if (workspaceError) return null;

  const workspaceIds = ((workspaces || []) as Array<Record<string, unknown>>).map((row) => String(row.id));
  if (!workspaceIds.length) return onTeam;

  const { data: members, error: memberError } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('user_id')
    .in('workspace_id', workspaceIds)
    .in('user_id', rest)
    .neq('status', 'removed');
  if (memberError) return null;

  for (const row of (members || []) as Array<Record<string, unknown>>) {
    const id = String(row.user_id || '');
    if (id) onTeam.add(id);
  }
  return onTeam;
}

async function loadDisplayNames(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await admin.from(CURATOR_PROFILES_TABLE).select('user_id,display_name').in('user_id', ids);
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    names.set(String(row.user_id || ''), String(row.display_name || ''));
  }
  return names;
}

async function loadOwnerWorkspaceId(admin: SupabaseClient, ownerUserId: string): Promise<string | null> {
  const { data } = await admin
    .from(WORKSPACES_TABLE)
    .select('id')
    .eq('owner_id', ownerUserId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const id = (data as Record<string, unknown> | null)?.id;
  return id ? String(id) : null;
}

/**
 * Older quotes that price any of these pitches stop being payable from here:
 * a pitch has one current price. An older quote that the artist still pays in
 * another tab is not lost money either way. It settles if its pitches are still
 * waiting for payment, and a second payment for the same pitches lands in
 * needs_review, where the founder refunds it.
 */
export async function supersedeOpenQuotes(
  admin: SupabaseClient,
  releaseId: string | null,
  pitchIds: string[],
  exceptQuoteId?: string
): Promise<void> {
  if (!releaseId || !pitchIds.length) return;
  const wanted = new Set(pitchIds);
  const { data } = await admin
    .from(QUOTES_TABLE)
    .select('id,lines')
    .eq('release_id', releaseId)
    .in('status', ['open', 'checkout_started']);
  const stale = ((data || []) as Array<Record<string, unknown>>)
    .filter((row) => String(row.id) !== exceptQuoteId)
    .filter((row) =>
      (Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : []).some((line) =>
        wanted.has(String(line.pitch_id || ''))
      )
    )
    .map((row) => String(row.id));
  if (!stale.length) return;
  await admin
    .from(QUOTES_TABLE)
    .update({ status: 'superseded' })
    .in('id', stale)
    .in('status', ['open', 'checkout_started']);
}

/**
 * Question 3, and the write. Prices each pitch from the states checkPaidCurators
 * returned, takes any open recovery off its curator's share, supersedes older
 * quotes for the same pitches, and stores the new quote for 30 minutes.
 */
export async function insertPitchQuote(
  admin: SupabaseClient,
  input: {
    payerUserId: string;
    ownerUserId: string;
    releaseId: string;
    targets: QuoteTarget[];
    states: Map<string, CuratorPaymentState>;
    now?: Date;
  }
): Promise<{ ok: true; row: Record<string, unknown>; lines: QuoteLine[] } | QuoteRefusal> {
  const now = input.now ?? new Date();
  if (!input.targets.length) {
    return { ok: false, status: 400, error: 'Pick at least one curator.', code: 'no_curators' };
  }
  if (input.targets.length > MAX_PITCHES_PER_CHECKOUT) {
    return {
      ok: false,
      status: 400,
      error: TOO_MANY_IN_ONE_CHECKOUT(MAX_PITCHES_PER_CHECKOUT),
      code: 'too_many',
    };
  }

  const curatorIds = Array.from(new Set(input.targets.map((target) => target.curatorUserId)));
  const [recovery, names, workspaceId] = await Promise.all([
    loadRecoveryAvailable(admin, curatorIds, now),
    loadDisplayNames(admin, curatorIds),
    loadOwnerWorkspaceId(admin, input.ownerUserId),
  ]);

  const priced: PricedPitch[] = [];
  for (const target of input.targets) {
    const state = input.states.get(target.curatorUserId);
    if (!state || state.priceKobo === null || !state.subaccountCode || !state.payoutAccountId) {
      return { ok: false, status: 409, error: CURATOR_UNAVAILABLE, code: 'curator_not_paid' };
    }
    priced.push({
      pitchId: target.pitchId,
      curatorUserId: target.curatorUserId,
      curatorName: names.get(target.curatorUserId) || 'Playlist owner',
      playlistName: target.playlistName,
      priceKobo: state.priceKobo,
      responseWindowHours: state.responseWindowHours,
      payoutAccountId: state.payoutAccountId,
      subaccountCode: state.subaccountCode,
    });
  }

  const lines = buildQuoteLines({ pitches: priced, recoveryAvailable: recovery, feeBps: PITCH_PLATFORM_FEE_BPS });
  const summary = summarizeQuoteLines(lines);
  if (summary.totalKobo <= 0) {
    return { ok: false, status: 409, error: CURATOR_UNAVAILABLE, code: 'nothing_to_charge' };
  }

  await supersedeOpenQuotes(
    admin,
    input.releaseId,
    input.targets.map((target) => target.pitchId)
  );

  const { data, error } = await admin
    .from(QUOTES_TABLE)
    .insert({
      workspace_id: workspaceId,
      owner_user_id: input.ownerUserId,
      payer_user_id: input.payerUserId,
      release_id: input.releaseId,
      total_kobo: summary.totalKobo,
      platform_fee_bps: PITCH_PLATFORM_FEE_BPS,
      lines,
      paystack_reference: generatePitchReference(),
      status: 'open',
      artist_terms_version: ARTIST_PITCH_TERMS_VERSION,
      expires_at: new Date(now.getTime() + PITCH_QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    })
    .select(QUOTE_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    console.error('[pitch-quotes] could not save the quote', error?.message);
    return { ok: false, status: 500, error: 'Could not price your pitch. Try again.', code: 'quote_failed' };
  }
  return { ok: true, row: data as unknown as Record<string, unknown>, lines };
}

/** The pitches a stored quote prices, as targets for re-pricing it. */
export function targetsFromQuoteLines(lines: unknown): QuoteTarget[] {
  return (Array.isArray(lines) ? (lines as Array<Record<string, unknown>>) : [])
    .map((line) => ({
      pitchId: String(line.pitch_id || ''),
      curatorUserId: String(line.curator_user_id || ''),
      playlistName: String(line.playlist_name || ''),
    }))
    .filter((target) => target.pitchId && target.curatorUserId);
}

/**
 * Does a stored quote still match what these curators charge right now? A
 * price change, a new bank account or a curator who stopped taking paid
 * pitches all mean the stored split would send money somewhere it should not
 * go, so the checkout re-prices instead of charging.
 */
export function quoteStillMatches(lines: unknown, states: Map<string, CuratorPaymentState>): boolean {
  const rows = Array.isArray(lines) ? (lines as Array<Record<string, unknown>>) : [];
  if (!rows.length) return false;
  return rows.every((line) => {
    const state = states.get(String(line.curator_user_id || ''));
    return (
      Boolean(state) &&
      !state!.paused &&
      state!.priceKobo === Number(line.price_kobo) &&
      state!.subaccountCode === String(line.subaccount_code || '') &&
      state!.payoutAccountId === String(line.payout_account_id || '')
    );
  });
}
