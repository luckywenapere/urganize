export type SubscriptionAccessState = {
  hasAccess: boolean;
  status: string | null;
  expiresAt: string | null;
  plan: string | null;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

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
  void userId;
  return {
    hasAccess: true,
    status: 'active',
    expiresAt: null,
    plan: 'lifetime',
  };
};
