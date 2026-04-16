'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import type { SubscriptionStatus } from '@/lib/subscription-access';

type PaywallState = {
  status: SubscriptionStatus;
  hasAccess: boolean;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  isLoading: boolean;
};

type PaywallApiResponse = {
  status?: SubscriptionStatus;
  hasAccess?: boolean;
  trialDaysLeft?: number;
  trialEndsAt?: string | null;
};

const getDefaultState = (isLoading = true): PaywallState => ({
  status: 'expired',
  hasAccess: false,
  trialDaysLeft: 0,
  trialEndsAt: null,
  isLoading,
});

export function usePaywall() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const [state, setState] = useState<PaywallState>(getDefaultState(true));

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (authLoading) {
        if (!cancelled) {
          setState(getDefaultState(true));
        }
        return;
      }

      if (!user?.id) {
        if (!cancelled) {
          setState(getDefaultState(false));
        }
        return;
      }

      if (!cancelled) {
        setState((current) => ({ ...current, isLoading: true }));
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token || '';
        if (!accessToken) {
          if (!cancelled) {
            setState(getDefaultState(false));
          }
          return;
        }

        const response = await fetch('/api/subscription-status', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as PaywallApiResponse;
        const status = payload.status || 'expired';
        const hasAccess = Boolean(payload.hasAccess);
        const trialDaysLeft = Math.max(0, Number(payload.trialDaysLeft || 0));
        const trialEndsAt = typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null;

        if (!cancelled) {
          setState({
            status,
            hasAccess,
            trialDaysLeft,
            trialEndsAt,
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState(getDefaultState(false));
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  return {
    ...state,
    refresh: async () => {
      if (!user?.id || authLoading) {
        return;
      }

      setState((current) => ({ ...current, isLoading: true }));

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token || '';
        if (!accessToken) {
          setState(getDefaultState(false));
          return;
        }

        const response = await fetch('/api/subscription-status', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as PaywallApiResponse;
        setState({
          status: payload.status || 'expired',
          hasAccess: Boolean(payload.hasAccess),
          trialDaysLeft: Math.max(0, Number(payload.trialDaysLeft || 0)),
          trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
          isLoading: false,
        });
      } catch {
        setState(getDefaultState(false));
      }
    },
  };
}
