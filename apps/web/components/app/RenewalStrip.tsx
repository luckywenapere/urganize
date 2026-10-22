'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { checkoutPath, renewalBannerText, type CheckoutPlan } from '@/lib/self-serve';
import type { BillingInterval } from '@urganize/pricing';

// Self-serve checkout (2026-10-22). A period paid by bank transfer does not
// renew by itself, so from 7 days out the owner sees one calm line above the
// top bar with "Renew", which opens the same checkout. The TeamTrialStrip
// contract: above the top bar, one line, no red, not dismissible, gone the
// moment the team renews. Card teams never see it.

type Due = { due: true; plan: CheckoutPlan; period: BillingInterval; daysLeft: number };

export function RenewalStrip() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [due, setDue] = useState<Due | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/billing/renewal', {
          headers: { Authorization: `Bearer ${token}`, 'x-urganize-prefetch': '1' },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json()) as Due | { due: false };
        if (!cancelled && payload.due) setDue(payload);
      } catch {
        // A strip that cannot load stays away.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  if (!due) return null;
  const text = renewalBannerText(due.plan, due.daysLeft);
  const href = `${checkoutPath({ plan: due.plan, period: due.period })}&method=transfer`;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">{text.title}</span> {text.body}
      </p>
      <Link
        href={href}
        onClick={() =>
          captureAnalyticsEvent(
            createPostHogEvent('renewal_clicked', { path: 'self_serve', plan: due.plan, days: due.daysLeft, source: 'banner' }),
            { userId }
          )
        }
        className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-brand px-4 text-sm font-semibold text-content-inverse"
      >
        Renew
      </Link>
    </div>
  );
}
