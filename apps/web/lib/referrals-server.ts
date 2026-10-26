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
import { randomInt } from 'node:crypto';
import { afterResponse } from './after-response';
import { logBillingEvent } from './billing-events-server';
import { isMissingColumnError } from './billing-schema';
import { isPaymentChannel, type PaymentChannel } from './billing-margin';
import { recordTrmFeeForPayment } from './trm/partner-ledger-server';
import { introMonthsLeft } from './intro-price';
import type { BillingInterval } from '@urganize/pricing';
import { adjustCredits, readBalances } from './credits/credits-server';
import { isEmailConfigured, sendEmail } from './email';
import { APP_URL } from './email/links';
import { sendPushToUsers } from './push-server';
import {
  REFERRAL_REWARD_URL,
  buildReferralRewardPush,
  buildReferralStats,
  clawbackDedupeKey,
  decideClawback,
  decideReward,
  generatePersonalCode,
  isReferralCreditsEnabled,
  rewardDedupeKey,
  type ReferralStats,
} from './referral-credits';
import {
  buildPartnerStatement,
  chargeExclusionWhenRecorded,
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
 * Idempotent on the reference, so a redelivered webhook counts once. Never
 * throws.
 *
 * SINCE 2026-10-22 IT RECORDS WHETHER OR NOT REFERRALS ARE ON. The same rows
 * feed the admin margin view (/admin/billing), which needs every payment and how
 * it was paid. A row written while referrals are off goes in already excluded
 * (chargeExclusionWhenRecorded), because a team tagged before the switch went
 * off would otherwise earn its partner commission on it. The three columns
 * 20261022170000 adds are written when given and dropped on a database that
 * does not have them yet.
 *
 * IT IS ALSO WHERE WE RECORD WHAT WE OWE TRM, because every paid period comes
 * through here after the money has landed (card, transfer, Mark paid, renewal).
 * Only when the caller names the period: guessing it from the plan would read a
 * Label row as yearly (the legacy rule in resolveBillingInterval). Plan-change
 * top-ups owe nothing: they pay for days already covered.
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
    /** How it was paid. */
    channel?: PaymentChannel | null;
    /** The period this payment buys. Required for the TRM fee to be recorded. */
    interval?: BillingInterval | null;
    /** PRICE_LIST_VERSION at checkout, or null when not known. */
    planVersion?: string | null;
    /** Paid at the starting price (20261026200000). */
    intro?: boolean;
  }
): Promise<void> {
  try {
    if (!input.reference || !Number.isFinite(input.amountKobo) || input.amountKobo < 0) return;
    const chargedAt = input.chargedAt ?? new Date();
    const workspace = await admin.from('workspaces').select('id').eq('owner_id', input.userId).maybeSingle();
    const workspaceId = (workspace.data as { id: string } | null)?.id ?? null;
    const base = {
      reference: input.reference,
      workspace_id: workspaceId,
      user_id: input.userId,
      amount_kobo: Math.round(input.amountKobo),
      plan: input.plan,
      source: input.source,
      charged_at: chargedAt.toISOString(),
      ...chargeExclusionWhenRecorded(isReferralsEnabled(), chargedAt),
    };
    const extra = {
      payment_channel: input.channel ?? null,
      billing_interval: input.interval ?? null,
      plan_version: input.planVersion ?? null,
      intro: input.intro === true,
    };
    let { error } = await admin
      .from('subscription_charges')
      .upsert({ ...base, ...extra }, { onConflict: 'reference', ignoreDuplicates: true });
    if (error && isMissingColumnError(error)) {
      ({ error } = await admin
        .from('subscription_charges')
        .upsert(base, { onConflict: 'reference', ignoreDuplicates: true }));
    }
    if (error) console.error('[referrals] could not record a charge:', error.message, input.reference);

    if (input.source !== 'plan_change' && input.interval) {
      await recordTrmFeeForPayment(admin, {
        userId: input.userId,
        reference: input.reference,
        plan: input.plan,
        interval: input.interval,
        amountPaidKobo: input.amountKobo,
        chargedAt,
        workspaceId,
      });
    }
  } catch (error) {
    console.error('[referrals] recording a charge threw:', error);
  }
}

/**
 * Starting-price months a team owner has left (lib/intro-price.ts holds the
 * rule). Reads profiles.paid_at and this table's intro rows. An unreadable
 * table counts as no starting-price payments, so a team that paid before gets
 * full price rather than an open-ended discount.
 */
export async function loadIntroMonthsLeft(admin: SupabaseClient, userId: string): Promise<number> {
  const [profile, charges] = await Promise.all([
    admin.from('profiles').select('paid_at').eq('id', userId).maybeSingle(),
    admin
      .from('subscription_charges')
      .select('reference', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('intro', true),
  ]);
  const paidBefore = Boolean((profile.data as { paid_at: string | null } | null)?.paid_at);
  return introMonthsLeft({ paidBefore, introChargesUsed: charges.error ? 0 : (charges.count ?? 0) });
}

/**
 * How each owner last paid, for the admin margin view (/admin/billing). Reads
 * the newest subscription_charges row per user that carries a channel. Lives
 * here because this module is the only one allowed to touch that table. Read
 * only; an unreadable table (or a database before 20261022170000) gives an
 * empty map, and the page falls back to the team's payment_method.
 */
export async function loadLatestChargeChannels(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<Map<string, PaymentChannel>> {
  const out = new Map<string, PaymentChannel>();
  if (userIds.length === 0) return out;
  try {
    const { data, error } = await admin
      .from('subscription_charges')
      .select('user_id, payment_channel, charged_at')
      .in('user_id', userIds.slice(0, 1000))
      .not('payment_channel', 'is', null)
      .order('charged_at', { ascending: false })
      .limit(5000);
    if (error) return out;
    for (const row of (data ?? []) as Array<{ user_id: string; payment_channel: string | null }>) {
      if (out.has(row.user_id)) continue;
      if (isPaymentChannel(row.payment_channel)) out.set(row.user_id, row.payment_channel);
    }
  } catch {
    // An empty map is the honest answer.
  }
  return out;
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
  | { ok: true; kind: 'partner' | 'team'; partnerId: string; partnerName: string }
  | { ok: false; reason: AttachRefusal; message: string };

function refused(reason: AttachRefusal): AttachResult {
  return { ok: false, reason, message: describeAttachRefusal(reason) };
}

/** Self-serve checkout (2026-10-22): who a code belongs to, for the checkout's
 *  "Code from <name>" line. A partner's code, then (when `teams` is on) a team's
 *  own code. Reads only; tagging still happens through attachReferral once the
 *  team exists. Null for anything unknown or a switched-off partner. */
export async function lookupReferralCode(
  admin: SupabaseClient,
  code: string,
  options: { teams: boolean }
): Promise<{ kind: 'partner' | 'team'; name: string } | null> {
  const partner = await admin.from('referral_partners').select('name,active').eq('code', code).maybeSingle();
  const row = partner.data as { name: string | null; active: boolean | null } | null;
  if (row && row.active !== false) return { kind: 'partner', name: row.name || 'A partner' };
  if (!options.teams) return null;
  const team = await admin.from('referral_codes').select('workspace_id').eq('code', code).maybeSingle();
  const workspaceId = (team.data as { workspace_id: string } | null)?.workspace_id ?? null;
  if (!workspaceId) return null;
  const name = await admin.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
  return { kind: 'team', name: (name.data as { name: string | null } | null)?.name || 'Another team' };
}

/**
 * Tags a person's own team to whoever the code on their signup link belongs to:
 * a commission partner (team_referrals) or, when referral credits are on, another
 * team's personal code (user_referrals). Used by the signup link (the caller is
 * the new account) and, with `byAdmin`, by the founder for a team that missed
 * the link.
 *
 * A team is tagged once, ever, across both tables. A partner's code is looked up
 * first, so the two kinds of code can share the one `?ref=` link without
 * ambiguity.
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

    // Only look for a team's personal code when it is not a partner's, and only
    // while referral credits are on.
    let referrer: { workspaceId: string; name: string } | null = null;
    if (!partner && isReferralCreditsEnabled()) {
      const codeResult = await admin
        .from('referral_codes')
        .select('workspace_id')
        .eq('code', code)
        .maybeSingle();
      const referrerId = (codeResult.data as { workspace_id: string } | null)?.workspace_id ?? null;
      if (!codeResult.error && referrerId) {
        const nameResult = await admin.from('workspaces').select('name').eq('id', referrerId).maybeSingle();
        referrer = {
          workspaceId: referrerId,
          name: (nameResult.data as { name: string | null } | null)?.name || 'another team',
        };
      }
    }

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
      const [partnerTag, teamTag, memberResult] = await Promise.all([
        admin.from('team_referrals').select('workspace_id').eq('workspace_id', workspace.id).maybeSingle(),
        // Absent before the credits migration is applied; that must not stop a
        // partner tag, so an error here counts as "not tagged this way".
        admin.from('user_referrals').select('referred_workspace_id').eq('referred_workspace_id', workspace.id).maybeSingle(),
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
      alreadyTagged = partnerTag.error ? true : Boolean(partnerTag.data) || Boolean(teamTag.data);
      joinedByInvite = memberResult.error ? true : ((memberResult.data as unknown[] | null) ?? []).length > 0;
    }

    const decision = decideAttach({
      codeWasValid: true,
      partner: partner ? { active: partner.active } : referrer ? { active: true } : null,
      workspace: workspace ? { createdAt: workspace.created_at } : null,
      alreadyTagged,
      selfReferral: Boolean(referrer && workspace && referrer.workspaceId === workspace.id),
      joinedByInvite,
      now,
      skipSelfServiceChecks: Boolean(input.byAdmin),
    });
    if (!decision.ok) return refused(decision.reason);
    if (!workspace) return refused('no_team');

    if (partner) {
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
      afterResponse('referral tagged record', () =>
        logBillingEvent(admin, {
          workspaceId: workspace.id,
          ownerUserId: input.ownerUserId,
          actorUserId: input.byAdmin?.userId ?? input.ownerUserId,
          type: 'referral_attached',
          metadata: { kind: 'partner', partnerId: partner.id, code, source: input.byAdmin ? 'admin' : 'link' },
        })
      );
      return { ok: true, kind: 'partner', partnerId: partner.id, partnerName: partner.name };
    }

    if (referrer) {
      const { error } = await admin.from('user_referrals').insert({
        referred_workspace_id: workspace.id,
        referrer_workspace_id: referrer.workspaceId,
        code_used: code,
        attached_at: now.toISOString(),
      });
      if (error) {
        if ((error as { code?: string }).code === '23505') return refused('already_tagged');
        console.error('[referrals] could not record an invite:', error.message);
        return refused('no_team');
      }
      afterResponse('referral tagged record', () =>
        logBillingEvent(admin, {
          workspaceId: workspace.id,
          ownerUserId: input.ownerUserId,
          actorUserId: input.byAdmin?.userId ?? input.ownerUserId,
          type: 'referral_attached',
          metadata: { kind: 'team', referrerWorkspaceId: referrer.workspaceId, code, source: input.byAdmin ? 'admin' : 'link' },
        })
      );
      return { ok: true, kind: 'team', partnerId: referrer.workspaceId, partnerName: referrer.name };
    }

    return refused('unknown_code');
  } catch (error) {
    console.error('[referrals] tagging threw:', error);
    return refused('no_team');
  }
}

// -------------------------------------------------------- personal codes and rewards

/** The team's own invite code and what it has earned. Creates the code the first
 *  time it is asked for. Returns null when it cannot be established. */
export async function getOrCreatePersonalReferral(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ code: string; stats: ReferralStats } | null> {
  try {
    let code: string | null = null;
    const existing = await admin.from('referral_codes').select('code').eq('workspace_id', workspaceId).maybeSingle();
    if (existing.error) return null;
    code = (existing.data as { code: string } | null)?.code ?? null;

    for (let attempt = 0; !code && attempt < 5; attempt += 1) {
      const candidate = generatePersonalCode((max) => randomInt(max));
      // A code lives in the same namespace as a partner's, so one that a partner
      // already holds is skipped rather than racing the unique index.
      const taken = await admin.from('referral_partners').select('id').eq('code', candidate).maybeSingle();
      if (taken.error || taken.data) continue;
      const inserted = await admin.from('referral_codes').insert({ workspace_id: workspaceId, code: candidate });
      if (!inserted.error) {
        code = candidate;
        break;
      }
      if ((inserted.error as { code?: string }).code === '23505') {
        // Either another request created this team's code first, or the random
        // code collided. Read again; if the team now has one, use it.
        const again = await admin.from('referral_codes').select('code').eq('workspace_id', workspaceId).maybeSingle();
        code = (again.data as { code: string } | null)?.code ?? null;
        continue;
      }
      console.error('[referrals] could not create a personal code:', inserted.error.message);
      return null;
    }
    if (!code) return null;

    const rows = await admin
      .from('user_referrals')
      .select('rewarded_at,reward_credits,reversed_at')
      .eq('referrer_workspace_id', workspaceId);
    if (rows.error) return null;
    const stats = buildReferralStats(
      (
        (rows.data as Array<{
          rewarded_at: string | null;
          reward_credits: number | null;
          reversed_at: string | null;
        }> | null) ?? []
      ).map((row) => ({
        rewardedAt: row.rewarded_at,
        rewardCredits: row.reward_credits,
        reversedAt: row.reversed_at,
      }))
    );
    return { code, stats };
  } catch (error) {
    console.error('[referrals] could not read a personal code:', error);
    return null;
  }
}

/**
 * Pays the inviting team when the team it invited makes its first payment.
 * Called from the payment webhook, so it never throws and does nothing while the
 * switch is off. Idempotent: the credit has a ledger key naming the invited
 * team, so a redelivered payment cannot pay twice.
 *
 * The credit is written BEFORE the row is marked rewarded. The other order could
 * mark a reward paid and then fail to pay it; this order can at worst leave a
 * paid reward unmarked, and the ledger key stops a second payment.
 */
export async function rewardReferrerOnFirstPayment(
  admin: SupabaseClient,
  input: { payerUserId: string; reference: string }
): Promise<void> {
  if (!isReferralsEnabled() || !isReferralCreditsEnabled()) return;
  try {
    const workspace = await admin.from('workspaces').select('id').eq('owner_id', input.payerUserId).maybeSingle();
    const referredId = (workspace.data as { id: string } | null)?.id;
    if (!referredId) return;

    const referral = await admin
      .from('user_referrals')
      .select('referrer_workspace_id,rewarded_at')
      .eq('referred_workspace_id', referredId)
      .maybeSingle();
    if (referral.error || !referral.data) return;
    const row = referral.data as { referrer_workspace_id: string; rewarded_at: string | null };

    const paid = await admin
      .from('user_referrals')
      .select('referred_workspace_id', { count: 'exact', head: true })
      .eq('referrer_workspace_id', row.referrer_workspace_id)
      .not('rewarded_at', 'is', null)
      .is('reversed_at', null);

    const decision = decideReward({
      referral: { rewardedAt: row.rewarded_at },
      rewardsAlreadyPaid: paid.error ? null : (paid.count ?? 0),
    });
    if (!decision.reward) return;

    const referrer = await admin.from('workspaces').select('owner_id').eq('id', row.referrer_workspace_id).maybeSingle();
    const referrerOwner = (referrer.data as { owner_id: string | null } | null)?.owner_id ?? null;
    if (!referrerOwner) return;

    const granted = await adjustCredits(admin, {
      workspaceId: row.referrer_workspace_id,
      ownerUserId: referrerOwner,
      actorUserId: input.payerUserId,
      credits: decision.credits,
      source: 'referral',
      note: 'A team you invited subscribed.',
      dedupeKey: rewardDedupeKey(referredId),
    });
    // A false here is either a real failure or "already paid" (the ledger key
    // refused a second row). Either way there is nothing more to do now; the
    // row is marked below only when the grant landed.
    if (!granted) return;

    const marked = await admin
      .from('user_referrals')
      .update({ rewarded_at: new Date().toISOString(), reward_credits: decision.credits })
      .eq('referred_workspace_id', referredId)
      .is('rewarded_at', null);
    if (marked.error) console.error('[referrals] reward paid but not marked:', marked.error.message, input.reference);

    // Told once, and only when THIS call paid the reward: a redelivery stops at
    // `if (!granted) return` above, so it can never tell them twice.
    await notifyReferrerOfReward(admin, {
      ownerUserId: referrerOwner,
      credits: decision.credits,
      referredWorkspaceId: referredId,
    });
  } catch (error) {
    console.error('[referrals] rewarding a referrer threw:', error);
  }
}

/**
 * Push and email the inviting team's owner that they earned credits. Both, every
 * time (the credits-submitted precedent): the push is the ping, the email is
 * the record. Never throws, and a failure of one never stops the other, because
 * the reward is already paid and nothing here is worth failing a payment over.
 * Not the in-app bell: it is task-scoped and desktop-only.
 */
async function notifyReferrerOfReward(
  admin: SupabaseClient,
  input: { ownerUserId: string; credits: number; referredWorkspaceId: string }
): Promise<void> {
  const push = buildReferralRewardPush(input.credits, input.referredWorkspaceId);
  await Promise.all([
    sendPushToUsers(admin, [input.ownerUserId], push).catch((error) =>
      console.error('[referrals] reward push failed:', error instanceof Error ? error.message : error)
    ),
    (async () => {
      try {
        if (!isEmailConfigured()) return;
        const { data } = await admin.auth.admin.getUserById(input.ownerUserId);
        const email = data?.user?.email;
        if (!email) return;
        const metadataName = data.user?.user_metadata?.name;
        await sendEmail(admin, {
          templateId: 'referral_reward',
          to: email,
          props: {
            recipientName: typeof metadataName === 'string' ? metadataName : '',
            credits: input.credits,
            creditsUrl: `${APP_URL}${REFERRAL_REWARD_URL}`,
          },
          trigger: 'referral_reward',
          recipientUserId: input.ownerUserId,
        });
      } catch (error) {
        console.error('[referrals] reward email failed:', error instanceof Error ? error.message : error);
      }
    })(),
  ]);
}

// ---------------------------------------------------------------- refunds

/**
 * What a refund does to referrals. Called from the payment webhook on
 * `refund.processed`, so it never throws.
 *
 * Two things, both decided by the refund being of a payment we recorded:
 *   1. A FULL refund of any recorded charge stops it earning partner commission
 *      (the strategy doc: no commission on refunds). It is the same exclusion the
 *      admin can set by hand on the partner statement, and "Restore" there still
 *      undoes it.
 *   2. A full refund of the payment that EARNED an inviter's reward takes the
 *      reward back (rules in `decideClawback`).
 *
 * It is deliberately NOT behind the two switches: a reward already paid has to be
 * recoverable even if the feature is later switched off. When the switches were
 * never on there are no recorded charges, so it finds nothing and does nothing.
 *
 * Idempotent: the exclusion only sets an empty column, the clawback has a ledger
 * key naming the invited team, and the referral row is only stamped once.
 */
export async function handleRefundForReferrals(
  admin: SupabaseClient,
  input: { reference: string; refundAmountKobo: number }
): Promise<void> {
  try {
    if (!input.reference) return;
    const charge = await admin
      .from('subscription_charges')
      .select('workspace_id,amount_kobo,excluded_at')
      .eq('reference', input.reference)
      .maybeSingle();
    const row = charge.data as { workspace_id: string | null; amount_kobo: number; excluded_at: string | null } | null;
    if (charge.error || !row) return;

    const fullRefund = row.amount_kobo > 0 && input.refundAmountKobo >= row.amount_kobo;
    if (fullRefund && !row.excluded_at) {
      const excluded = await admin
        .from('subscription_charges')
        .update({ excluded_at: new Date().toISOString(), excluded_reason: 'Refunded in Paystack' })
        .eq('reference', input.reference)
        .is('excluded_at', null);
      if (excluded.error) console.error('[referrals] could not exclude a refunded charge:', excluded.error.message, input.reference);
    }

    if (row.workspace_id) {
      await reverseRewardForRefund(admin, {
        referredWorkspaceId: row.workspace_id,
        reference: input.reference,
        chargeAmountKobo: row.amount_kobo,
        refundAmountKobo: input.refundAmountKobo,
      });
    }
  } catch (error) {
    console.error('[referrals] handling a refund threw:', error);
  }
}

async function reverseRewardForRefund(
  admin: SupabaseClient,
  input: { referredWorkspaceId: string; reference: string; chargeAmountKobo: number; refundAmountKobo: number }
): Promise<void> {
  const referral = await admin
    .from('user_referrals')
    .select('referrer_workspace_id,rewarded_at,reward_credits,reversed_at')
    .eq('referred_workspace_id', input.referredWorkspaceId)
    .maybeSingle();
  if (referral.error || !referral.data) return;
  const referralRow = referral.data as {
    referrer_workspace_id: string;
    rewarded_at: string | null;
    reward_credits: number | null;
    reversed_at: string | null;
  };
  // Cheap exits first: most refunds are not of a rewarded team's first payment.
  if (!referralRow.rewarded_at || referralRow.reversed_at) return;

  const first = await admin
    .from('subscription_charges')
    .select('reference')
    .eq('workspace_id', input.referredWorkspaceId)
    .order('charged_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const firstReference = (first.data as { reference: string } | null)?.reference ?? null;

  const balances = await readBalances(admin, referralRow.referrer_workspace_id);
  const decision = decideClawback({
    referral: {
      rewardedAt: referralRow.rewarded_at,
      reversedAt: referralRow.reversed_at,
      rewardCredits: referralRow.reward_credits,
    },
    refundedReference: input.reference,
    firstChargeReference: first.error ? null : firstReference,
    chargeAmountKobo: input.chargeAmountKobo,
    refundAmountKobo: input.refundAmountKobo,
    // The reward was written to the top-up pool, so that is the pool it comes back from.
    referrerCredits: balances ? balances.topup : null,
  });
  if (!decision.clawback) {
    if (decision.reason === 'balance_unreadable') {
      console.error('[referrals] a refund should take back a reward but the balance could not be read:', input.reference);
    }
    return;
  }

  if (decision.take > 0) {
    const referrer = await admin
      .from('workspaces')
      .select('owner_id')
      .eq('id', referralRow.referrer_workspace_id)
      .maybeSingle();
    const referrerOwner = (referrer.data as { owner_id: string | null } | null)?.owner_id ?? null;
    if (!referrerOwner) return;
    const taken = await adjustCredits(admin, {
      workspaceId: referralRow.referrer_workspace_id,
      ownerUserId: referrerOwner,
      actorUserId: referrerOwner,
      credits: -decision.take,
      source: 'referral',
      note: 'A team you invited was refunded, so the reward was taken back.',
      dedupeKey: clawbackDedupeKey(input.referredWorkspaceId),
    });
    // False is a real failure or "already taken back" (the ledger key refused a
    // second row). Either way, stamp nothing now; a redelivery tries again.
    if (!taken) return;
  }

  const marked = await admin
    .from('user_referrals')
    .update({ reversed_at: new Date().toISOString(), reversed_credits: decision.take })
    .eq('referred_workspace_id', input.referredWorkspaceId)
    .is('reversed_at', null);
  if (marked.error) console.error('[referrals] reward taken back but not marked:', marked.error.message, input.reference);
  if (decision.shortfall > 0) {
    console.warn(
      `[referrals] a reward was refunded but ${decision.shortfall} of its credits were already spent:`,
      input.referredWorkspaceId
    );
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
      // A signup link can carry a partner's code or a team's personal code, so a
      // partner may not take one a team already holds. (Personal codes are
      // checked against partners the same way when they are made.)
      const personal = await admin.from('referral_codes').select('workspace_id').eq('code', action.code).maybeSingle();
      if (personal.data) return { ok: false, status: 409, error: 'That code is already taken.' };
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
      return {
        ok: true,
        message:
          result.kind === 'partner'
            ? `Tagged to ${result.partnerName}. Only payments from now on earn commission.`
            : `Recorded as invited by ${result.partnerName}. They earn credits when this team first pays.`,
      };
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
