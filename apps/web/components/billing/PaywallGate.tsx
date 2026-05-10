'use client';

import { type ReactNode } from 'react';
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
  return (
    <>
      {children({
        status: 'active',
        hasAccess: true,
        trialDaysLeft: 0,
        isLoading: false,
        guard: (action) => async (...args) => { await action(...args); },
        requireAccess: async (action) => action(),
        openPaywall: () => {},
      })}
    </>
  );
}
