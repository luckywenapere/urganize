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
