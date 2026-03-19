import { createClient } from '@supabase/supabase-js';

export type SubscriptionAccessState = {
  hasAccess: boolean;
  status: string | null;
  expiresAt: string | null;
  plan: string | null;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PAYWALL_STATUS_CACHE_TTL_MS = 30 * 1000;
let paywallCache: { enabled: boolean; cachedAt: number } | null = null;

const createReadClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const isGlobalPaywallEnabled = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return true;

  if (paywallCache && Date.now() - paywallCache.cachedAt < PAYWALL_STATUS_CACHE_TTL_MS) {
    return paywallCache.enabled;
  }

  try {
    const response = await fetch('/api/paywall-status', {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as { enabled?: unknown };
    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : true;
    paywallCache = { enabled, cachedAt: Date.now() };
    return enabled;
  } catch {
    return true;
  }
};

export const hasActiveSubscription = (subscription: {
  status?: string | null;
  expires_at?: string | null;
}): boolean => {
  const status = String(subscription.status || '').toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return false;

  if (!subscription.expires_at) return true;
  const expiresTs = new Date(subscription.expires_at).getTime();
  if (!Number.isFinite(expiresTs)) return false;
  return expiresTs > Date.now();
};

export const getSubscriptionAccess = async (userId: string): Promise<SubscriptionAccessState> => {
  if (!userId) {
    return {
      hasAccess: false,
      status: null,
      expiresAt: null,
      plan: null,
    };
  }

  const paywallEnabled = await isGlobalPaywallEnabled();
  if (!paywallEnabled) {
    return {
      hasAccess: true,
      status: 'paywall_disabled',
      expiresAt: null,
      plan: null,
    };
  }

  try {
    const supabase = createReadClient();
    if (!supabase) {
      return {
        hasAccess: false,
        status: null,
        expiresAt: null,
        plan: null,
      };
    }
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status,expires_at,plan,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        hasAccess: false,
        status: null,
        expiresAt: null,
        plan: null,
      };
    }

    return {
      hasAccess: hasActiveSubscription(data),
      status: data.status || null,
      expiresAt: data.expires_at || null,
      plan: data.plan || null,
    };
  } catch {
    return {
      hasAccess: false,
      status: null,
      expiresAt: null,
      plan: null,
    };
  }
};
