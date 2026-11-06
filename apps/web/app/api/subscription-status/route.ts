import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../releases/_shared';
import { getAppAccess } from '@/lib/access-gate-server';
import { createAdminClient } from '@/app/api/_shared/auth';
import {
  calculateTrialDaysLeft,
  getSubscriptionSnapshot,
  type SubscriptionSnapshot,
} from '../../../lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import { isCardTrialEnabled, resolveCardTrialRequirement } from '@/lib/trial-card';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser, toTeamAccessPayload } from '@/lib/team-billing-server';
import { purchasableTiers } from '@/lib/billing-plans';
import { isBachsConfigured, shouldOfferBachs } from '@/lib/bachs';
import { loadIntroMonthsLeft } from '@/lib/referrals-server';
import { resolveOnboardingSetupRequired } from '@/lib/onboarding-setup';

// cardTrialRequired — the card-before-trial gate signal (NEXT_PUBLIC_FEATURE_CARD_TRIAL).
//
// True only for a NEW signup (profiles.created_at >= TRIAL_CARD_SIGNUP_CUTOFF)
// with no access, no trial used, a non-curator role, and no active non-owner
// workspace membership (an invited teammate rides the workspace they were
// invited into and must never be asked to pay for it — membership rows are the
// truth here, since role alone is unreliable: existing accounts accepting
// invites keep their old role, while owner rows exist for everyone via the
// lazy workspace bootstrap and are excluded by role != 'owner').
//
// Short-circuits to false unless the snapshot already reads unpaid+untrialed,
// so the two extra admin reads cost nothing for paid/trial/expired accounts.
// Every read failure fails OPEN (false) — the isFirstReleaseRequired doctrine:
// a wrong `true` walls someone out of the product.
// Returned alongside it: onboardingCompleted, so the client can send a
// card-owing account to the right place — the wizard when it has never
// finished onboarding (no release, no plan, no dopamine hit yet), /start-trial
// when it has. null when unknown/not applicable; the client treats anything
// but an explicit false as "onboarded" (see resolveCardTrialDestination).
type CardTrialGateFacts = {
  required: boolean;
  onboardingCompleted: boolean | null;
};

async function computeCardTrialRequired(
  userId: string,
  supabaseUrl: string,
  snapshot: SubscriptionSnapshot
): Promise<CardTrialGateFacts> {
  const notRequired: CardTrialGateFacts = { required: false, onboardingCompleted: null };
  if (!isCardTrialEnabled()) return notRequired;
  if (snapshot.accountStatus !== 'unpaid' || snapshot.trialUsed || snapshot.hasAccess) {
    return notRequired;
  }

  const cutoffIso = process.env.TRIAL_CARD_SIGNUP_CUTOFF;
  if (!cutoffIso?.trim()) {
    // Misconfiguration is otherwise invisible: the gate silently never fires.
    console.warn(
      '[trial-card] NEXT_PUBLIC_FEATURE_CARD_TRIAL is on but TRIAL_CARD_SIGNUP_CUTOFF is unset — the login-time gate is inert.'
    );
    return notRequired;
  }

  const admin = createAdminClient(supabaseUrl);
  if (!admin) return notRequired;

  try {
    const [profileResult, membershipResult] = await Promise.all([
      admin
        .from('profiles')
        .select('created_at, role, onboarding_completed')
        .eq('id', userId)
        .maybeSingle(),
      admin
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .neq('role', 'owner')
        .limit(1),
    ]);

    if (profileResult.error || !profileResult.data) return notRequired;
    if (membershipResult.error) return notRequired;

    const required = resolveCardTrialRequirement({
      enabled: true,
      cutoffIso,
      createdAtIso: profileResult.data.created_at ? String(profileResult.data.created_at) : null,
      accountStatus: snapshot.accountStatus,
      trialUsed: snapshot.trialUsed,
      hasAccess: snapshot.hasAccess,
      role: profileResult.data.role ? String(profileResult.data.role) : null,
      isWorkspaceMember: (membershipResult.data?.length ?? 0) > 0,
    });

    return {
      required,
      onboardingCompleted:
        typeof profileResult.data.onboarding_completed === 'boolean'
          ? profileResult.data.onboarding_completed
          : null,
    };
  } catch {
    return notRequired;
  }
}

// onboardingSetupRequired: a brand-new sign-up (e.g. Google from /auth) that
// never went through /onboarding. Independent of the card-trial flag. See
// lib/onboarding-setup.ts. Fails closed (false) on any read error.
async function computeOnboardingSetupRequired(userId: string, supabaseUrl: string): Promise<boolean> {
  const admin = createAdminClient(supabaseUrl);
  if (!admin) return false;
  try {
    const [profileResult, membershipResult, releaseResult, ownTeamResult] = await Promise.all([
      admin.from('profiles').select('role, onboarding_completed').eq('id', userId).maybeSingle(),
      admin
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .neq('role', 'owner')
        .limit(1),
      admin.from('releases').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId).is('deleted_at', null),
      admin.from('workspaces').select('id').eq('owner_id', userId).limit(1).maybeSingle(),
    ]);
    if (profileResult.error || !profileResult.data || membershipResult.error || releaseResult.error) return false;
    let ownsWork = (releaseResult.count ?? 0) > 0;
    if (!ownsWork && ownTeamResult.data?.id) {
      const records = await admin
        .from('next_records')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ownTeamResult.data.id);
      // An unreadable count is unknown, which fails closed.
      ownsWork = records.error ? true : (records.count ?? 0) > 0;
    }
    return resolveOnboardingSetupRequired({
      onboardingCompleted:
        typeof profileResult.data.onboarding_completed === 'boolean' ? profileResult.data.onboarding_completed : null,
      role: profileResult.data.role ? String(profileResult.data.role) : null,
      isWorkspaceMember: (membershipResult.data?.length ?? 0) > 0,
      ownsWork,
    });
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  // Allowlist bypass — surface allowlisted users to the frontend as paid so
  // every consumer of this endpoint (auth-store redirect, /locked page,
  // subscription-access browser fetch) naturally skips lockout UI.
  if (isAllowlistedEmail(auth.user.email)) {
    console.log(
      `[paywall-allowlist] bypass via subscription-status: user=${auth.user.id} email=${auth.user.email?.trim().toLowerCase()}`
    );
    return NextResponse.json({
      status: 'active',
      hasAccess: true,
      trialEndsAt: null,
      trialDaysLeft: 0,
      expiresAt: null,
      plan: 'allowlist',
      rawStatus: 'allowlisted',
      accountStatus: 'paid',
      trialUsed: false,
      trialStartedAt: null,
      paidAt: null,
      allowlisted: true,
      cardTrialRequired: false,
      onboardingCompleted: null,
      accessApproved: true,
    });
  }

  // Closed sign-up (2026-10-15): the login bounce reads this to hold an
  // account nobody has let in (lib/auth-store.ts ensureActiveAccessOrRedirect).
  const accessApproved = (await getAppAccess(auth.user.id, auth.user.email)).allowed;

  const snapshot = await getSubscriptionSnapshot(auth.user.id);
  const cardTrialFacts = await computeCardTrialRequired(
    auth.user.id,
    auth.supabaseUrl,
    snapshot
  );
  // Only asked for by /auth/callback (?onboardingCheck=1), so every other
  // consumer of this hot endpoint pays nothing extra.
  const onboardingSetupRequired =
    request.nextUrl.searchParams.get('onboardingCheck') === '1'
      ? await computeOnboardingSetupRequired(auth.user.id, auth.supabaseUrl)
      : false;

  // Team access (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). Added ONLY when the flag is
  // on, so with it off this payload is byte-identical to what every existing
  // consumer already reads and costs no extra work. This endpoint is extended
  // rather than joined by a sibling because the login bounce, the in-session
  // gate, the trial indicator, the wall and Settings all fetch it already; a
  // second endpoint would double the round trips on the gate's hot path.
  //
  // ownerEmail is stripped (toTeamAccessPayload): a teammate has no business
  // reading their owner's address out of an API response.
  const teamAccess = isHardPaywallEnabled()
    ? toTeamAccessPayload(await getTeamAccessForUser(auth.user.id, auth.user.email))
    : null;

  // Starting-price months the paying owner has left (2026-10-26), so the wall
  // shows the price the owner would actually be charged.
  const introAdmin = createAdminClient(auth.supabaseUrl);
  const introMonthsLeft = introAdmin
    ? await loadIntroMonthsLeft(introAdmin, teamAccess?.ownerUserId ?? auth.user.id).catch(() => 0)
    : 0;

  return NextResponse.json({
    status: snapshot.status,
    hasAccess: snapshot.hasAccess,
    trialEndsAt: snapshot.trialEndsAt,
    trialDaysLeft: calculateTrialDaysLeft(snapshot.trialEndsAt),
    expiresAt: snapshot.expiresAt,
    plan: snapshot.plan,
    rawStatus: snapshot.rawStatus,
    accountStatus: snapshot.accountStatus,
    trialUsed: snapshot.trialUsed,
    trialStartedAt: snapshot.trialStartedAt,
    paidAt: snapshot.paidAt,
    pendingPlan: snapshot.pendingPlan,
    cardTrialRequired: cardTrialFacts.required,
    onboardingCompleted: cardTrialFacts.onboardingCompleted,
    onboardingSetupRequired,
    accessApproved,
    ...(teamAccess ? { teamAccess } : {}),
    // Which tiers this deployment can actually charge. The wall renders exactly
    // these, so it can never offer a tier whose Paystack Plan has not been
    // minted — see purchasableTiers() for why that gap is worth a field.
    //
    // Sent unconditionally rather than behind the paywall flag: it is a fact
    // about our configuration, not about this user, and the legacy /locked
    // picker may want it later too.
    purchasableTiers: purchasableTiers(),
    introMonthsLeft,
    // Outside Nigeria only, the same rule as checkout (#1103).
    payWithBachs: shouldOfferBachs(isBachsConfigured(), request.headers.get('x-vercel-ip-country')),
  });
}
