'use client';

import { useState, type ReactNode } from 'react';
import { PaywallModal } from '@/components/billing/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import type { SubscriptionStatus } from '@/lib/subscription-access';

type GuardedAction<Args extends unknown[]> = (...args: Args) => void | Promise<void>;

type PaywallGateRenderProps = {
  status: SubscriptionStatus;
  hasAccess: boolean;
  trialDaysLeft: number;
  isLoading: boolean;
  guard: <Args extends unknown[]>(action: GuardedAction<Args>) => (...args: Args) => Promise<void>;
  requireAccess: <T>(action: () => T | Promise<T>) => Promise<T | undefined>;
  openPaywall: () => void;
};

type PaywallGateProps = {
  children: (props: PaywallGateRenderProps) => ReactNode;
};

export function PaywallGate({ children }: PaywallGateProps) {
  const { status, hasAccess, trialDaysLeft, isLoading } = usePaywall();
  const [showPaywall, setShowPaywall] = useState(false);

  const openPaywall = () => {
    setShowPaywall(true);
  };

  const requireAccess = async <T,>(action: () => T | Promise<T>) => {
    if (isLoading) {
      return undefined;
    }

    if (!hasAccess) {
      openPaywall();
      return undefined;
    }

    return action();
  };

  const guard = <Args extends unknown[]>(action: GuardedAction<Args>) => {
    return async (...args: Args) => {
      await requireAccess(() => action(...args));
    };
  };

  return (
    <>
      {children({
        status,
        hasAccess,
        trialDaysLeft,
        isLoading,
        guard,
        requireAccess,
        openPaywall,
      })}
      {showPaywall ? <PaywallModal status={status} trialDaysLeft={trialDaysLeft} /> : null}
    </>
  );
}
