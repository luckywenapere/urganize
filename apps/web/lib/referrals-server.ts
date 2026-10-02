// Referral partners: the reads and writes. Server only. The rules and the
// numbers are lib/referrals.ts; this file fetches the facts those rules need and
// stores what they decide.
//
// Two kinds of function live here, and they fail in OPPOSITE directions on
// purpose:
//   - recordSubscriptionCharge runs inside the payment webhook. It never throws
//     and never blocks, because a lost commission row costs a console line while
//     an exception would cost a customer their payment confirmation.
//   - attachReferral decides who gets paid, so it fails closed: anything it
//     cannot establish is a refusal, and the founder can still tag by hand.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from './billing-events-server';
import {
  buildPartnerStatement,
  decideAttach,
  describeAttachRefusal,
  isReferralsEnabled,
  normalizeReferralCode,
  referralLink,
  type AttachRefusal,
  type LedgerCharge,
  type PartnerStatement,
  type ReferralAdminAction,
} from './referrals';

const PAGE = 1000;
const MAX_ROWS = 50_000;
const IN_CHUNK = 100;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ------------------------------------------------------------ the charge ledger

export type ChargeSource = 'initial' | 'renewal' | 'plan_change' | 'manual';

/**
 * Writes one subscription payment into the ledger commission is worked out from.
 * Idempotent on the reference, so a redelivered webhook counts once. Does
 * nothing while the switch is off, and never throws.
 */
export async function recordSubscriptionCharge(
  admin: SupabaseClient,
  input: {
    userId: string;
    reference: string;
    amountKobo: number;
    plan: string | null;
    source: ChargeSource;
    chargedAt?: Date;
  }
): Promise<void> {
  if (!isReferralsEnabled()) return;
  try {
    if (!input.reference || !Number.isFinite(input.amountKobo) || input.amountKobo < 0) return;
    const workspace = await admin.from('workspaces').select('id').eq('owner_id', input.userId).maybeSingle();
    const workspaceId = (workspace.data as { id: string } | null)?.id ?? null;
    const { error } = await admin.from('subscription_charges').upsert(
      {
        reference: input.reference,
        workspace_id: workspaceId,
        user_id: input.userId,
        amount_kobo: Math.round(input.amountKobo),
        plan: input.plan,
        source: input.source,
        charged_at: (input.chargedAt ?? new Date()).toISOString(),
      },
      { onConflict: 'reference', ignoreDuplicates: true }
    );
    if (error) console.error('[referrals] could not record a charge:', error.message, input.reference);
  } catch (error) {
    console.error('[referrals] recording a charge threw:', error);
  }
}

// ------------------------------------------------------------------- tagging

type PartnerRow = {
  id: string;
  code: string;
  name: string;
  contact_email: string | null;
  commission_bps: number;
  commission_months: number;
  active: boolean;
  created_at: string;
};

export type AttachResult =
  | { ok: true; partnerId: string; partnerName: string }
  | { ok: false; reason: AttachRefusal; message: string };

function refused(reason: AttachRefusal): AttachResult {
  return { ok: false, reason, message: describeAttachRefusal(reason) };
}

/**
 * Tags a person's own team to a partner. Used by the signup link (the caller is
 * the new account) and, with `byAdmin`, by the founder for a team that missed
 * the link.
 */
export async function attachReferral(
  admin: SupabaseClient,
  input: { ownerUserId: string; rawCode: unknown; byAdmin?: { userId: string }; now?: Date }
): Promise<AttachResult> {
  const now = input.now ?? new Date();
  const code = normalizeReferralCode(input.rawCode);
  if (!code) return refused('bad_code');

  try {
    const partnerResult = await admin
      .from('referral_partners')
      .select('id,code,name,active')
      .eq('code', code)
      .maybeSingle();
    if (partnerResult.error) return refused('unknown_code');
    const partner = (partnerResult.data as Pick<PartnerRow, 'id' | 'code' | 'name' | 'active'> | null) ?? null;

    const workspaceResult = await admin
      .from('workspaces')
      .select('id,created_at')
      .eq('owner_id', input.ownerUserId)
      .maybeSingle();
    if (workspaceResult.error) return refused('no_team');
    const workspace = (workspaceResult.data as { id: string; created_at: string | null } | null) ?? null;

    let alreadyTagged = false;
    let joinedByInvite = false;
    if (workspace) {
      const [taggedResult, memberResult] = await Promise.all([
        admin.from('team_referrals').select('workspace_id').eq('workspace_id', workspace.id).maybeSingle(),
        admin
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', input.ownerUserId)
          .eq('status', 'active')
          .neq('role', 'owner')
          .neq('workspace_id', workspace.id)
          .limit(1),
      ]);
      // A read that fails is treated as the worse answer for the caller: tagged,
      // and an invitee. Tagging decides who is paid, so it fails closed.
      alreadyTagged = taggedResult.error ? true : Boolean(taggedResult.data);
      joinedByInvite = memberResult.error ? true : ((memberResult.data as unknown[] | null) ?? []).length > 0;
    }

    const decision = decideAttach({
      codeWasValid: true,
      partner: partner ? { active: partner.active } : null,
      workspace: workspace ? { createdAt: workspace.created_at } : null,
      alreadyTagged,
      joinedByInvite,
      now,
      skipSelfServiceChecks: Boolean(input.byAdmin),
    });
    if (!decision.ok) return refused(decision.reason);
    if (!partner || !workspace) return refused('unknown_code');

    const { error } = await admin.from('team_referrals').insert({
      workspace_id: workspace.id,
      partner_id: partner.id,
      code_used: code,
      source: input.byAdmin ? 'admin' : 'link',
      attached_at: now.toISOString(),
      attached_by: input.byAdmin?.userId ?? null,
    });
    if (error) {
      // 23505 is the primary key: two requests raced and the other one won.
      if ((error as { code?: string }).code === '23505') return refused('already_tagged');
      console.error('[referrals] could not tag a team:', error.message);
      return refused('no_team');
    }

    void logBillingEvent(admin, {
      workspaceId: workspace.id,
      ownerUserId: input.ownerUserId,
      actorUserId: input.byAdmin?.userId ?? input.ownerUserId,
      type: 'referral_attached',
      metadata: { partnerId: partner.id, code, source: input.byAdmin ? 'admin' : 'link' },
    });

    return { ok: true, partnerId: partner.id, partnerName: partner.name };
  } catch (error) {
    console.error('[referrals] tagging threw:', error);
    return refused('no_team');
  }
}

// ------------------------------------------------------------------ overview

export type ChargeRow = {
  reference: string;
  workspaceId: string | null;
  workspaceName: string | null;
  amountKobo: number;
  plan: string | null;
  source: string;
  chargedAt: string;
  excluded: boolean;
  excludedReason: string | null;
};

export type PartnerOverview = {
  id: string;
  code: string;
  name: string;
  contactEmail: string | null;
  active: boolean;
  commissionBps: number;
  commissionMonths: number;
  link: string;
  createdAt: string;
  teamCount: number;
  statement: PartnerStatement;
  /** The most recent payments from this partner's teams, for excluding refunds. */
  recentCharges: ChargeRow[];
};

export async function loadReferralOverview(
  admin: SupabaseClient,
  now: Date,
  appOrigin?: string
): Promise<PartnerOverview[]> {
  const partners = await readAll<PartnerRow>((from, to) =>
    admin
      .from('referral_partners')
      .select('id,code,name,contact_email,commission_bps,commission_months,active,created_at')
      .order('created_at', { ascending: true })
      .range(from, to)
  );
  if (partners.length === 0) return [];

  const referrals = await readAll<{ workspace_id: string; partner_id: string; attached_at: string }>((from, to) =>
    admin.from('team_referrals').select('workspace_id,partner_id,attached_at').range(from, to)
  );
  const workspaceIds = [...new Set(referrals.map((row) => row.workspace_id))];

  const names = new Map<string, string | null>();
  const charges: Array<{
    reference: string;
    workspace_id: string | null;
    amount_kobo: number;
    plan: string | null;
    source: string;
    charged_at: string;
    excluded_at: string | null;
    excluded_reason: string | null;
  }> = [];
  for (const ids of chunk(workspaceIds, IN_CHUNK)) {
    const workspaceRows = await readAll<{ id: string; name: string | null }>((from, to) =>
      admin.from('workspaces').select('id,name').in('id', ids).range(from, to)
    );
    for (const row of workspaceRows) names.set(row.id, row.name);
    const chargeRows = await readAll<(typeof charges)[number]>((from, to) =>
      admin
        .from('subscription_charges')
        .select('reference,workspace_id,amount_kobo,plan,source,charged_at,excluded_at,excluded_reason')
        .in('workspace_id', ids)
        .order('charged_at', { ascending: true })
        .range(from, to)
    );
    charges.push(...chargeRows);
  }

  const payouts = await readAll<{ partner_id: string; month: string; amount_kobo: number; paid_at: string }>((from, to) =>
    admin.from('referral_payouts').select('partner_id,month,amount_kobo,paid_at').range(from, to)
  );

  return partners.map((partner) => {
    const tagged = referrals.filter((row) => row.partner_id === partner.id);
    const taggedIds = new Set(tagged.map((row) => row.workspace_id));
    const partnerCharges = charges.filter((charge) => charge.workspace_id && taggedIds.has(charge.workspace_id));
    const ledger: LedgerCharge[] = partnerCharges.map((charge) => ({
      reference: charge.reference,
      workspaceId: charge.workspace_id,
      amountKobo: charge.amount_kobo,
      chargedAt: charge.charged_at,
      source: charge.source,
      excluded: Boolean(charge.excluded_at),
    }));
    const statement = buildPartnerStatement({
      terms: { commissionBps: partner.commission_bps, commissionMonths: partner.commission_months },
      teams: tagged.map((row) => ({
        workspaceId: row.workspace_id,
        name: names.get(row.workspace_id) ?? null,
        attachedAt: row.attached_at,
      })),
      charges: ledger,
      payouts: payouts
        .filter((payout) => payout.partner_id === partner.id)
        .map((payout) => ({ month: payout.month, amountKobo: payout.amount_kobo, paidAt: payout.paid_at })),
      now,
    });
    const recentCharges: ChargeRow[] = [...partnerCharges]
      .sort((a, b) => (a.charged_at < b.charged_at ? 1 : -1))
      .slice(0, 30)
      .map((charge) => ({
        reference: charge.reference,
        workspaceId: charge.workspace_id,
        workspaceName: charge.workspace_id ? (names.get(charge.workspace_id) ?? null) : null,
        amountKobo: charge.amount_kobo,
        plan: charge.plan,
        source: charge.source,
        chargedAt: charge.charged_at,
        excluded: Boolean(charge.excluded_at),
        excludedReason: charge.excluded_reason,
      }));
    return {
      id: partner.id,
      code: partner.code,
      name: partner.name,
      contactEmail: partner.contact_email,
      active: partner.active,
      commissionBps: partner.commission_bps,
      commissionMonths: partner.commission_months,
      link: referralLink(partner.code, appOrigin),
      createdAt: partner.created_at,
      teamCount: tagged.length,
      statement,
      recentCharges,
    };
  });
}

// -------------------------------------------------------------- admin actions

export type AdminActionResult = { ok: true; message: string } | { ok: false; status: number; error: string };

/** Escapes the three characters `ilike` treats as pattern, so an email with an
 *  underscore matches itself and nothing else. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function applyReferralAdminAction(
  admin: SupabaseClient,
  action: ReferralAdminAction,
  adminUserId: string
): Promise<AdminActionResult> {
  switch (action.type) {
    case 'create_partner': {
      const { error } = await admin.from('referral_partners').insert({
        code: action.code,
        name: action.name,
        contact_email: action.contactEmail,
      });
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return { ok: false, status: 409, error: 'That code is already taken.' };
        }
        return { ok: false, status: 500, error: error.message };
      }
      return { ok: true, message: `Added ${action.name}.` };
    }

    case 'set_partner_active': {
      const { data, error } = await admin
        .from('referral_partners')
        .update({ active: action.active })
        .eq('id', action.partnerId)
        .select('id');
      if (error) return { ok: false, status: 500, error: error.message };
      if (!data || data.length === 0) return { ok: false, status: 404, error: 'No such partner.' };
      return { ok: true, message: action.active ? 'Switched on.' : 'Switched off. Teams already tagged keep earning.' };
    }

    case 'attach_team': {
      const profile = await admin
        .from('profiles')
        .select('id')
        .ilike('email', escapeLike(action.ownerEmail))
        .limit(2);
      if (profile.error) return { ok: false, status: 500, error: profile.error.message };
      const rows = (profile.data as Array<{ id: string }> | null) ?? [];
      if (rows.length === 0) return { ok: false, status: 404, error: 'No account has that email.' };
      if (rows.length > 1) return { ok: false, status: 409, error: 'More than one account has that email.' };
      const result = await attachReferral(admin, {
        ownerUserId: rows[0].id,
        rawCode: action.code,
        byAdmin: { userId: adminUserId },
      });
      if (!result.ok) return { ok: false, status: 409, error: result.message };
      return { ok: true, message: `Tagged to ${result.partnerName}. Only payments from now on earn commission.` };
    }

    case 'exclude_charge': {
      const { data, error } = await admin
        .from('subscription_charges')
        .update({ excluded_at: new Date().toISOString(), excluded_reason: action.reason })
        .eq('reference', action.reference)
        .select('reference');
      if (error) return { ok: false, status: 500, error: error.message };
      if (!data || data.length === 0) return { ok: false, status: 404, error: 'No payment has that reference.' };
      return { ok: true, message: 'Excluded. It no longer earns commission.' };
    }

    case 'restore_charge': {
      const { data, error } = await admin
        .from('subscription_charges')
        .update({ excluded_at: null, excluded_reason: null })
        .eq('reference', action.reference)
        .select('reference');
      if (error) return { ok: false, status: 500, error: error.message };
      if (!data || data.length === 0) return { ok: false, status: 404, error: 'No payment has that reference.' };
      return { ok: true, message: 'Restored.' };
    }

    case 'record_payout': {
      const partner = await admin.from('referral_partners').select('id').eq('id', action.partnerId).maybeSingle();
      if (partner.error) return { ok: false, status: 500, error: partner.error.message };
      if (!partner.data) return { ok: false, status: 404, error: 'No such partner.' };
      const { error } = await admin.from('referral_payouts').upsert(
        {
          partner_id: action.partnerId,
          month: action.month,
          amount_kobo: action.amountKobo,
          paid_at: new Date().toISOString(),
          paid_by: adminUserId,
          note: action.note,
        },
        { onConflict: 'partner_id,month' }
      );
      if (error) return { ok: false, status: 500, error: error.message };
      return { ok: true, message: `Recorded the payout for ${action.month}.` };
    }
  }
}
