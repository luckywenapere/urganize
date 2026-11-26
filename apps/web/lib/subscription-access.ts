import { createClient } from '@supabase/supabase-js';
import { applyLifetimeLicense } from './dayzero-shared';

export type SubscriptionStatus = 'free_trial' | 'active' | 'expired' | 'cancelled';

// Four-state account access model, surfaced to the frontend and used by the
// global access gate. Derived from existing subscription state + the new
// profiles.trial_* fields. See supabase/migrations/20260528_payment_gating_trial_fields.sql.
export type AccountStatus = 'unpaid' | 'trial' | 'paid' | 'expired';

type SubscriptionRow = {
  status?: string | null;
  expires_at?: string | null;
  plan?: string | null;
  updated_at?: string | null;
  pending_plan?: string | null;
};

type ProfileAccessRow = {
  is_subscribed?: boolean | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_used?: boolean | null;
  paid_at?: string | null;
};

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  hasAccess: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  plan: string | null;
  rawStatus: string | null;
  accountStatus: AccountStatus;
  trialUsed: boolean;
  trialStartedAt: string | null;
  paidAt: string | null;
  /** subscriptions.pending_plan — a plan the team agreed to move to that has
   *  not started yet. PASSTHROUGH ONLY: nothing in `resolveSnapshot` branches on
   *  it and no access decision reads it, because a pending change never affects
   *  whether a team has access today. It rides along so Settings can name the
   *  move without a second query on this route's hot path. */
  pendingPlan: string | null;
  /** True when a Day Zero lifetime license is what gives this account its plan
   *  (#1393). Then `plan` is 'manager' (Pro) and `expiresAt` is null. Absent or
   *  false for everyone else. */
  lifetime?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const createReadClient = () => {
  const accessKey = typeof window === 'undefined' && serviceRoleKey ? serviceRoleKey : supabaseAnonKey;
  if (!supabaseUrl || !accessKey) {
    return null;
  }

  return createClient(supabaseUrl, accessKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const isAccountStatus = (value: unknown): value is AccountStatus =>
  value === 'unpaid' || value === 'trial' || value === 'paid' || value === 'expired';

const isSubscriptionStatus = (value: unknown): value is SubscriptionStatus =>
  value === 'free_trial' || value === 'active' || value === 'expired' || value === 'cancelled';

const parseTimestamp = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const calculateTrialDaysLeft = (
  trialEndsAt: string | null,
  now = new Date()
): number => {
  const parsedTrialEnd = parseTimestamp(trialEndsAt);
  if (!parsedTrialEnd) {
    return 0;
  }

  const diffMs = parsedTrialEnd.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / DAY_MS);
};

// Exported for lib/subscription-access.test.ts — this pure function IS the
// four-state access model (unpaid | trial | paid | expired); everything else
// in this module is I/O around it.
export const resolveSnapshot = (
  subscription: SubscriptionRow | null,
  profile: ProfileAccessRow | null,
  now = new Date()
): SubscriptionSnapshot => {
  const rawStatus = subscription?.status || null;
  const subExpiresAt = parseTimestamp(subscription?.expires_at);
  const plan = subscription?.plan || null;
  const subExpiresAtStr = subscription?.expires_at || null;
  const isSubExpired = subExpiresAt !== null && subExpiresAt.getTime() <= now.getTime();

  const profileTrialUsed = Boolean(profile?.trial_used);
  const profileTrialEndsAtStr = profile?.trial_ends_at || null;
  const profileTrialEndsAt = parseTimestamp(profileTrialEndsAtStr);
  const profileTrialActive =
    profileTrialEndsAt !== null && profileTrialEndsAt.getTime() > now.getTime();

  // 1. Paid: any active subscription that has not expired. 'past_due' is
  // included deliberately — the webhook writes it on invoice.payment_failed
  // while Paystack retries the charge, and the user's already-paid window
  // (expires_at) hasn't lapsed. Both the webhook and billing-plans.ts
  // document this contract ("the snapshot resolver treats past_due + not
  // expired as paid"); until 2026-07-10 it only held by accident via the
  // is_subscribed back-compat branch below.
  if (
    (rawStatus === 'active' || rawStatus === 'cancelled' || rawStatus === 'past_due') &&
    !isSubExpired
  ) {
    return {
      status: 'active',
      hasAccess: true,
      trialEndsAt: null,
      expiresAt: subExpiresAtStr,
      plan,
      rawStatus,
      accountStatus: 'paid',
      trialUsed: profileTrialUsed,
      trialStartedAt: profile?.trial_started_at || null,
      paidAt: profile?.paid_at || null,
      pendingPlan: subscription?.pending_plan ?? null,
    };
  }

  // 1b. Back-compat: legacy is_subscribed=true without an active subscription
  // row. The existing paying user predates the subscriptions table being the
  // single source of truth; honor the profile flag so they don't get locked
  // out the moment this gate ships. Production-credited webhook payments
  // write both, so new users go through path 1.
  if (profile?.is_subscribed === true) {
    return {
      status: 'active',
      hasAccess: true,
      trialEndsAt: null,
      expiresAt: subExpiresAtStr,
      plan,
      rawStatus,
      accountStatus: 'paid',
      trialUsed: profileTrialUsed,
      trialStartedAt: profile?.trial_started_at || null,
      paidAt: profile?.paid_at || null,
      pendingPlan: subscription?.pending_plan ?? null,
    };
  }

  // 2. Legacy server-side trial expressed via subscriptions.status. Kept for
  //    back-compat — the new product flow uses the profiles trial fields.
  if ((rawStatus === 'trialing' || rawStatus === 'free_trial') && !isSubExpired) {
    return {
      status: 'free_trial',
      hasAccess: true,
      trialEndsAt: subExpiresAtStr,
      expiresAt: subExpiresAtStr,
      plan,
      rawStatus,
      accountStatus: 'trial',
      trialUsed: profileTrialUsed,
      trialStartedAt: profile?.trial_started_at || null,
      paidAt: profile?.paid_at || null,
      pendingPlan: subscription?.pending_plan ?? null,
    };
  }

  // 3. Profile-driven trial active.
  if (profileTrialActive) {
    return {
      status: 'free_trial',
      hasAccess: true,
      trialEndsAt: profileTrialEndsAtStr,
      expiresAt: profileTrialEndsAtStr,
      plan: null,
      rawStatus,
      accountStatus: 'trial',
      trialUsed: true,
      trialStartedAt: profile?.trial_started_at || null,
      paidAt: profile?.paid_at || null,
      pendingPlan: subscription?.pending_plan ?? null,
    };
  }

  // 4. Has used trial or had a subscription that lapsed → expired.
  const hadAccess =
    profileTrialUsed || rawStatus !== null || Boolean(profile?.paid_at);
  if (hadAccess) {
    return {
      status: 'expired',
      hasAccess: false,
      trialEndsAt: profileTrialEndsAtStr,
      expiresAt: subExpiresAtStr,
      plan,
      rawStatus,
      accountStatus: 'expired',
      trialUsed: profileTrialUsed,
      trialStartedAt: profile?.trial_started_at || null,
      paidAt: profile?.paid_at || null,
      pendingPlan: subscription?.pending_plan ?? null,
    };
  }

  // 5. Never paid, never trialed.
  return {
    status: 'expired',
    hasAccess: false,
    trialEndsAt: null,
    expiresAt: null,
    plan: null,
    rawStatus: null,
    accountStatus: 'unpaid',
    trialUsed: false,
    trialStartedAt: null,
    paidAt: null,
    pendingPlan: subscription?.pending_plan ?? null,
  };
};

// Server fallback when DB reads can't run. Returns no-access so the global
// gate fails closed: a misconfigured env should lock the app, not open it.
// In dev this surfaces config issues immediately; in prod it matches the
// app's "gate everything" posture.
const getFallbackSnapshot = (): SubscriptionSnapshot => ({
  status: 'expired',
  hasAccess: false,
  trialEndsAt: null,
  expiresAt: null,
  plan: null,
  rawStatus: null,
  accountStatus: 'unpaid',
  trialUsed: false,
  trialStartedAt: null,
  paidAt: null,
  pendingPlan: null,
});

async function fetchSnapshotFromApi(userId: string): Promise<SubscriptionSnapshot | null> {
  if (!userId) {
    return null;
  }

  try {
    const { supabase } = await import('./supabase/client');
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || '';
    if (!accessToken) {
      return null;
    }

    const response = await fetch('/api/subscription-status', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => ({}))) as Partial<SubscriptionSnapshot>;
    if (!response.ok || !isSubscriptionStatus(payload.status)) {
      return null;
    }

    const accountStatus = isAccountStatus(payload.accountStatus)
      ? payload.accountStatus
      : payload.status === 'active'
        ? 'paid'
        : payload.status === 'free_trial'
          ? 'trial'
          : 'expired';

    return {
      status: payload.status,
      hasAccess: accountStatus === 'paid' || accountStatus === 'trial',
      trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
      plan: typeof payload.plan === 'string' ? payload.plan : null,
      rawStatus: typeof payload.rawStatus === 'string' ? payload.rawStatus : null,
      accountStatus,
      trialUsed: Boolean(payload.trialUsed),
      trialStartedAt: typeof payload.trialStartedAt === 'string' ? payload.trialStartedAt : null,
      paidAt: typeof payload.paidAt === 'string' ? payload.paidAt : null,
      pendingPlan: typeof payload.pendingPlan === 'string' ? payload.pendingPlan : null,
      lifetime: payload.lifetime === true,
    };
  } catch {
    return null;
  }
}

// Server-side snapshot cache. Every protected API request pays this lookup
// (two DB reads via requireActiveAccount) before doing any real work, yet the
// underlying subscription/trial state only changes on rare payment events.
// A short positive-only TTL cache removes the repeated reads on warm
// serverless instances:
//   - Only snapshots WITH access are cached. A blocked/fallback snapshot is
//     never cached, so the fail-closed path stays live (a DB blip can't lock
//     a user out for the TTL) and a just-paid user is unlocked by their very
//     next request rather than a stale negative entry.
//   - Payment mutation routes call invalidateSubscriptionSnapshot so the
//     instance that processed the event refreshes immediately; other warm
//     instances converge within the TTL. Worst case for a lapsed user is
//     TTL seconds of grace — subscription expiry granularity is days.
const SNAPSHOT_CACHE_TTL_MS = 30_000;
const SNAPSHOT_CACHE_MAX_ENTRIES = 1_000;
const snapshotCache = new Map<string, { snapshot: SubscriptionSnapshot; expiresAt: number }>();

export function invalidateSubscriptionSnapshot(userId: string) {
  if (userId) {
    snapshotCache.delete(userId);
  }
}

function readCachedSnapshot(userId: string): SubscriptionSnapshot | null {
  const entry = snapshotCache.get(userId);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    snapshotCache.delete(userId);
    return null;
  }
  return entry.snapshot;
}

function writeCachedSnapshot(userId: string, snapshot: SubscriptionSnapshot) {
  if (!snapshot.hasAccess) {
    return;
  }
  if (snapshotCache.size >= SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldestKey = snapshotCache.keys().next().value;
    if (oldestKey !== undefined) {
      snapshotCache.delete(oldestKey);
    }
  }
  snapshotCache.set(userId, { snapshot, expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS });
}

export async function getSubscriptionSnapshot(userId: string): Promise<SubscriptionSnapshot> {
  if (!userId) {
    return getFallbackSnapshot();
  }

  if (typeof window !== 'undefined') {
    const browserSnapshot = await fetchSnapshotFromApi(userId);
    if (browserSnapshot) {
      return browserSnapshot;
    }
  }

  const cached = typeof window === 'undefined' ? readCachedSnapshot(userId) : null;
  if (cached) {
    return cached;
  }

  try {
    const supabase = createReadClient();
    if (!supabase) {
      return getFallbackSnapshot();
    }

    const [subscriptionResult, profileResult, licenseResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status,expires_at,plan,updated_at,pending_plan')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('is_subscribed,trial_started_at,trial_ends_at,trial_used,paid_at')
        .eq('id', userId)
        .maybeSingle(),
      // Day Zero lifetime license (#1393). An error (the table not there yet, or
      // the anon key in a browser) reads as "no license", so this can only add
      // access, never take it away.
      supabase
        .from('dayzero_licenses')
        .select('license_key')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1),
    ]);

    if (subscriptionResult.error && profileResult.error) {
      return getFallbackSnapshot();
    }

    const snapshot = applyLifetimeLicense(
      resolveSnapshot(
        (subscriptionResult.data || null) as SubscriptionRow | null,
        (profileResult.data || null) as ProfileAccessRow | null
      ),
      !licenseResult.error && (licenseResult.data?.length ?? 0) > 0
    );

    if (typeof window === 'undefined') {
      writeCachedSnapshot(userId, snapshot);
    }

    return snapshot;
  } catch {
    return getFallbackSnapshot();
  }
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const snapshot = await getSubscriptionSnapshot(userId);
  return snapshot.status;
}

export async function hasAccess(userId: string): Promise<boolean> {
  const snapshot = await getSubscriptionSnapshot(userId);
  return snapshot.hasAccess;
}
