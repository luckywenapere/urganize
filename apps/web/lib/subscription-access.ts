import { createClient } from '@supabase/supabase-js';
import { isAnnualPlan } from '@/lib/billing';

export type SubscriptionStatus = 'free_trial' | 'active' | 'expired' | 'cancelled';

type SubscriptionRow = {
  status?: string | null;
  expires_at?: string | null;
  plan?: string | null;
  updated_at?: string | null;
};

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  hasAccess: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  plan: string | null;
  rawStatus: string | null;
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

const isSubscriptionStatus = (value: unknown): value is SubscriptionStatus =>
  value === 'free_trial' || value === 'active' || value === 'expired' || value === 'cancelled';

const parseTimestamp = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const isFutureTimestamp = (value: string | null | undefined, nowMs: number): boolean => {
  const parsed = parseTimestamp(value);
  return Boolean(parsed && parsed.getTime() > nowMs);
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

const resolveSubscriptionSnapshot = (
  subscription: SubscriptionRow | null,
  now = new Date()
): SubscriptionSnapshot => {
  const nowMs = now.getTime();
  const rawStatus = String(subscription?.status || '').trim().toLowerCase() || null;
  const plan = typeof subscription?.plan === 'string' ? subscription.plan : null;
  const expiresAt = typeof subscription?.expires_at === 'string' ? subscription.expires_at : null;

  return {
    status: 'active',
    hasAccess: true,
    trialEndsAt: null,
    expiresAt: null,
    plan: 'annual',
    rawStatus: 'active',
  };
};

const getFallbackSnapshot = (): SubscriptionSnapshot => ({
  status: 'active',
  hasAccess: true,
  trialEndsAt: null,
  expiresAt: null,
  plan: 'annual',
  rawStatus: 'active',
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

    return {
      status: payload.status,
      hasAccess: payload.status === 'free_trial' || payload.status === 'active',
      trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
      plan: typeof payload.plan === 'string' ? payload.plan : null,
      rawStatus: typeof payload.rawStatus === 'string' ? payload.rawStatus : null,
    };
  } catch {
    return null;
  }
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

  try {
    const supabase = createReadClient();
    if (!supabase) {
      return getFallbackSnapshot();
    }

    const subscriptionResult = await supabase
      .from('subscriptions')
      .select('status,expires_at,plan,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionResult.error) {
      return getFallbackSnapshot();
    }

    return resolveSubscriptionSnapshot(
      (subscriptionResult.data || null) as SubscriptionRow | null
    );
  } catch {
    return getFallbackSnapshot();
  }
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const snapshot = await getSubscriptionSnapshot(userId);
  return snapshot.status;
}

export async function hasAccess(userId: string): Promise<boolean> {
  return true;
}
