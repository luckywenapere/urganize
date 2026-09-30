// One team's access, worked out from the raw rows an admin surface has already
// read. Pure. Moved out of app/api/admin/teams/route.ts (2026-09-30) when the
// admin email composer needed the same answer for its "on a free trial",
// "paying" and "trial ended" groups: two copies of "is this subscription still
// live" would drift, and the founder would email the wrong people.

import { isAllowlistedEmail } from './paywall-allowlist';
import { lapsedFromPayment, resolveTeamAccess, type TeamAccessResolution } from './team-billing';

export type AdminTeamWorkspaceFields = {
  trial_started_at: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  billing_plan: string | null;
  billing_locked_amount: number | null;
};

export type AdminTeamOwnerProfile = {
  email: string | null;
  is_subscribed: boolean | null;
  paid_at: string | null;
};

export type AdminTeamSubscription = {
  status: string | null;
  expires_at: string | null;
};

export function resolveAdminTeamAccess(input: {
  workspace: AdminTeamWorkspaceFields;
  profile: AdminTeamOwnerProfile | null | undefined;
  subscription: AdminTeamSubscription | null | undefined;
  now: Date;
}): { resolution: TeamAccessResolution; subscriptionActive: boolean; ownerAllowlisted: boolean } {
  const { profile, subscription, now } = input;

  const expiresMs = subscription?.expires_at ? Date.parse(subscription.expires_at) : Number.NaN;
  const inPeriod = Number.isFinite(expiresMs) ? expiresMs > now.getTime() : false;
  const subscriptionActive =
    Boolean(subscription) &&
    ['active', 'trialing', 'past_due', 'cancelled'].includes(String(subscription?.status)) &&
    inPeriod;

  const ownerHasAccess = subscriptionActive || profile?.is_subscribed === true;
  const ownerAllowlisted = isAllowlistedEmail(profile?.email);

  const resolution = resolveTeamAccess({
    ownerHasAccess,
    ownerAllowlisted,
    ownerLapsedFromPayment: lapsedFromPayment({
      ownerHasAccess,
      ownerPaidAt: profile?.paid_at ?? null,
    }),
    team: {
      trialStartedAt: input.workspace.trial_started_at,
      trialEndsAt: input.workspace.trial_ends_at,
      compedAt: input.workspace.comped_at,
      billingPlan: input.workspace.billing_plan,
      billingLockedAmount: input.workspace.billing_locked_amount,
    },
    now,
  });

  return { resolution, subscriptionActive, ownerAllowlisted };
}
