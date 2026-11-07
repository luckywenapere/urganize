// The cancel flow — the I/O half. Server only. The rules are lib/cancel-flow.ts;
// the route (app/api/billing/cancel-flow/route.ts) parses the request and calls
// these. Nothing here decides a number on its own.
//
// OWNER ONLY. Money rows are keyed to the team owner (subscriptions.user_id),
// the change-plan route's reasoning: an admin teammate cancelling would edit a
// row that is not theirs. Admins and members see no cancel entry at all.
//
// What each action touches:
//   discount        workspaces.cancel_discount_claimed_at + (paid_bonus_days | trial_ends_at)
//   invite_extension workspaces.cancel_invite_extension_at + trial_ends_at
//   pause           Paystack disable; subscriptions.status 'cancelled' + paused_*
//   resume          Paystack enable (period still running) or a checkout link
//   retention offer billing_events + a founder "SWAP NEEDED" email, nothing else
//   cancel          Paystack disable (paid / card trial); workspaces.trial_cancelled_at (trials)
// Every one also writes cancel_flow_events and a PostHog event.

import type { SupabaseClient } from '@supabase/supabase-js';
import { invalidateSubscriptionSnapshot } from './subscription-access';
import { getTeamAccessForUser, invalidateAllTeamAccess } from './team-billing-server';
import { READ_ONLY_REACTIVATE_HREF } from './team-billing';
import { checkSeatAllowance } from './seats-server';
import { logBillingEvent } from './billing-events-server';
import { notifyFounder } from './billing-alerts-server';
import { disablePaystackSubscription, enablePaystackSubscription } from './paystack-subscription-server';
import { isEmailConfigured, sendEmail } from './email';
import {
  CANCEL_DISCOUNT_BONUS_DAYS,
  CANCEL_INVITE_EXTENSION_DAYS,
  PAUSE_OPTIONS,
  budgetBands,
  canStartPause,
  cancelFirstName,
  cleanCancelText,
  computePauseWindow,
  decideCancelDiscount,
  isDiscountAvailable,
  isFreshInvite,
  isInviteExtensionAvailable,
  isPauseActive,
  isRetentionTier,
  matchBudgetOffer,
  pauseSweepAction,
  retentionPlanEnvVar,
  tierMonthlyPrice,
  type BudgetBandId,
  type CancelFlowEvent,
  type CancelFlowKind,
  type CancelFlowOffer,
  type CancelReasonId,
  type PauseOptionId,
  type PublicRetentionOffer,
  type RetentionTierId,
} from './cancel-flow';
import { computeExtendedTrialEnd } from './team-billing';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from './posthog';

const EVENTS_TABLE = 'cancel_flow_events';

/** Trial teams have not picked a plan, so their budget bands are Manager's:
 *  who we sell to first (strategy doc), and the founder's own example. */
const TRIAL_BAND_TIER: RetentionTierId = 'manager';

type WorkspaceRow = {
  id: string;
  owner_id: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  paid_bonus_days: number | null;
  cancel_discount_claimed_at: string | null;
  cancel_invite_extension_at: string | null;
  trial_cancelled_at: string | null;
};

type SubscriptionRow = {
  id: string;
  plan: string | null;
  billing_interval: string | null;
  status: string | null;
  expires_at: string | null;
  paystack_subscription_code: string | null;
  paystack_reference: string | null;
  paused_at: string | null;
  paused_from: string | null;
  paused_until: string | null;
};

export type CancelFlowState = 'active' | 'cancelled' | 'paused';

export type CancelFlowBand = {
  id: BudgetBandId;
  label: string;
  /** The offer this answer gets, without the Paystack code. Null = none. */
  offer: PublicRetentionOffer | null;
};

export type CancelFlowContext = {
  available: true;
  kind: CancelFlowKind;
  state: CancelFlowState;
  firstName: string;
  tier: RetentionTierId | null;
  interval: 'monthly' | 'annual' | null;
  /** When access as it stands ends (period end plus bonus days, or the trial). */
  accessUntil: string | null;
  discountAvailable: boolean;
  inviteAvailable: boolean;
  pauseAvailable: boolean;
  pauseOptions: Array<{ id: PauseOptionId; label: string; pausedFrom: string; pausedUntil: string }>;
  bands: CancelFlowBand[];
  pause: { from: string | null; until: string } | null;
  /** One tap undoes the cancel or pause (the paid period is still running). */
  canResumeInPlace: boolean;
};

export type CancelFlowUnavailable = { available: false; reason: string };

type Loaded = {
  context: CancelFlowContext;
  workspace: WorkspaceRow;
  subscription: SubscriptionRow | null;
  ownerPaidThrough: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function readPlanCodes(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const tier of ['solo', 'manager', 'pro', 'label'] as const) {
    for (const band of budgetBands(tierMonthlyPrice(tier))) {
      const name = retentionPlanEnvVar(tier, band.max);
      out[name] = process.env[name];
    }
  }
  return out;
}

async function readFirstName(admin: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    return cancelFirstName((data as { name: string | null } | null)?.name ?? '');
  } catch {
    return '';
  }
}

async function load(admin: SupabaseClient, user: { id: string; email?: string | null }, now: Date): Promise<Loaded | CancelFlowUnavailable> {
  const team = await getTeamAccessForUser(user.id, user.email ?? null);
  if (!team.primaryWorkspaceId) return { available: false, reason: 'no_team' };
  if (team.ownerUserId !== user.id) return { available: false, reason: 'not_owner' };

  const workspaceResult = await admin
    .from('workspaces')
    .select(
      'id, owner_id, trial_ends_at, comped_at, paid_bonus_days, cancel_discount_claimed_at, cancel_invite_extension_at, trial_cancelled_at'
    )
    .eq('id', team.primaryWorkspaceId)
    .maybeSingle();
  // An error here is usually the migration not being applied yet.
  if (workspaceResult.error || !workspaceResult.data) return { available: false, reason: 'not_ready' };
  const workspace = workspaceResult.data as WorkspaceRow;
  if (workspace.owner_id !== user.id) return { available: false, reason: 'not_owner' };
  if (workspace.comped_at || team.reason === 'owner_allowlisted') return { available: false, reason: 'comped' };

  const subscriptionResult = await admin
    .from('subscriptions')
    .select(
      'id, plan, billing_interval, status, expires_at, paystack_subscription_code, paystack_reference, paused_at, paused_from, paused_until'
    )
    .eq('user_id', user.id)
    .maybeSingle();
  if (subscriptionResult.error) return { available: false, reason: 'not_ready' };
  const subscription = (subscriptionResult.data as SubscriptionRow | null) ?? null;

  const nowMs = now.getTime();
  const expiresMs = subscription?.expires_at ? Date.parse(subscription.expires_at) : Number.NaN;
  const inPeriod = Number.isFinite(expiresMs) && expiresMs > nowMs;
  const status = subscription?.status ?? null;
  const pauseActive = isPauseActive({ status, pausedUntil: subscription?.paused_until, now });

  let kind: CancelFlowKind | null = null;
  let state: CancelFlowState = 'active';
  if (subscription && pauseActive) {
    kind = 'paid';
    state = 'paused';
  } else if (subscription && (status === 'active' || status === 'past_due') && inPeriod) {
    kind = 'paid';
  } else if (subscription && status === 'trialing' && inPeriod) {
    kind = 'trial';
  } else if (subscription && status === 'cancelled' && inPeriod) {
    kind = team.state === 'trial' ? 'trial' : 'paid';
    state = 'cancelled';
  } else if (team.state === 'trial' || team.state === 'grace') {
    kind = 'trial';
    state = workspace.trial_cancelled_at ? 'cancelled' : 'active';
  }
  if (!kind) return { available: false, reason: 'nothing_to_cancel' };

  const ownerPaidThrough = kind === 'paid' ? subscription?.expires_at ?? null : null;
  const bonusDays = Math.max(0, Number(workspace.paid_bonus_days) || 0);
  const accessUntil =
    kind === 'paid'
      ? ownerPaidThrough && Number.isFinite(Date.parse(ownerPaidThrough))
        ? new Date(Date.parse(ownerPaidThrough) + bonusDays * DAY_MS).toISOString()
        : null
      : (subscription?.status === 'trialing' ? subscription.expires_at : workspace.trial_ends_at) ?? null;

  const tier: RetentionTierId | null =
    kind === 'paid' ? (isRetentionTier(subscription?.plan) ? subscription.plan : null) : TRIAL_BAND_TIER;
  const interval: 'monthly' | 'annual' | null =
    kind === 'paid' ? (subscription?.billing_interval === 'annual' ? 'annual' : 'monthly') : null;

  const planCodes = readPlanCodes();
  const bands: CancelFlowBand[] = tier
    ? budgetBands(tierMonthlyPrice(tier)).map((band) => {
        const offer = matchBudgetOffer({ tier, band: band.id, planCodes });
        // A trial has no plan to discount: only "start on the cheaper plan".
        const usable = offer && (kind === 'paid' || offer.kind === 'switch_plan') ? offer : null;
        if (!usable) return { id: band.id, label: band.label, offer: null };
        if (usable.kind === 'switch_plan') return { id: band.id, label: band.label, offer: usable };
        const { planCode: _planCode, ...rest } = usable;
        return { id: band.id, label: band.label, offer: rest };
      })
    : [];

  let hasSeatRoom = false;
  if (kind === 'trial') {
    try {
      hasSeatRoom = (await checkSeatAllowance(admin, workspace.id)).allowed;
    } catch {
      hasSeatRoom = false;
    }
  }

  const pauseAvailable =
    kind === 'paid' &&
    state === 'active' &&
    status === 'active' &&
    canStartPause({ lastPausedAt: subscription?.paused_at, now });

  const context: CancelFlowContext = {
    available: true,
    kind,
    state,
    firstName: await readFirstName(admin, user.id),
    tier,
    interval,
    accessUntil,
    discountAvailable: state === 'active' && isDiscountAvailable({ claimedAt: workspace.cancel_discount_claimed_at, comped: false }),
    inviteAvailable:
      state === 'active' &&
      isInviteExtensionAvailable({ kind, usedAt: workspace.cancel_invite_extension_at, hasSeatRoom }),
    pauseAvailable,
    pauseOptions: pauseAvailable
      ? PAUSE_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
          ...computePauseWindow({ periodEnd: subscription?.expires_at ?? null, option: option.id, now }),
        }))
      : [],
    bands,
    pause: pauseActive && subscription?.paused_until ? { from: subscription.paused_from, until: subscription.paused_until } : null,
    canResumeInPlace:
      kind === 'paid' && state !== 'active' && inPeriod && Boolean(subscription?.paystack_subscription_code),
  };

  return { context, workspace, subscription, ownerPaidThrough };
}

export async function loadCancelFlowContext(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
  now: Date = new Date()
): Promise<CancelFlowContext | CancelFlowUnavailable> {
  try {
    const loaded = await load(admin, user, now);
    return 'context' in loaded ? loaded.context : loaded;
  } catch (error) {
    console.warn('[cancel-flow] context read failed', error);
    return { available: false, reason: 'not_ready' };
  }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export type CancelFlowRecord = {
  flowId: string | null;
  event: CancelFlowEvent;
  offer?: CancelFlowOffer | null;
  reason?: CancelReasonId | null;
  budgetBand?: BudgetBandId | null;
  text?: string | null;
  metadata?: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One cancel_flow_events row and one PostHog event. Never throws: losing a
 *  record must never fail the cancel or the offer it describes. */
export async function recordCancelFlowEvent(
  admin: SupabaseClient,
  input: CancelFlowRecord & { userId: string; workspaceId: string | null; kind: CancelFlowKind | null }
): Promise<void> {
  const flowId = input.flowId && UUID.test(input.flowId) ? input.flowId : crypto.randomUUID();
  const text = input.text ? cleanCancelText(input.text) : '';
  try {
    const { error } = await admin.from(EVENTS_TABLE).insert({
      flow_id: flowId,
      workspace_id: input.workspaceId,
      user_id: input.userId,
      event: input.event,
      offer: input.offer ?? null,
      reason: input.reason ?? null,
      budget_band: input.budgetBand ?? null,
      text_answer: text || null,
      metadata: { ...(input.metadata ?? {}), kind: input.kind },
    });
    if (error) console.warn('[cancel-flow] event not recorded', error.message);
  } catch (error) {
    console.warn('[cancel-flow] event not recorded', error);
  }

  const posthog = createServerPostHogClient();
  try {
    captureServerAnalyticsEvent(
      posthog,
      input.userId,
      createPostHogEvent('cancel_flow_event', {
        event: input.event,
        offer: input.offer ?? null,
        reason: input.reason ?? null,
        budget_band: input.budgetBand ?? null,
        kind: input.kind,
      })
    );
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type CancelFlowActionResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): CancelFlowActionResult => ({ ok: false, status, error });

type ActionUser = { id: string; email?: string | null };

async function loadOrFail(admin: SupabaseClient, user: ActionUser, now: Date): Promise<Loaded | CancelFlowActionResult> {
  try {
    const loaded = await load(admin, user, now);
    if (!('context' in loaded)) {
      return fail(loaded.reason === 'not_owner' ? 403 : 409, 'Only the team owner can change the plan.');
    }
    return loaded;
  } catch (error) {
    console.error('[cancel-flow] load failed', error);
    return fail(500, 'Could not load your plan right now.');
  }
}

const isLoaded = (value: Loaded | CancelFlowActionResult): value is Loaded => 'context' in value;

/** 1. "10% off this month" as 3 bonus days. Once per team, conditional write. */
export async function takeCancelDiscount(admin: SupabaseClient, user: ActionUser, flowId: string | null, now = new Date()) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  const { context, workspace, ownerPaidThrough } = loaded;
  if (!context.discountAvailable) return fail(409, 'This offer was already used.');

  const decision = decideCancelDiscount({
    claimedAt: workspace.cancel_discount_claimed_at,
    comped: Boolean(workspace.comped_at),
    kind: context.kind,
    ownerPaidThrough,
    teamTrialEndsAt: workspace.trial_ends_at,
    paidBonusDays: workspace.paid_bonus_days,
    now,
  });
  if (decision.kind === 'already_claimed' || decision.kind === 'not_needed') {
    return fail(409, 'This offer was already used.');
  }

  const patch: Record<string, unknown> = {
    cancel_discount_claimed_at: now.toISOString(),
    ...(decision.kind === 'trial_extended'
      ? { trial_ends_at: decision.trialEndsAt }
      : { paid_bonus_days: decision.paidBonusDays }),
  };
  const { data: updated, error } = await admin
    .from('workspaces')
    .update(patch)
    .eq('id', workspace.id)
    .is('cancel_discount_claimed_at', null)
    .select('id');
  if (error) return fail(500, 'Could not add the offer right now.');
  if (!Array.isArray(updated) || updated.length === 0) return fail(409, 'This offer was already used.');

  invalidateAllTeamAccess();
  await logBillingEvent(admin, {
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    type: 'cancel_discount_taken',
    metadata: { kind: decision.kind, days: CANCEL_DISCOUNT_BONUS_DAYS, access_until: decision.accessUntil },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'offer_accepted',
    offer: 'discount',
    userId: user.id,
    workspaceId: workspace.id,
    kind: context.kind,
    metadata: { days: CANCEL_DISCOUNT_BONUS_DAYS },
  });
  return { ok: true as const, accessUntil: decision.accessUntil };
}

/** 2. Trial teams: 7 more days for one fresh invite. The invite itself goes
 *  through the existing /api/workspace/members/invite; this checks it landed. */
export async function claimInviteExtension(admin: SupabaseClient, user: ActionUser, flowId: string | null, now = new Date()) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  const { context, workspace } = loaded;
  if (context.kind !== 'trial' || workspace.cancel_invite_extension_at) {
    return fail(409, 'This offer was already used.');
  }

  const { data: invites, error: inviteError } = await admin
    .from('workspace_members')
    .select('id, user_id, status, invited_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'invited')
    .order('invited_at', { ascending: false })
    .limit(5);
  if (inviteError) return fail(500, 'Could not check the invite.');
  const fresh = ((invites ?? []) as Array<{ user_id: string | null; invited_at: string | null }>).some(
    (row) => row.user_id !== user.id && isFreshInvite(row.invited_at, now)
  );
  if (!fresh) return fail(409, 'Send the invite first.');

  const trialEndsAt = computeExtendedTrialEnd(workspace.trial_ends_at, CANCEL_INVITE_EXTENSION_DAYS, now).toISOString();
  const { data: updated, error } = await admin
    .from('workspaces')
    .update({ cancel_invite_extension_at: now.toISOString(), trial_ends_at: trialEndsAt })
    .eq('id', workspace.id)
    .is('cancel_invite_extension_at', null)
    .select('id');
  if (error) return fail(500, 'Could not add the days right now.');
  if (!Array.isArray(updated) || updated.length === 0) return fail(409, 'This offer was already used.');

  invalidateAllTeamAccess();
  await logBillingEvent(admin, {
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    type: 'trial_invite_extension',
    metadata: { days: CANCEL_INVITE_EXTENSION_DAYS, trial_ends_at: trialEndsAt },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'offer_accepted',
    offer: 'invite_extension',
    userId: user.id,
    workspaceId: workspace.id,
    kind: 'trial',
  });
  return { ok: true as const, accessUntil: trialEndsAt };
}

function paystackKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || null;
}

/** 3. Pause. Disables the Paystack subscription now (so the period-end renewal
 *  never happens) and records the window starting at the period end. Access
 *  runs to the period end as it would for any cancel, then the team is
 *  read-only (paid_at) until they resume. */
export async function pausePlan(
  admin: SupabaseClient,
  user: ActionUser,
  flowId: string | null,
  option: PauseOptionId,
  now = new Date()
) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  const { context, workspace, subscription } = loaded;
  if (!context.pauseAvailable || !subscription) return fail(409, 'You can pause once every 6 months.');

  const window = computePauseWindow({ periodEnd: subscription.expires_at, option, now });

  if (subscription.paystack_subscription_code) {
    const key = paystackKey();
    if (!key) return fail(500, 'Payment provider is not configured on the server.');
    const disabled = await disablePaystackSubscription(admin, subscription, key);
    if (!disabled.ok) return fail(disabled.status, disabled.error);
  }

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      paused_at: now.toISOString(),
      paused_from: window.pausedFrom,
      paused_until: window.pausedUntil,
      pause_option: option,
      pause_reminder_sent_at: null,
      updated_at: now.toISOString(),
    })
    .eq('id', subscription.id);
  if (error) {
    // The Paystack side IS disabled, so no charge happens; say so honestly.
    console.error('[cancel-flow] pause row not written', error.message);
    return fail(500, 'Your next charge is stopped, but the pause date did not save. Contact support.');
  }

  invalidateSubscriptionSnapshot(user.id);
  invalidateAllTeamAccess();
  await notifyFounder(admin, {
    kind: 'subscription_paused',
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    note: `Paused ${option}: from ${window.pausedFrom} until ${window.pausedUntil}.`,
    metadata: { option, paused_from: window.pausedFrom, paused_until: window.pausedUntil },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'offer_accepted',
    offer: 'pause',
    userId: user.id,
    workspaceId: workspace.id,
    kind: 'paid',
    metadata: { option, paused_from: window.pausedFrom, paused_until: window.pausedUntil },
  });
  return { ok: true as const, ...window };
}

/**
 * Resume. While the paid period is still running, one tap undoes a cancel or a
 * pause: the Paystack subscription is re-enabled and charges on its own date as
 * before. After the period, the app never charges by itself: it answers with
 * the checkout link, and paying there brings the team back.
 */
export async function resumePlan(admin: SupabaseClient, user: ActionUser, flowId: string | null, now = new Date()) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) {
    // Read-only teams (period long over) have no flow context; send them to pay.
    return { ok: true as const, resumed: false, href: READ_ONLY_REACTIVATE_HREF };
  }
  const { context, workspace, subscription } = loaded;
  if (!context.canResumeInPlace || !subscription) {
    return { ok: true as const, resumed: false, href: READ_ONLY_REACTIVATE_HREF };
  }

  const key = paystackKey();
  if (!key) return fail(500, 'Payment provider is not configured on the server.');
  const enabled = await enablePaystackSubscription(admin, subscription, key);
  if (!enabled.ok) return { ok: true as const, resumed: false, href: READ_ONLY_REACTIVATE_HREF };

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      paused_from: null,
      paused_until: null,
      pause_option: null,
      pause_reminder_sent_at: null,
      updated_at: now.toISOString(),
    })
    .eq('id', subscription.id);
  if (error) console.error('[cancel-flow] resume row not written (Paystack is enabled)', error.message);

  invalidateSubscriptionSnapshot(user.id);
  invalidateAllTeamAccess();
  await logBillingEvent(admin, {
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    type: 'subscription_resumed',
    metadata: { from_state: context.state },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'resumed',
    userId: user.id,
    workspaceId: workspace.id,
    kind: context.kind,
    metadata: { from_state: context.state },
  });
  return { ok: true as const, resumed: true };
}

/** 5. A 3-month budget price. Recorded and handed to the founder, the
 *  plan-change precedent: Paystack has no plan-change endpoint, and an
 *  automated disable-then-create whose second half fails is a team that stops
 *  being charged without anyone noticing. Their plan keeps running as is. */
export async function acceptRetentionOffer(
  admin: SupabaseClient,
  user: ActionUser,
  flowId: string | null,
  band: BudgetBandId,
  now = new Date()
) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  const { context, workspace } = loaded;
  if (context.kind !== 'paid' || !context.tier) return fail(409, 'This offer is not available.');
  const offer = matchBudgetOffer({ tier: context.tier, band, planCodes: readPlanCodes() });
  if (!offer || offer.kind !== 'discounted_plan') return fail(409, 'This offer is not available.');

  const note = `Move to ${offer.planCode} (${context.tier}, ₦${offer.price.toLocaleString('en-US')}/month) at the next renewal for ${offer.months} months, then back to full price.`;
  await notifyFounder(admin, {
    kind: 'retention_offer_accepted',
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    note,
    metadata: { tier: context.tier, price: offer.price, months: offer.months, plan_code: offer.planCode, band },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'offer_accepted',
    offer: 'budget_discounted_plan',
    budgetBand: band,
    reason: 'budget',
    userId: user.id,
    workspaceId: workspace.id,
    kind: 'paid',
    metadata: { tier: context.tier, price: offer.price, months: offer.months },
  });
  return { ok: true as const, price: offer.price, months: offer.months };
}

/** 7. The last button. */
export async function cancelPlan(
  admin: SupabaseClient,
  user: ActionUser,
  flowId: string | null,
  reason: CancelReasonId | null,
  now = new Date()
) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  const { context, workspace, subscription } = loaded;
  if (context.state === 'cancelled') return { ok: true as const, accessUntil: context.accessUntil, already: true };

  const disableSubscription =
    subscription &&
    subscription.paystack_subscription_code &&
    (subscription.status === 'active' || subscription.status === 'past_due' || subscription.status === 'trialing');

  if (disableSubscription) {
    const key = paystackKey();
    if (!key) return fail(500, 'Payment provider is not configured on the server.');
    const disabled = await disablePaystackSubscription(admin, subscription, key);
    if (!disabled.ok) return fail(disabled.status, disabled.error);
  }

  // A paused team cancelling: the subscription is already disabled. Drop the
  // pause so the sweep does not email them about coming back.
  if (subscription && (disableSubscription || context.kind === 'paid')) {
    const { error } = await admin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        paused_from: null,
        paused_until: null,
        pause_option: null,
        updated_at: now.toISOString(),
      })
      .eq('id', subscription.id);
    if (error) console.error('[cancel-flow] cancel row not written (webhook will correct)', error.message);
  }

  if (context.kind === 'trial') {
    const { error } = await admin
      .from('workspaces')
      .update({ trial_cancelled_at: now.toISOString() })
      .eq('id', workspace.id)
      .is('trial_cancelled_at', null);
    if (error) {
      console.error('[cancel-flow] trial cancel not written', error.message);
      return fail(500, 'Could not cancel right now.');
    }
  }

  invalidateSubscriptionSnapshot(user.id);
  invalidateAllTeamAccess();
  await notifyFounder(admin, {
    kind: 'subscription_cancelled',
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_id,
    actorUserId: user.id,
    note: reason ? `Reason: ${reason}.` : 'No reason picked.',
    metadata: { kind: context.kind, reason, access_until: context.accessUntil },
  });
  await recordCancelFlowEvent(admin, {
    flowId,
    event: 'cancelled',
    reason,
    userId: user.id,
    workspaceId: workspace.id,
    kind: context.kind,
    metadata: { access_until: context.accessUntil },
  });
  return { ok: true as const, accessUntil: context.accessUntil };
}

/** Everything else the flow records (screens shown, offers turned down,
 *  answers). Needs the owner, like every action. */
export async function recordCancelFlowStep(
  admin: SupabaseClient,
  user: ActionUser,
  record: CancelFlowRecord,
  now = new Date()
) {
  const loaded = await loadOrFail(admin, user, now);
  if (!isLoaded(loaded)) return loaded;
  await recordCancelFlowEvent(admin, {
    ...record,
    userId: user.id,
    workspaceId: loaded.workspace.id,
    kind: loaded.context.kind,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// The daily sweep (a passenger on /api/cron/notifications, and its own route)
// ---------------------------------------------------------------------------

type PausedRow = {
  id: string;
  user_id: string;
  status: string | null;
  paused_until: string | null;
  pause_reminder_sent_at: string | null;
};

async function sendPauseEmail(
  admin: SupabaseClient,
  row: PausedRow,
  kind: 'pause_ending' | 'pause_ended'
): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    const email = data?.user?.email;
    if (!email) return false;
    const name = data.user?.user_metadata?.name;
    const result = await sendEmail(admin, {
      templateId: 'team_admin_notice',
      to: email,
      props: {
        recipientName: typeof name === 'string' ? name : '',
        kind,
        when: 'now',
        trialEndsAt: null,
        resumeAt: row.paused_until,
      },
      trigger: kind,
      recipientUserId: row.user_id,
      dedupeKey: `${kind}:${row.id}:${row.paused_until}`,
    });
    return result.ok;
  } catch (error) {
    console.warn('[cancel-flow] pause email failed', error);
    return false;
  }
}

/**
 * Reminders a few days before a pause ends, and the end itself. "Ending" a
 * pause clears the window and emails a one-tap resume; it never charges.
 * Never throws; a missing column (migration not applied) is a no-op.
 */
export async function runPauseSweep(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ scanned: number; reminded: number; ended: number }> {
  const out = { scanned: 0, reminded: 0, ended: 0 };
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, user_id, status, paused_until, pause_reminder_sent_at')
      .not('paused_until', 'is', null)
      .limit(200);
    if (error || !Array.isArray(data)) return out;
    const rows = data as PausedRow[];
    out.scanned = rows.length;
    for (const row of rows) {
      const action = pauseSweepAction({
        status: row.status,
        pausedUntil: row.paused_until,
        reminderSentAt: row.pause_reminder_sent_at,
        now,
      });
      if (action === 'remind') {
        await sendPauseEmail(admin, row, 'pause_ending');
        await admin.from('subscriptions').update({ pause_reminder_sent_at: now.toISOString() }).eq('id', row.id);
        out.reminded += 1;
      } else if (action === 'end') {
        // Only email the ones still paused; a team that already paid again just
        // gets its stale window cleared.
        if (row.status === 'cancelled') await sendPauseEmail(admin, row, 'pause_ended');
        await admin
          .from('subscriptions')
          .update({ paused_from: null, paused_until: null, pause_option: null })
          .eq('id', row.id);
        invalidateSubscriptionSnapshot(row.user_id);
        out.ended += 1;
      }
    }
  } catch (error) {
    console.warn('[cancel-flow] pause sweep failed', error);
  }
  return out;
}
